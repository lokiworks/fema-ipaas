/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */
const nodePath = require('path')
const repoRoot = nodePath.resolve(__dirname, '../../../..')
require('dotenv').config({ path: nodePath.join(repoRoot, '.env.dev') })

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import fastify from 'fastify'
import { validatorCompiler } from 'fastify-type-provider-zod'
import qs from 'qs'
import { setupApp } from '../src/app/app'
import { initializeDatabase } from '../src/app/database'
import { system } from '../src/app/helper/system/system'
import { AppSystemProp } from '../src/app/helper/system/system-props'

const OUTPUT = join(repoRoot, 'docs/openapi.json')

const main = async () => {
    await initializeDatabase({ runMigrations: false })

    const fileSizeLimit = system.getNumberOrThrow(AppSystemProp.MAX_FILE_SIZE_MB)
    const executionLogSizeLimit = system.getNumberOrThrow(AppSystemProp.MAX_EXECUTION_LOG_SIZE_MB)

    const app = fastify({
        disableRequestLogging: true,
        querystringParser: (str) => qs.parse(str, { arrayLimit: 1000 }),
        loggerInstance: system.globalLogger(),
        ignoreTrailingSlash: true,
        pluginTimeout: 120000,
        bodyLimit: Math.max(fileSizeLimit + 4, executionLogSizeLimit + 4, 25) * 1024 * 1024,
    })

    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(() => (data) => JSON.stringify(data))

    await setupApp(app)
    await app.ready()

    const spec = app.swagger()
    writeFileSync(OUTPUT, `${JSON.stringify(spec, null, 2)}\n`)

    const paths = Object.keys((spec as { paths?: Record<string, unknown> }).paths ?? {})
    console.info(`[generate-openapi] wrote ${OUTPUT} with ${paths.length} paths`)
    process.exit(0)
}

main().catch((err) => {
    console.error('[generate-openapi] failed', err)
    process.exit(1)
})
