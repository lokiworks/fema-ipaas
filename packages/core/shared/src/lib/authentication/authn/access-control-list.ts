import { Permission } from '@fema-ipaas/core-utils'
import { DefaultProjectRole } from '../../management/project/project-member'

const VIEWER_PERMISSIONS: Permission[] = [
    Permission.READ_WORKFLOW,
    Permission.READ_CONNECTION,
    Permission.READ_CONNECTOR,
    Permission.READ_RUN,
    Permission.READ_TEMPLATE,
    Permission.READ_PROJECT,
    Permission.READ_FOLDER,
    Permission.READ_VARIABLE,
    Permission.READ_PROJECT_RELEASE,
    Permission.READ_PROJECT_MEMBER,
    Permission.READ_INVITATION,
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
    Permission.WRITE_PROJECT_RELEASE,
    Permission.MANAGE_CONNECTOR_DEVELOPMENT,
    Permission.MANAGE_TEMPLATE,
]

const PROJECT_ADMIN_PERMISSIONS: Permission[] = [
    ...DEVELOPER_PERMISSIONS,
    Permission.WRITE_PROJECT,
    Permission.WRITE_PROJECT_MEMBER,
    Permission.WRITE_INVITATION,
    Permission.MANAGE_CONNECTOR,
    Permission.READ_AUDIT,
]

export const rolePermissions: Record<DefaultProjectRole, Permission[]> = {
    [DefaultProjectRole.ADMIN]: PROJECT_ADMIN_PERMISSIONS,
    [DefaultProjectRole.DEVELOPER]: DEVELOPER_PERMISSIONS,
    [DefaultProjectRole.OPERATOR]: OPERATOR_PERMISSIONS,
    [DefaultProjectRole.VIEWER]: VIEWER_PERMISSIONS,
}
