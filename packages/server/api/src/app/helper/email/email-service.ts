import { isNil, TenantId } from '@fema-ipaas/core-utils'
import { OtpType, UserIdentity, UserInvitation } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectService } from '../../project/project-service'
import { tenantService } from '../../tenant/tenant.service'
import { domainHelper } from '../domain-helper'
import { emailBrandingUtils } from './email-branding-utils'
import { mailSender, MailTemplateVariables } from './mail-sender'

const OTP_TEMPLATES: Record<OtpType, { template: string, subject: string }> = {
    [OtpType.EMAIL_VERIFICATION]: { template: 'verify-email', subject: '请验证你的邮箱' },
    [OtpType.PASSWORD_RESET]: { template: 'reset-password', subject: '重置你的密码' },
    [OtpType.EMAIL_LOGIN]: { template: 'login-code', subject: '你的登录验证码' },
}

const OTP_LINK_PATHS: Partial<Record<OtpType, string>> = {
    [OtpType.EMAIL_VERIFICATION]: 'verify-email',
    [OtpType.PASSWORD_RESET]: 'reset-password',
}

const MAX_SUBJECT_LENGTH = 100
const MAX_HEADLINE_LENGTH = 60

async function brandingFor(tenantId: TenantId | null, log: FastifyBaseLogger): Promise<MailTemplateVariables> {
    const tenant = isNil(tenantId) ? null : await tenantService(log).getOne(tenantId)
    const primaryColor = emailBrandingUtils.usableColor({ color: tenant?.primaryColor })
    const tenantName = tenant?.name ?? DEFAULT_PLATFORM_NAME
    return {
        tenantName,
        platformName: tenantName,
        fullLogoUrl: emailBrandingUtils.absoluteLogoUrl({
            logoUrl: tenant?.fullLogoUrl,
            publicBaseUrl: await domainHelper.getPublicUrl({ path: '' }),
        }),
        primaryColor,
        primaryColorLight: emailBrandingUtils.lightTint({ primaryColor }),
        onPrimaryColor: emailBrandingUtils.readableTextColor({ backgroundColor: primaryColor }),
    }
}

async function otpLink({ type, otp, identityId }: { type: OtpType, otp: string, identityId: string }): Promise<string> {
    const path = OTP_LINK_PATHS[type]
    if (isNil(path)) {
        return domainHelper.getPublicUrl({ path: '' })
    }
    return domainHelper.getPublicUrl({
        path: `${path}?otpcode=${encodeURIComponent(otp)}&identityId=${encodeURIComponent(identityId)}`,
    })
}

const DEFAULT_PLATFORM_NAME = '集成平台'

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
                setupLink: await otpLink({ type, otp, identityId: userIdentity.id }),
            },
        })
    },

    async sendInvitation({ userInvitation, invitationLink }: SendInvitationParams): Promise<void> {
        const branding = await brandingFor(userInvitation.tenantId, log)
        const project = isNil(userInvitation.projectId) ? null : await projectService(log).getOne(userInvitation.projectId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: isNil(project) ? `邀请你加入「${branding.tenantName}」` : `邀请你加入项目「${project.displayName}」`,
            template: 'invitation-email',
            variables: {
                ...branding,
                projectName: project?.displayName ?? '',
                setupLink: invitationLink,
            },
        })
    },

    async sendProjectMemberAdded({ userInvitation }: SendProjectMemberAddedParams): Promise<void> {
        const branding = await brandingFor(userInvitation.tenantId, log)
        const project = isNil(userInvitation.projectId) ? null : await projectService(log).getOne(userInvitation.projectId)
        const projectName = project?.displayName ?? branding.tenantName
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `你已加入项目「${projectName}」`,
            template: 'project-member-added',
            variables: {
                ...branding,
                projectName,
                role: emailBrandingUtils.roleLabel({ role: userInvitation.projectRoleId }),
                loginLink: await domainHelper.getPublicUrl({ path: isNil(project) ? '' : `projects/${project.id}/home` }),
            },
        })
    },

    async sendProjectAccessGranted({ tenantId, to, projectId, projectName, role }: SendProjectAccessGrantedParams): Promise<void> {
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to,
            subject: `你已加入项目「${projectName}」`,
            template: 'project-member-added',
            variables: {
                ...branding,
                projectName,
                role: emailBrandingUtils.roleLabel({ role }),
                loginLink: await domainHelper.getPublicUrl({ path: `projects/${projectId}/home` }),
            },
        })
    },

    async sendWorkflowFailure({ tenantId, to, projectName, workflowName, runUrl, failedAt, failedStepDisplayName, failedStepNumber, failedStepMessage }: SendWorkflowFailureParams): Promise<void> {
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to,
            subject: emailBrandingUtils.truncate({ text: `【${projectName}】工作流「${workflowName}」运行失败`, max: MAX_SUBJECT_LENGTH }),
            template: 'issue-created',
            variables: {
                ...branding,
                projectName,
                workflowName,
                runUrl,
                createdAt: emailBrandingUtils.formatTime({ iso: failedAt }),
                failedStepDisplayName,
                failedStepNumber,
                failedStepMessage,
            },
        })
    },

    async sendAlert({ tenantId, to, title, body, link, linkLabel }: SendAlertParams): Promise<void> {
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to,
            subject: emailBrandingUtils.truncate({ text: title, max: MAX_SUBJECT_LENGTH }),
            template: 'alert-notification',
            variables: {
                ...branding,
                title,
                headline: emailBrandingUtils.truncate({ text: title, max: MAX_HEADLINE_LENGTH }),
                body,
                link: link ?? '',
                linkLabel: linkLabel ?? '查看详情',
            },
        })
    },

    async sendTenantDeleted({ tenantId, email, purgeDate }: SendTenantDeletedParams): Promise<void> {
        const branding = await brandingFor(tenantId, log)
        await mailSender(log).send({
            to: email,
            subject: `「${branding.tenantName}」已被计划删除`,
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

type SendProjectAccessGrantedParams = {
    tenantId: TenantId
    to: string
    projectId: string
    projectName: string
    role: string
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

type SendAlertParams = {
    tenantId: TenantId
    to: string
    title: string
    body: string
    link: string | null
    linkLabel?: string
}

type SendTenantDeletedParams = {
    tenantId: TenantId
    email: string
    purgeDate: string
}
