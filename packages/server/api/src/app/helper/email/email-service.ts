import { isNil, TenantId } from '@fema-ipaas/core-utils'
import { OtpType, UserIdentity, UserInvitation } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectService } from '../../project/project-service'
import { tenantService } from '../../tenant/tenant.service'
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
        tenantName: tenant?.name ?? 'Integration Platform',
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
        const project = isNil(userInvitation.projectId) ? null : await projectService(log).getOne(userInvitation.projectId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `You have been invited to ${branding.tenantName}`,
            template: 'invitation-email',
            variables: {
                ...branding,
                projectName: project?.displayName ?? branding.tenantName,
                setupLink: invitationLink,
            },
        })
    },

    async sendProjectMemberAdded({ userInvitation }: SendProjectMemberAddedParams): Promise<void> {
        const branding = await brandingFor(userInvitation.tenantId, log)
        const project = isNil(userInvitation.projectId) ? null : await projectService(log).getOne(userInvitation.projectId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `You now have access to ${project?.displayName ?? branding.tenantName}`,
            template: 'project-member-added',
            variables: {
                ...branding,
                projectName: project?.displayName ?? branding.tenantName,
                role: userInvitation.projectRoleId ?? 'Member',
                loginLink: await domainHelper.getPublicUrl({ path: '' }),
            },
        })
    },

    async sendWorkflowFailure({ tenantId, to, projectName, workflowName, runUrl, failedAt, failedStepDisplayName, failedStepNumber, failedStepMessage }: SendWorkflowFailureParams): Promise<void> {
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to,
            subject: `[${projectName}] Workflow "${workflowName}" failed`,
            template: 'issue-created',
            variables: {
                ...branding,
                projectName,
                workflowName,
                runUrl,
                createdAt: failedAt,
                failedStepDisplayName,
                failedStepNumber,
                failedStepMessage,
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

type SendProjectMemberAddedParams = {
    userInvitation: UserInvitation
}

type SendWorkflowFailureParams = {
    tenantId: TenantId
    to: string
    projectName: string
    workflowName: string
    runUrl: string
    failedAt: string
    failedStepDisplayName: string
    failedStepNumber: string
    failedStepMessage: string
}

type SendTenantDeletedParams = {
    tenantId: TenantId
    email: string
    purgeDate: string
}
