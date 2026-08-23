import { statSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, resolve, isAbsolute, basename, sep } from 'node:path'
import * as esbuild from 'esbuild'

async function bundleConnector({ connectorPath, distPath, repoRoot }: BundleConnectorParams): Promise<BundleResult> {
    const entryFile = join(connectorPath, 'src', 'index.ts')
    if (!existsSync(entryFile)) {
        throw new Error(`[bundleConnector] no entry at ${entryFile}`)
    }

    const manifest = readConnectorManifest(connectorPath)
    const { inlineAll, inlineList, excludeList } = readInlineConfig(manifest)
    const outfile = join(distPath, BUNDLE_FILENAME)

    // Pass 1: inline everything safe. Known-native packages are externalized upfront so a
    // native .node binary can never be pulled into the bundle.
    let pass = await runEsbuild({ entryFile, outfile, repoRoot, inlineAll, inlineList, external: new Set(excludeList) })

    // A dynamic/indirect require (or a stray .node) can only be detected after esbuild has tried
    // to trace it. If pass 1 surfaced any such unsafe package, externalize it and rebuild ONCE —
    // auto-externalize the offending dep instead of failing the whole connector. Only the handful of
    // connectors with dynamic-require deps (couchbase, metabase, text-helper, scrapeless) hit pass 2.
    const unsafe = new Set([
        ...unsafePackages({ metafile: pass.result.metafile, warnings: pass.result.warnings }),
        ...importMetaPackages(pass.result.metafile),
    ])
    if (unsafe.size > 0) {
        pass = await runEsbuild({ entryFile, outfile, repoRoot, inlineAll, inlineList, external: new Set([...excludeList, ...unsafe]) })
    }

    // Anything still broken after auto-externalization is a genuine un-resolvable bug — fail loud.
    let issues = gateBundle({ metafile: pass.result.metafile, warnings: pass.result.warnings })
    if (issues.length > 0) {
        throw new Error(`[bundleConnector] ${connectorPath} failed the safety gate:\n  - ${issues.join('\n  - ')}`)
    }

    // Size fallback: inlining a very large SDK (e.g. datadog's 7.7 MB API client) blows the cap.
    // Rather than fail, fall back to external-by-default for this connector — its third-party deps
    // install at runtime and the bundle stays small. Keeps every connector building and lean.
    if (inlineAll && statSync(outfile).size > FAIL_BYTES) {
        pass = await runEsbuild({ entryFile, outfile, repoRoot, inlineAll: false, inlineList: new Set(), external: new Set(excludeList) })
        issues = gateBundle({ metafile: pass.result.metafile, warnings: pass.result.warnings })
        if (issues.length > 0) {
            throw new Error(`[bundleConnector] ${connectorPath} failed the safety gate (external fallback):\n  - ${issues.join('\n  - ')}`)
        }
    }

    assertDirnameUsageDeclared({ connectorPath, metafile: pass.result.metafile, manifest })
    const forked = await bundleForkedEntries({ connectorPath, distPath, repoRoot, manifest, inlineAll, inlineList, excludeList })
    for (const dep of forked.externalized) {
        pass.externalized.add(dep)
    }

    const bundleBytes = statSync(outfile).size
    const rawBytes = totalInputBytes(pass.result.metafile)
    const external = [...pass.externalized].filter((dep) => !dep.startsWith('@fema-ipaas/') && !BUNDLE_HELPER_DEPS.has(dep))

    enforceSizeGate({ connectorPath, bundleBytes })

    return { bundleFile: outfile, bundleBytes, rawBytes, external, inlined: [...pass.inlined], extraBundleFiles: forked.files }
}

async function bundleForkedEntries({ connectorPath, distPath, repoRoot, manifest, inlineAll, inlineList, excludeList }: ForkedEntriesParams): Promise<ForkedEntriesResult> {
    const files: string[] = []
    const externalized = new Set<string>()
    for (const entry of manifest.bundleForkedEntries ?? []) {
        const entryFile = join(connectorPath, entry)
        if (!existsSync(entryFile)) {
            throw new Error(`[bundleConnector] bundleForkedEntries: no file at ${entryFile}`)
        }
        const outRel = `src/${basename(entry).replace(/\.ts$/, '.js')}`
        if (outRel === BUNDLE_FILENAME) {
            throw new Error(`[bundleConnector] bundleForkedEntries: "${entry}" collides with the main bundle at ${BUNDLE_FILENAME}`)
        }
        if (files.some((file) => file.toLowerCase() === outRel.toLowerCase())) {
            throw new Error(`[bundleConnector] bundleForkedEntries: "${entry}" collides with another declared entry at ${outRel}`)
        }
        const outfile = join(distPath, outRel)
        let pass = await runEsbuild({ entryFile, outfile, repoRoot, inlineAll, inlineList, external: new Set(excludeList) })
        const unsafe = new Set([
            ...unsafePackages({ metafile: pass.result.metafile, warnings: pass.result.warnings }),
            ...importMetaPackages(pass.result.metafile),
        ])
        if (unsafe.size > 0) {
            pass = await runEsbuild({ entryFile, outfile, repoRoot, inlineAll, inlineList, external: new Set([...excludeList, ...unsafe]) })
        }
        const issues = gateBundle({ metafile: pass.result.metafile, warnings: pass.result.warnings })
        if (issues.length > 0) {
            throw new Error(`[bundleConnector] ${connectorPath} forked entry "${entry}" failed the safety gate:\n  - ${issues.join('\n  - ')}`)
        }
        enforceSizeGate({ connectorPath: `${connectorPath} (${entry})`, bundleBytes: statSync(outfile).size })
        files.push(outRel)
        for (const dep of pass.externalized) {
            externalized.add(dep)
        }
    }
    return { files, externalized }
}

function assertDirnameUsageDeclared({ connectorPath, metafile, manifest }: DirnameGateParams): void {
    if ((manifest.bundleForkedEntries ?? []).length > 0) {
        return
    }
    const connectorRoot = realPath(connectorPath)
    for (const input of Object.keys(metafile.inputs)) {
        const abs = realPath(resolve(process.cwd(), input))
        if (!abs.startsWith(connectorRoot + sep) || abs.includes(`${sep}node_modules${sep}`)) {
            continue
        }
        if (/\b__dirname\b/.test(safeReadFile(abs))) {
            throw new Error(
                `[bundleConnector] ${input} uses __dirname but the connector declares no bundleForkedEntries. `
                + 'The published connector is a single bundled src/index.js, so __dirname-relative file access breaks after publish. '
                + 'Declare the runtime-loaded file in package.json "bundleForkedEntries" (it will be emitted beside the bundle), or remove the __dirname usage.',
            )
        }
    }
}

function realPath(file: string): string {
    try {
        return realpathSync(resolve(file))
    }
    catch {
        return resolve(file)
    }
}

function safeReadFile(file: string): string {
    try {
        return readFileSync(file, 'utf-8')
    }
    catch {
        return ''
    }
}

async function runEsbuild({ entryFile, outfile, repoRoot, inlineAll, inlineList, external }: RunEsbuildParams): Promise<EsbuildPass> {
    const inlined = new Set<string>()
    const externalized = new Set<string>()
    const result = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        outfile,
        minify: true,
        // The engine extracts a connector by scanning module exports for one whose
        // `constructor.name === 'Connector'` (see extractConnectorFromModule). Minification would
        // otherwise mangle the Connector class name and make every bundled connector un-installable.
        keepNames: true,
        treeShaking: true,
        metafile: true,
        logLevel: 'silent',
        alias: workspaceAliases(repoRoot),
        plugins: [externalizeThirdParty({ inlineAll, inlineList, external, inlined, externalized })],
        loader: { '.node': 'file' },
    })
    return { result, inlined, externalized }
}

function readConnectorManifest(connectorPath: string): ConnectorManifest {
    const pkgPath = join(connectorPath, 'package.json')
    if (!existsSync(pkgPath)) {
        return {}
    }
    return JSON.parse(readFileSync(pkgPath, 'utf-8'))
}

// Inline-by-default. Third-party deps are bundled in unless they cannot be safely inlined
// (native addons / dynamic require — those are auto-externalized by the safety gate):
//   bundleDeps absent / true → inline every third-party dep (default)
//   bundleDeps === ['a','b']  → inline only these
//   bundleDeps === false      → externalize all third-party (explicit opt-out / escape hatch)
// `excludeList` (known-native packages) is always kept external, even under inline-all.
function readInlineConfig(manifest: ConnectorManifest): InlineConfig {
    const value = manifest.bundleDeps
    const excludeList = new Set(NATIVE_EXTERNALS)
    if (value === false) {
        return { inlineAll: false, inlineList: new Set(), excludeList }
    }
    if (Array.isArray(value)) {
        return { inlineAll: false, inlineList: new Set(value), excludeList }
    }
    return { inlineAll: true, inlineList: new Set(), excludeList }
}

// Only @fema-ipaas/* workspace code and relative/absolute imports are always bundled in.
// Node builtins and packages in `external` (known-native + auto-externalized dynamic-require
// deps) are kept external. Everything else is inlined when inlineAll / listed in inlineList.
function externalizeThirdParty({ inlineAll, inlineList, external, inlined, externalized }: ExternalizeParams): esbuild.Plugin {
    return {
        name: 'externalize-third-party',
        setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === 'entry-point') {
                    return null
                }
                const id = args.path
                if (id.startsWith('.') || isAbsolute(id)) {
                    return null
                }
                if (id.startsWith('@fema-ipaas/')) {
                    return null
                }
                if (id.startsWith('node:') || NODE_BUILTINS.has(id)) {
                    return { path: id, external: true }
                }
                const top = topLevelPkg(id)
                if (external.has(top)) {
                    externalized.add(top)
                    return { path: id, external: true }
                }
                if (inlineAll || inlineList.has(top)) {
                    inlined.add(top)
                    return null
                }
                externalized.add(top)
                return { path: id, external: true }
            })
        },
    }
}

// The packages that cannot be safely inlined and must be externalized: a `.node` native addon
// that slipped in, or a dynamic/indirect require esbuild could not trace (HAZARD_WARNING_IDS).
// Maps each back to its top-level package so the caller can rebuild with them externalized.
function unsafePackages({ metafile, warnings }: GateParams): Set<string> {
    const pkgs = new Set<string>()
    for (const input of Object.keys(metafile.inputs)) {
        if (input.endsWith('.node')) {
            const pkg = pkgOfInput(input)
            if (pkg !== null) {
                pkgs.add(pkg)
            }
        }
    }
    for (const warning of warnings) {
        if (!HAZARD_WARNING_IDS.has(warning.id)) {
            continue
        }
        const file = warning.location?.file
        const pkg = file ? pkgOfInput(file) : null
        if (pkg !== null) {
            pkgs.add(pkg)
        }
    }
    return pkgs
}

// esbuild rewrites `import.meta` to `{}` in CJS output (silently), so an inlined package relying on
// it (e.g. openpgp's `createRequire(import.meta.url)`) crashes at load. Externalize such packages so
// they install and run in their own module context instead.
function importMetaPackages(metafile: esbuild.Metafile): Set<string> {
    const pkgs = new Set<string>()
    for (const input of Object.keys(metafile.inputs)) {
        const pkg = pkgOfInput(input)
        if (pkg === null || pkgs.has(pkg)) {
            continue
        }
        if (usesImportMeta(resolve(process.cwd(), input))) {
            pkgs.add(pkg)
        }
    }
    return pkgs
}

function usesImportMeta(file: string): boolean {
    try {
        return /\bimport\.meta\b/.test(readFileSync(file, 'utf-8'))
    }
    catch {
        return false
    }
}

// Build-time safety gate, evaluated on the FINAL pass. By now native/dynamic-require deps have
// been auto-externalized, so any inlined native addon, inlined known-native package, or surviving
// runtime-hazard warning means a genuinely un-resolvable bundle — fail the build instead.
function gateBundle({ metafile, warnings }: GateParams): string[] {
    const issues: string[] = []
    const inputs = Object.keys(metafile.inputs)
    for (const input of inputs) {
        if (input.endsWith('.node')) {
            issues.push(`native addon inlined: ${input}`)
        }
    }
    const inlinedPkgs = new Set(inputs.map(pkgOfInput).filter((pkg): pkg is string => pkg !== null))
    for (const pkg of inlinedPkgs) {
        if (NATIVE_EXTERNALS.has(pkg)) {
            issues.push(`known-native package inlined: ${pkg}`)
        }
    }
    // Only warnings that mean "this will break once bundled" are blocking. Lint-style
    // warnings (duplicate object key, suspicious typeof, …) are surfaced but not fatal.
    for (const warning of warnings) {
        const where = warning.location ? ` (${warning.location.file}:${warning.location.line})` : ''
        if (HAZARD_WARNING_IDS.has(warning.id)) {
            issues.push(`${warning.text}${where}`)
        }
        else {
            console.warn(`[bundleConnector] non-fatal warning: ${warning.text}${where}`)
        }
    }
    return issues
}

// 'node_modules/@scope/n/x' → '@scope/n', 'node_modules/pkg/lib/x' → 'pkg'.
function pkgOfInput(input: string): string | null {
    const marker = 'node_modules/'
    const index = input.lastIndexOf(marker)
    if (index === -1) {
        return null
    }
    return topLevelPkg(input.slice(index + marker.length))
}

// '@scope/pkg/sub' → '@scope/pkg', 'pkg/sub/deep' → 'pkg'.
function topLevelPkg(id: string): string {
    if (id.startsWith('@')) {
        const [scope, name] = id.split('/')
        return name ? `${scope}/${name}` : scope
    }
    return id.split('/')[0]
}

function workspaceAliases(repoRoot: string): Record<string, string> {
    return {
        // form-data → mime-types → mime-db pulls ~133 KB of MIME data into every HTTP connector
        // bundle. Swap in a minimal common-types table; uncommon types fall back gracefully.
        'mime-db': resolve(repoRoot, 'packages', 'connectors', 'framework', 'src', 'mime-db-min.cjs'),
        '@fema-ipaas/shared': resolve(repoRoot, 'packages', 'core', 'shared', 'src'),
        '@fema-ipaas/connector-sdk': resolve(repoRoot, 'packages', 'connectors', 'framework', 'src'),
        '@fema-ipaas/connector-common': resolve(repoRoot, 'packages', 'connectors', 'common', 'src'),
        '@fema-ipaas/core-utils': resolve(repoRoot, 'packages', 'core', 'utils', 'src'),
        '@fema-ipaas/connector-types': resolve(repoRoot, 'packages', 'core', 'connector-types', 'src'),
        '@fema-ipaas/expression': resolve(repoRoot, 'packages', 'core', 'formula', 'src'),
        '@fema-ipaas/workflow-core': resolve(repoRoot, 'packages', 'core', 'execution', 'src'),
    }
}

function totalInputBytes(metafile: esbuild.Metafile): number {
    return Object.values(metafile.inputs).reduce((sum, input) => sum + input.bytes, 0)
}

function enforceSizeGate({ connectorPath, bundleBytes }: SizeGateParams): void {
    const mb = bundleBytes / 1024 / 1024
    if (bundleBytes > FAIL_BYTES) {
        throw new Error(
            `[bundleConnector] ${connectorPath} bundle is ${mb.toFixed(2)} MB, over the ${FAIL_BYTES / 1024 / 1024} MB cap`,
        )
    }
    if (bundleBytes > WARN_BYTES) {
        console.warn(`[bundleConnector] ${connectorPath} bundle is ${mb.toFixed(2)} MB (warn threshold ${WARN_BYTES / 1024 / 1024} MB)`)
    }
}

// The published bundle lives at src/index.js — the entry path the engine's connector loader
// resolves (older deployed engines hardcode `<package>/src/index.js`, ignoring package.json
// "main"). Emitting a single self-contained src/index.js keeps bundled connectors installable
// on every engine version while still inlining all @fema-ipaas/* workspace code.
const BUNDLE_FILENAME = 'src/index.js'
// tslib only exists to back tsc's `importHelpers` down-levelling. esbuild emits its own inline
// helpers, so the published bundle never requires it. Drop it from every manifest rather than
// telling the runtime installer to fetch a package the bundle does not use. (Deps loaded
// out-of-band — e.g. a forked child requiring oracledb — are NOT declared-dead and stay.)
const BUNDLE_HELPER_DEPS = new Set<string>(['tslib'])
const WARN_BYTES = 3 * 1024 * 1024
const FAIL_BYTES = 5 * 1024 * 1024
const NODE_BUILTINS = new Set(builtinModules)

// esbuild warning ids that mean the code will not work once bundled — a dynamic/indirect
// require or import esbuild cannot trace, or a missing/undefined import. The bundler reacts to
// these by auto-externalizing the offending package; if one survives that, the gate fails.
const HAZARD_WARNING_IDS = new Set<string>([
    'indirect-require',
    'unsupported-require-call',
    'unsupported-dynamic-import',
    'require-resolve-not-external',
    'import-is-undefined',
    'call-import-namespace',
    'commonjs-variable-in-esm',
])

const OPTIONAL_EXTERNALS = new Set<string>([
    'pg-native',
    'mongodb-client-encryption', 'kerberos', 'snappy', '@mongodb-js/zstd', 'aws4',
])

// Known-native packages: they ship a `.node` binary (or load one via a runtime-computed path)
// and cannot be inlined. Always kept external, even under inline-by-default.
const NATIVE_EXTERNALS = new Set<string>([
    'oracledb', 'duckdb', '@duckdb/node-api', '@duckdb/node-bindings',
    'better-sqlite3', 'sqlite3', 'cpu-features',
    'pg-native', 'mongodb-client-encryption', 'kerberos',
    'snappy', 'aws4', 'bson-ext', '@mongodb-js/zstd',
    'playwright', 'playwright-core', 'puppeteer', 'puppeteer-core',
    'sharp',
    'tiktoken',
    // native-backed SDK (pulls better-sqlite3), and packages that load sibling files at runtime:
    // pg-format → require(__dirname + '/reserved.js'); clarifai-nodejs-grpc → loadSync('*.proto').
    '@actual-app/api', 'pg-format', 'clarifai-nodejs-grpc',
])

export const bundleConnectorUtils = { bundleConnector, BUNDLE_FILENAME, readInlineConfig, unsafePackages, OPTIONAL_EXTERNALS }

export type BundleConnectorParams = {
    connectorPath: string
    distPath: string
    repoRoot: string
}

export type BundleResult = {
    bundleFile: string
    bundleBytes: number
    rawBytes: number
    external: string[]
    inlined: string[]
    extraBundleFiles: string[]
}

type InlineConfig = {
    inlineAll: boolean
    inlineList: Set<string>
    excludeList: Set<string>
}

type EsbuildPass = {
    result: esbuild.BuildResult & { metafile: esbuild.Metafile }
    inlined: Set<string>
    externalized: Set<string>
}

type RunEsbuildParams = {
    entryFile: string
    outfile: string
    repoRoot: string
    inlineAll: boolean
    inlineList: Set<string>
    external: Set<string>
}

type ConnectorManifest = {
    dependencies?: Record<string, string>
    bundleDeps?: boolean | string[]
    bundleForkedEntries?: string[]
}

type ForkedEntriesParams = {
    connectorPath: string
    distPath: string
    repoRoot: string
    manifest: ConnectorManifest
    inlineAll: boolean
    inlineList: Set<string>
    excludeList: Set<string>
}

type ForkedEntriesResult = {
    files: string[]
    externalized: Set<string>
}

type DirnameGateParams = {
    connectorPath: string
    metafile: esbuild.Metafile
    manifest: ConnectorManifest
}

type ExternalizeParams = {
    inlineAll: boolean
    inlineList: Set<string>
    external: Set<string>
    inlined: Set<string>
    externalized: Set<string>
}

type GateParams = {
    metafile: esbuild.Metafile
    warnings: esbuild.Message[]
}

type SizeGateParams = {
    connectorPath: string
    bundleBytes: number
}
