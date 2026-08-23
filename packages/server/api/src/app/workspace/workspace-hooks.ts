import { Workspace } from '@fema-ipaas/shared'
import { hooksFactory } from '../helper/hooks-factory'

export const workspaceHooks = hooksFactory.create<WorkspaceHooks>(_log => ({
    postCreate: async (_workspace: Workspace, _context?: WorkspacePostCreateContext) => {
        return
    },
}))

export type WorkspacePostCreateContext = {
    alertReceiverEmail?: string | null
}

export type WorkspaceHooks = {
    postCreate(workspace: Workspace, context?: WorkspacePostCreateContext): Promise<void>
}
