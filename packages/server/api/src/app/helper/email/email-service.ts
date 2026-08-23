import { isNil, PlatformId } from '@fema/core-utils'
import { OtpType, UserIdentity, UserInvitation } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { domainHelper } from '../domain-helper'
import { mailSender, MailTemplateVariables } from './mail-sender'

const OTP_TEMPLATES: Record<OtpType, { template: string, subject: string }> = {
    [OtpType.EMAIL_VERIFICATION]: { template: 'verify-email', subject: 'Verify your email address' },
    [OtpType.PASSWORD_RESET]: { template: 'reset-password', subject: 'Reset your password' },
    [OtpType.EMAIL_LOGIN]: { template: 'login-code', subject: 'Your sign-in code' },
}

async function brandingFor(platformId: PlatformId | null, log: FastifyBaseLogger): Promise<MailTemplateVariables> {
    const platform = isNil(platformId) ? null : await platformService(log).getOne(platformId)
    return {
        platformName: platform?.name ?? 'Integration Platform',
        fullLogoUrl: platform?.fullLogoUrl ?? '',
        primaryColor: platform?.primaryColor ?? '#1F2329',
        primaryColorLight: platform?.primaryColor ?? '#F5F6F7',
    }
}

export const emailService = (log: FastifyBaseLogger) => ({
    isConfigured(): boolean {
        return mailSender(log).isConfigured()
    },

    async sendOtp({ platformId, userIdentity, otp, type }: SendOtpParams): Promise<void> {
        const { template, subject } = OTP_TEMPLATES[type]
        const branding = await brandingFor(platformId, log)
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
        const branding = await brandingFor(userInvitation.platformId, log)
        const project = isNil(userInvitation.projectId) ? null : await projectService(log).getOne(userInvitation.projectId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `You have been invited to ${branding.platformName}`,
            template: 'invitation-email',
            variables: {
                ...branding,
                projectName: project?.displayName ?? branding.platformName,
                setupLink: invitationLink,
            },
        })
    },

    async sendProjectMemberAdded({ userInvitation }: SendProjectMemberAddedParams): Promise<void> {
        const branding = await brandingFor(userInvitation.platformId, log)
        const project = isNil(userInvitation.projectId) ? null : await projectService(log).getOne(userInvitation.projectId)
        await mailSender(log).send({
            to: userInvitation.email,
            subject: `You now have access to ${project?.displayName ?? branding.platformName}`,
            template: 'project-member-added',
            variables: {
                ...branding,
                projectName: project?.displayName ?? branding.platformName,
                role: userInvitation.projectRoleId ?? 'Member',
                loginLink: await domainHelper.getPublicUrl({ path: '' }),
            },
        })
    },

    async sendPlatformDeleted({ platformId, email, purgeDate }: SendPlatformDeletedParams): Promise<void> {
        const branding = await brandingFor(platformId, log)
        await mailSender(log).send({
            to: email,
            subject: `${branding.platformName} has been scheduled for deletion`,
            template: 'platform-deleted',
            variables: {
                ...branding,
                purgeDate,
            },
        })
    },
})

type SendOtpParams = {
    platformId: PlatformId | null
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

type SendPlatformDeletedParams = {
    platformId: PlatformId
    email: string
    purgeDate: string
}
