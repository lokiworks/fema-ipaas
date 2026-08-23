import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileSystemUtils } from '@fema-ipaas/server-utils'
import { assertSafeCodeNamespace, assertSafePathSegment } from '../../../utils/path-safety'

const COMPILED_CODE_FILENAME = 'index.js'

export const codeCache = (codesFolderPath: string) => ({
    workflowVersionDir(workflowVersionId: string): string {
        assertSafeCodeNamespace(workflowVersionId)
        return path.join(codesFolderPath, workflowVersionId)
    },

    stepDir({ workflowVersionId, stepName }: StepRef): string {
        assertSafeCodeNamespace(workflowVersionId)
        assertSafePathSegment(stepName, 'stepName')
        return path.join(codesFolderPath, workflowVersionId, stepName)
    },

    compiledStepPath(ref: StepRef): string {
        return path.join(this.stepDir(ref), COMPILED_CODE_FILENAME)
    },

    async readCompiledStep(ref: StepRef): Promise<string> {
        return readFile(this.compiledStepPath(ref), 'utf8')
    },

    async writeCompiledStep({ workflowVersionId, stepName, compiledJs }: WriteStepParams): Promise<void> {
        await fileSystemUtils.threadSafeMkdir(this.stepDir({ workflowVersionId, stepName }))
        await writeFile(this.compiledStepPath({ workflowVersionId, stepName }), compiledJs, 'utf8')
    },
})

type StepRef = {
    workflowVersionId: string
    stepName: string
}

type WriteStepParams = StepRef & {
    compiledJs: string
}
