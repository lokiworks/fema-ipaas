import { isNil } from '@fema-ipaas/core-utils';
import fs from 'fs'
import path from 'path'
import { loggerFactory } from './logger'
import { safeHttp } from './safe-http'

const logger = loggerFactory.create()

let cachedCurrentRelease: string | undefined

function readCurrentRelease(): string {
    if (cachedCurrentRelease !== undefined) {
        return cachedCurrentRelease
    }
    const packageJsonPath = path.resolve(process.cwd(), 'package.json')
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson
        if (typeof packageJson.version !== 'string') {
            logger.warn({ packageJsonPath }, 'package.json has no string "version" field, defaulting current release to 0.0.0')
            cachedCurrentRelease = UNKNOWN_VERSION
        }
        else {
            cachedCurrentRelease = packageJson.version
        }
    }
    catch (e) {
        logger.warn({ error: e, packageJsonPath, cwd: process.cwd() }, 'failed to read package.json, defaulting current release to 0.0.0')
        cachedCurrentRelease = UNKNOWN_VERSION
    }
    return cachedCurrentRelease
}

export const versionUtil = {
    getCurrentRelease(): string {
        return readCurrentRelease()
    },
    async getLatestRelease(): Promise<string> {
        try {
            const response = await safeHttp.axios.get<PackageJson>(LATEST_RELEASE_MANIFEST_URL, {
                timeout: 5000,
            })
            const version = response.data.version
            return typeof version === 'string' ? version : UNKNOWN_VERSION
        }
        catch (ex) {
            logger.warn({ err: ex }, 'could not read the latest release, reporting it as unknown')
            return UNKNOWN_VERSION
        }
    },
    //could be null if the other is running on something older than 0.85.0
    versionsAreCompatible({ versionA, versionB }: { versionA: string | undefined, versionB: string | undefined }): boolean {
        if (isNil(versionA) || isNil(versionB)) {
            return false
        }
        if (versionA === UNKNOWN_VERSION || versionB === UNKNOWN_VERSION) {
            return false
        }
        return versionA === versionB
    },
}

export const UNKNOWN_VERSION = '0.0.0'

type PackageJson = {
    version: string
}

const LATEST_RELEASE_MANIFEST_URL = 'https://raw.githubusercontent.com/lokiworks/fema-ipaas/main/package.json'
