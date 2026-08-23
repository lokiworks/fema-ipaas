import { isNil, TenantId } from '@fema/core-utils'
import { OtpType, UserIdentity, UserInvitation } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { tenantService } from '../../tenant/tenant.service'
import { workspaceService } from '../../workspace/workspace-service'
import { domainHelper } from '../domain-helper'
import { mailSender, MailTemplateVariables } from './mail-sender'

const OTP_TEMPLATES: Record<OtpType, { template: string, subject: string }> = {
    [OtpType.EMAIL_VERIFICATION]: { template: 'verify-email', subject: 'Verify your email address' },
    [OtpType.PASSWORD_RESET]: { template: 'reset-password', subject: 'Reset your password' },
    [OtpType.EMAIL_LOGIN]: { template: 'login-code', subject: 'Your sign-in code' },
}

async function brandingFor(tenantId: TenantId | null, log: FastifyBaseLogger): Promise<MailTemplateVariables> {
    const tenant = isNil(tenantId) ? null : await tenantService(log).getOne(tenantId)
    return {
        tenantName: tenant?.name ?? 'Integration Tenant',
        fullLogoUrl: tenant?.fullLogoUrl ?? '',
        primaryColor: tenant?.primaryColor ?? '#1F2329',
        primaryColorLight: tenant?.primaryColor ?? '#F5F6F7',
    }
}

export const emailService = (log: FastifyBaseLogger) => ({
    isConfigured(): boolean {
        return mailSender(log).isConfigured()
    },

    async sendOtp({ tenantId, userIdentity, otp, type }: SendOtpParams): Promise<void> {
        const { template, subject } = OTP_TEMPLATES[type]
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to: userIdentity.email,
            subject,
            template,
            variables: {
                ...branding,
                code: otp,
                setupLink: await domainHelper.getPublicUrl({ path: '' }),
            },
        })
    },

    async sendInvitation({ userInvitation, invitationLink }: SendInvitationParams): Promise<void> {
        const branding = await brandingFor(userInvitation.tenantId, log)
        const workspace = isNil(userInvitation.workspaceId) ? null : await workspaceService(log).getOne(userInvitation.workspaceId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `You have been invited to ${branding.tenantName}`,
            template: 'invitation-email',
            variables: {
                ...branding,
                workspaceName: workspace?.displayName ?? branding.tenantName,
                setupLink: invitationLink,
            },
        })
    },

    async sendWorkspaceMemberAdded({ userInvitation }: SendWorkspaceMemberAddedParams): Promise<void> {
        const branding = await brandingFor(userInvitation.tenantId, log)
        const workspace = isNil(userInvitation.workspaceId) ? null : await workspaceService(log).getOne(userInvitation.workspaceId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `You now have access to ${workspace?.displayName ?? branding.tenantName}`,
            template: 'workspace-member-added',
            variables: {
                ...branding,
                workspaceName: workspace?.displayName ?? branding.tenantName,
                role: userInvitation.workspaceRoleId ?? 'Member',
                loginLink: await domainHelper.getPublicUrl({ path: '' }),
            },
        })
    },

    async sendTenantDeleted({ tenantId, email, purgeDate }: SendTenantDeletedParams): Promise<void> {
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to: email,
            subject: `${branding.tenantName} has been scheduled for deletion`,
            template: 'tenant-deleted',
            variables: {
                ...branding,
                purgeDate,
            },
        })
    },
})

type SendOtpParams = {
    tenantId: TenantId | null
    userIdentity: UserIdentity
    otp: string
    type: OtpType
}

type SendInvitationParams = {
    userInvitation: UserInvitation
    invitationLink: string
}

type SendWorkspaceMemberAddedParams = {
    userInvitation: UserInvitation
}

type SendTenantDeletedParams = {
    tenantId: TenantId
    email: string
    purgeDate: string
}
