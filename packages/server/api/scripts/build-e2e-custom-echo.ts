import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const FIXTURE_DIR = resolve(__dirname, '../test/fixtures/e2e-custom-echo')
const ARCHIVE_PATH = resolve(__dirname, '../src/assets/e2e-custom-echo-0.0.1.tgz')

async function main(): Promise<void> {
    const staging = mkdtempSync(join(tmpdir(), 'e2e-custom-echo-'))
    const packageDir = join(staging, 'package')
    mkdirSync(join(packageDir, 'src'), { recursive: true })

    await esbuild.build({
        entryPoints: [join(FIXTURE_DIR, 'src/index.ts')],
        outfile: join(packageDir, 'src/index.js'),
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        logLevel: 'info',
    })

    cpSync(join(FIXTURE_DIR, 'package.json'), join(packageDir, 'package.json'))

    execFileSync('tar', ['-czf', ARCHIVE_PATH, '-C', staging, 'package'], { stdio: 'inherit' })
    rmSync(staging, { recursive: true, force: true })
}

void main()
