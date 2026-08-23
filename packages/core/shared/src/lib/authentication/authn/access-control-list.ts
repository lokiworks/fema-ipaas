import { Permission } from '@fema-ipaas/core-utils'
import { DefaultWorkspaceRole } from '../../management/workspace/workspace-member'

const VIEWER_PERMISSIONS: Permission[] = [
    Permission.READ_WORKFLOW,
    Permission.READ_CONNECTION,
    Permission.READ_CONNECTOR,
    Permission.READ_RUN,
    Permission.READ_TEMPLATE,
    Permission.READ_WORKSPACE,
    Permission.READ_FOLDER,
    Permission.READ_VARIABLE,
    Permission.READ_WORKSPACE_RELEASE,
    Permission.READ_WORKSPACE_MEMBER,
    Permission.READ_INVITATION,
    Permission.READ_NETWORK_AGENT,
]

const OPERATOR_PERMISSIONS: Permission[] = [
    ...VIEWER_PERMISSIONS,
    Permission.UPDATE_WORKFLOW_STATUS,
    Permission.WRITE_RUN,
    Permission.WRITE_CONNECTION,
]

const DEVELOPER_PERMISSIONS: Permission[] = [
    ...OPERATOR_PERMISSIONS,
    Permission.WRITE_WORKFLOW,
    Permission.DELETE_WORKFLOW,
    Permission.PUBLISH_WORKFLOW,
    Permission.WRITE_FOLDER,
    Permission.WRITE_VARIABLE,
    Permission.WRITE_WORKSPACE_RELEASE,
    Permission.MANAGE_CONNECTOR_DEVELOPMENT,
    Permission.MANAGE_TEMPLATE,
]

const WORKSPACE_ADMIN_PERMISSIONS: Permission[] = [
    ...DEVELOPER_PERMISSIONS,
    Permission.WRITE_WORKSPACE,
    Permission.WRITE_WORKSPACE_MEMBER,
    Permission.WRITE_INVITATION,
    Permission.MANAGE_CONNECTOR,
    Permission.MANAGE_NETWORK_AGENT,
    Permission.READ_AUDIT,
]

export const rolePermissions: Record<DefaultWorkspaceRole, Permission[]> = {
    [DefaultWorkspaceRole.ADMIN]: WORKSPACE_ADMIN_PERMISSIONS,
    [DefaultWorkspaceRole.DEVELOPER]: DEVELOPER_PERMISSIONS,
    [DefaultWorkspaceRole.OPERATOR]: OPERATOR_PERMISSIONS,
    [DefaultWorkspaceRole.VIEWER]: VIEWER_PERMISSIONS,
}
