import { readFileSync } from 'fs'
import path from 'path'
import Mustache from 'mustache'
import { describe, expect, it } from 'vitest'
import { emailBrandingUtils } from '../../../../src/app/helper/email/email-branding-utils'

const TEMPLATE_DIR = path.resolve(__dirname, '../../../../src/assets/emails')
const LIVE_TEMPLATES = ['alert-notification', 'invitation-email', 'issue-created', 'login-code', 'project-member-added', 'reset-password', 'tenant-deleted', 'verify-email']

function render({ template, variables }: { template: string, variables: Record<string, string> }): string {
    const body = readFileSync(path.join(TEMPLATE_DIR, `${template}.html`), 'utf-8')
    const footer = readFileSync(path.join(TEMPLATE_DIR, 'footer.html'), 'utf-8')
    return Mustache.render(body, variables, { footer })
}

const baseVariables = {
    tenantName: '甲公司',
    platformName: '甲公司',
    fullLogoUrl: '',
    primaryColor: '#c2410c',
    primaryColorLight: '#fdf1ea',
    onPrimaryColor: '#ffffff',
    setupLink: 'https://flows.example.com/reset-password?otpcode=123456&identityId=abc',
    loginLink: 'https://flows.example.com/projects/p1/home',
    runUrl: 'https://flows.example.com/projects/p1/runs/r1',
    link: 'https://flows.example.com/tenant/limits/usage',
    linkLabel: '查看详情',
    title: '【容量告警】本月运行 2 / 2 次',
    headline: '【容量告警】本月运行 2 / 2 次',
    body: '项目：甲',
    code: '123456',
    projectName: '甲项目',
    role: '可编辑',
    workflowName: '入职开通',
    createdAt: '2026-10-03 14:00（北京时间）',
    failedStepDisplayName: '创建账号',
    failedStepNumber: '2',
    failedStepMessage: '部门没有映射',
    purgeDate: '2026-11-01',
}

describe('emailBrandingUtils.lightTint', () => {
    it('mixes the primary colour into white instead of reusing it as the page background', () => {
        const tint = emailBrandingUtils.lightTint({ primaryColor: '#2d6cdf' })
        expect(tint).not.toBe('#2d6cdf')
        expect(tint.toLowerCase()).toBe('#e6edfb')
    })
})

describe('emailBrandingUtils.usableColor', () => {
    it('falls back to the default primary colour when the tenant colour cannot be parsed', () => {
        expect(emailBrandingUtils.usableColor({ color: 'not-a-colour' })).toBe('#2d6cdf')
        expect(emailBrandingUtils.usableColor({ color: null })).toBe('#2d6cdf')
    })

    it('keeps a valid colour', () => {
        expect(emailBrandingUtils.usableColor({ color: '#C2410C' })).toBe('#c2410c')
    })
})

describe('emailBrandingUtils.readableTextColor', () => {
    it('uses dark text on a light brand colour and white text on a dark one', () => {
        expect(emailBrandingUtils.readableTextColor({ backgroundColor: '#fde047' })).toBe('#0a0a0a')
        expect(emailBrandingUtils.readableTextColor({ backgroundColor: '#1d4ed8' })).toBe('#ffffff')
    })
})

describe('emailBrandingUtils.absoluteLogoUrl', () => {
    it('turns a relative upload path into an absolute URL', () => {
        expect(emailBrandingUtils.absoluteLogoUrl({ logoUrl: '/api/v1/files/logo.png', publicBaseUrl: 'https://flows.example.com/' })).toBe('https://flows.example.com/api/v1/files/logo.png')
    })

    it('keeps an absolute URL as is', () => {
        expect(emailBrandingUtils.absoluteLogoUrl({ logoUrl: 'https://cdn.example.com/logo.png', publicBaseUrl: 'https://flows.example.com' })).toBe('https://cdn.example.com/logo.png')
    })

    it('drops SVG logos because mail clients do not render them', () => {
        expect(emailBrandingUtils.absoluteLogoUrl({ logoUrl: '/assets/full-logo.svg', publicBaseUrl: 'https://flows.example.com' })).toBe('')
        expect(emailBrandingUtils.absoluteLogoUrl({ logoUrl: 'https://cdn.example.com/logo.SVG?v=2', publicBaseUrl: 'https://flows.example.com' })).toBe('')
    })

    it('returns an empty string when there is no logo', () => {
        expect(emailBrandingUtils.absoluteLogoUrl({ logoUrl: null, publicBaseUrl: 'https://flows.example.com' })).toBe('')
        expect(emailBrandingUtils.absoluteLogoUrl({ logoUrl: '  ', publicBaseUrl: 'https://flows.example.com' })).toBe('')
    })
})

describe('emailBrandingUtils.formatTime', () => {
    it('shows an ISO timestamp as Beijing time', () => {
        expect(emailBrandingUtils.formatTime({ iso: '2026-10-03T06:33:58.685Z' })).toBe('2026-10-03 14:33（北京时间）')
    })

    it('returns the input when it is not a date', () => {
        expect(emailBrandingUtils.formatTime({ iso: 'soon' })).toBe('soon')
    })
})

describe('emailBrandingUtils.roleLabel', () => {
    it('uses the same Chinese labels as the web app', () => {
        expect(emailBrandingUtils.roleLabel({ role: 'Admin' })).toBe('所有者')
        expect(emailBrandingUtils.roleLabel({ role: 'Developer' })).toBe('可编辑')
        expect(emailBrandingUtils.roleLabel({ role: 'Operator' })).toBe('值班')
        expect(emailBrandingUtils.roleLabel({ role: 'Viewer' })).toBe('可查看')
        expect(emailBrandingUtils.roleLabel({ role: null })).toBe('成员')
    })
})

describe('emailBrandingUtils.truncate', () => {
    it('collapses whitespace and cuts long text with an ellipsis', () => {
        expect(emailBrandingUtils.truncate({ text: 'a\n  b', max: 10 })).toBe('a b')
        expect(emailBrandingUtils.truncate({ text: '一二三四五六七八九十', max: 5 })).toBe('一二三四…')
    })
})

describe('email templates', () => {
    it.each(LIVE_TEMPLATES)('%s renders in Chinese with the tenant brand and no hardcoded product name', (template) => {
        const html = render({ template, variables: baseVariables })
        expect(html).toContain('甲公司')
        expect(html).toContain('#fdf1ea')
        expect(html).not.toMatch(/FEMA|Activepieces|Integration Platform/i)
        expect(html).not.toMatch(/\{\{|\}\}/)
        expect(html).not.toContain('Happy building')
        expect(html).not.toContain('click here')
    })

    it.each(LIVE_TEMPLATES)('%s shows the tenant name instead of a broken image when there is no logo', (template) => {
        const html = render({ template, variables: baseVariables })
        expect(html).not.toContain('<img')
    })

    it('uses the logo image when the tenant has one', () => {
        const html = render({ template: 'reset-password', variables: { ...baseVariables, fullLogoUrl: 'https://flows.example.com/logo.png' } })
        expect(html).toContain('<img src="https:&#x2F;&#x2F;flows.example.com&#x2F;logo.png"')
    })

    it('reset-password points the button at the link that carries the code', () => {
        const html = render({ template: 'reset-password', variables: baseVariables })
        expect(html).toContain('otpcode&#x3D;123456')
        expect(html).toContain('10 分钟')
    })

    it('invitation-email says project for a project invitation and the tenant name otherwise', () => {
        const forProject = render({ template: 'invitation-email', variables: baseVariables })
        expect(forProject).toContain('邀请你加入项目「甲项目」')
        const forTenant = render({ template: 'invitation-email', variables: { ...baseVariables, projectName: '' } })
        expect(forTenant).toContain('邀请你加入「甲公司」')
        expect(forTenant).not.toContain('项目「')
    })

    it('alert-notification hides the button when there is no link', () => {
        const html = render({ template: 'alert-notification', variables: { ...baseVariables, link: '' } })
        expect(html).not.toContain('查看详情')
    })
})
