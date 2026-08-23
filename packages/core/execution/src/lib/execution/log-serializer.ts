import { ExecutioOutputFile } from './state/execution-output'
import { EXECUTION_LOG_MANIFEST_V2 } from './state/step-output'

export const logSerializer = {
    async serialize(log: ExecutioOutputFile): Promise<Buffer> {
        const withVersion: ExecutioOutputFile = log.version
            ? log
            : { ...log, version: EXECUTION_LOG_MANIFEST_V2 }
        return Buffer.from(JSON.stringify(withVersion, null))
    },
}
