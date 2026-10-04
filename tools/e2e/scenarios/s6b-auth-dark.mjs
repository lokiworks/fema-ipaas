import path from 'node:path'

import { chromium } from '@playwright/test'

import { assert, check, SHOTS, summary, WEB } from './lib/s5-kit.mjs'

const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 240000)
const ADMIN = { name: '林晓', email: 'admin@corp.test', password: 'Passw0rd!x1' }
const browser = await chromium.launch()

try {
  await wizard()
  await signIn()
}
finally {
  await browser.close()
}
summary()

async function wizard() {
  await check('A1 安装向导：没选过主题时是浅色，页面右上角有主题开关，点一下变深色，刷新后保持', async () => {
    const { page, context } = await open({ width: 1280, height: 900 })
    try {
      await page.goto(`${WEB}/`, { timeout: 300000 })
      await waitText(page, '检查运行环境')
      assert(!(await isDark(page)), '默认应是浅色')
      await shot(page, 'a01-wizard-light')
      await page.getByRole('button', { name: '切换到深色主题' }).click()
      assert(await isDark(page), '点开关后应是深色')
      await page.waitForTimeout(500)
      await shot(page, 'a02-wizard-dark')
      await page.reload()
      await waitText(page, '检查运行环境')
      assert(await isDark(page), '刷新后应保持深色')
      await page.getByRole('button', { name: '切换到浅色主题' }).click()
      assert(!(await isDark(page)), '再点应回到浅色')
    }
    finally {
      await context.close()
    }
  })

  await check('A2 安装向导的每一步在深色下都可读：背景是深色、没有白底块，窄屏不横向滚动', async () => {
    for (const width of [1280, 390]) {
      const { page, context } = await open({ width, height: 1100, theme: 'dark' })
      try {
        await page.goto(`${WEB}/setup?step=environment`, { timeout: 300000 })
        await waitText(page, '检查运行环境')
        for (const step of ['environment', 'administrator', 'organization', 'services']) {
          await page.goto(`${WEB}/setup?step=${step}`)
          await page.waitForTimeout(1200)
          const whites = await whiteBlocks(page)
          assert(whites.length === 0, `步骤 ${step} 在 ${width}px 深色下出现白底块：${whites.slice(0, 3).join(' | ')}`)
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          assert(overflow <= 1, `步骤 ${step} 在 ${width}px 横向溢出 ${overflow}px`)
          await shot(page, `a03-wizard-${step}-dark-${width}`)
        }
      }
      finally {
        await context.close()
      }
    }
  })

  await check('A3 走完安装向导（创建管理员和组织）', async () => {
    const { page, context } = await open({ width: 1280, height: 900 })
    try {
      await page.goto(`${WEB}/setup?step=administrator`)
      await waitText(page, '创建管理员')
      await page.fill('#setup-name', ADMIN.name)
      await page.fill('#setup-email', ADMIN.email)
      await page.fill('#setup-password', ADMIN.password)
      await page.fill('#setup-confirm', ADMIN.password)
      await page.locator('form button[type=submit]').click()
      await waitText(page, '给组织起个名字')
      await page.fill('#setup-organization', '星河科技')
      await page.locator('form button[type=submit]').click()
      await waitText(page, '可选服务')
      await page.locator('form button[type=submit]').click()
      await waitText(page, '确认并完成')
      await page.locator('form button[type=submit]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/setup'), { timeout: TIMEOUT })
    }
    finally {
      await context.close()
    }
  })
}

async function signIn() {
  await check('A4 登录页：浅色和深色各一张，深色下输入框、按钮、分隔线都可读，窄屏不横向滚动', async () => {
    for (const variant of [{ name: 'light', theme: 'light', width: 1280 }, { name: 'dark', theme: 'dark', width: 1280 }, { name: 'dark-narrow', theme: 'dark', width: 390 }, { name: 'light-narrow', theme: 'light', width: 390 }]) {
      const { page, context } = await open({ width: variant.width, height: 900, theme: variant.theme })
      try {
        await page.goto(`${WEB}/sign-in`, { timeout: 300000 })
        await page.waitForSelector('#email')
        await page.waitForTimeout(800)
        assert((await isDark(page)) === (variant.theme === 'dark'), `${variant.name}：主题没有生效`)
        const whites = await whiteBlocks(page)
        assert(variant.theme === 'light' || whites.length === 0, `${variant.name}：深色下出现白底块：${whites.slice(0, 3).join(' | ')}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert(overflow <= 1, `${variant.name}：横向溢出 ${overflow}px`)
        await shot(page, `a04-sign-in-${variant.name}`)
      }
      finally {
        await context.close()
      }
    }
  })

  await check('A5 登录页的主题开关：深色下点一下变浅色，登录后应用里沿用同一个主题', async () => {
    const { page, context } = await open({ width: 1280, height: 900, theme: 'dark' })
    try {
      await page.goto(`${WEB}/sign-in`, { timeout: 300000 })
      await page.waitForSelector('#email')
      await page.getByRole('button', { name: '切换到浅色主题' }).click()
      assert(!(await isDark(page)), '应变成浅色')
      await page.getByRole('button', { name: '切换到深色主题' }).click()
      await page.fill('#email', ADMIN.email)
      await page.fill('#password', ADMIN.password)
      await page.click('[data-testid=sign-in-button]')
      await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: TIMEOUT })
      await page.waitForTimeout(1500)
      assert(await isDark(page), '登录后应用里应沿用深色')
      await shot(page, 'a05-after-sign-in-dark')
    }
    finally {
      await context.close()
    }
  })
}

async function open({ width, height, theme }) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', colorScheme: theme === 'dark' ? 'dark' : 'light' })
  await context.addInitScript((value) => {
    if (value !== undefined && !sessionStorage.getItem('e2e-theme-set')) {
      localStorage.setItem('fema.theme', value)
      sessionStorage.setItem('e2e-theme-set', '1')
    }
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'vite-plugin-checker-error-overlay{display:none!important}'
      document.head.appendChild(style)
    })
  }, theme)
  const page = await context.newPage()
  page.setDefaultTimeout(TIMEOUT)
  return { page, context }
}

function isDark(page) {
  return page.evaluate(() => document.documentElement.classList.contains('dark'))
}

function whiteBlocks(page) {
  return page.evaluate(() => {
    const found = []
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect()
      if (box.width < 80 || box.height < 24 || element.closest('svg, img, button, [role=switch]')) {
        continue
      }
      const color = getComputedStyle(element).backgroundColor
      const match = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(color)
      if (match && Number(match[1]) > 235 && Number(match[2]) > 235 && Number(match[3]) > 235 && (match[4] === undefined || Number(match[4]) > 0.5)) {
        found.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`)
      }
    }
    return found
  })
}

async function waitText(page, text) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout: TIMEOUT })
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}
