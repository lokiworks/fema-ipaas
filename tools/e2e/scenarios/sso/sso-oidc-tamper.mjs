import { ADMIN, FAKE_IDP, FAKE_IDP_PORT, WEB, adminSession, apiRequest, assert, check, launchBrowser, openContext, shot, startProcess, stopPort, summary, waitPort } from './sso-kit.mjs'
import { memberByEmail, resetTenant, saveOidcConfig, signInWithSso, verifyAndEnable } from './sso-flows.mjs'

const browser = await launchBrowser()
const open = (options = {}) => openContext({ browser, ...options })
const admin = await adminSession()
const token = admin.token
const FAKE_SECRET = 'fake-secret-value'

stopPort({ port: FAKE_IDP_PORT })
stopPort({ port: FAKE_IDP_PORT + 1 })
startProcess({ name: 'idp-fake', args: ['tools/e2e/scenarios/sso/idp-fake.mjs'], loader: true })
await waitPort({ port: FAKE_IDP_PORT, timeoutMs: 60000 })
await resetTenant({ token })

const control = (path, body) => fetch(`http://127.0.0.1:${FAKE_IDP_PORT + 1}${path}`, { method: 'POST', body: JSON.stringify(body) })
const noPicker = async () => undefined

try {
  await check('T1 把单点登录指向一个会篡改令牌的身份提供方，测试登录通过后启用', async () => {
    const saved = await saveOidcConfig({ token, issuer: FAKE_IDP, clientId: 'fema-e2e-fake', clientSecret: FAKE_SECRET })
    assert(saved.status === 200, `保存失败 ${saved.text}`)
    await control('/next', { email: ADMIN.email })
    await verifyAndEnable({ open, token, provider: 'OIDC', startTestIdp: noPicker })
  })

  const cases = [
    ['bad-signature', '签名不是身份提供方的密钥签的', ['TOKEN_INVALID']],
    ['wrong-issuer', '颁发者不是配置的颁发者', ['ISSUER_MISMATCH']],
    ['wrong-audience', '受众是别的客户端', ['TOKEN_INVALID']],
    ['wrong-nonce', 'nonce 不是这次登录请求的', ['TOKEN_INVALID']],
    ['expired', '令牌已过期', ['TOKEN_INVALID']],
    ['alg-none', '用 none 算法冒充', ['TOKEN_INVALID']],
    ['hs256-confusion', '用对称算法冒充', ['TOKEN_INVALID']],
    ['unknown-kid', '密钥编号不在身份提供方公布的密钥里', ['TOKEN_INVALID']],
    ['missing-sub', '令牌里没有用户标识', ['TOKEN_INVALID']],
  ]
  for (const [tamper, label, codes] of cases) {
    await check(`T2 ID 令牌${label}：被拒绝且不创建账号（${tamper}）`, async () => {
      const email = 'member@acme.test'
      const before = await memberByEmail({ token, email })
      await control('/next', { email, tamper })
      const result = await signInWithSso({ open, email, pickUser: noPicker })
      try {
        assert(!result.ok && codes.includes(result.code), `应被拒绝为 ${codes.join('/')}，实际 ${JSON.stringify({ ok: result.ok, code: result.code })}`)
        assert((await result.page.evaluate(() => window.localStorage.getItem('token'))) === null, '被拒绝后不应有会话令牌')
        const after = await memberByEmail({ token, email })
        assert((before === null) === (after === null), '账号数量不应变化')
        await shot({ page: result.page, name: `t-${tamper}` })
      }
      finally {
        await result.context.close()
      }
    })
  }

  await check('T3 令牌是真的时，同一条链路能正常登录（对照组，证明上面的拒绝不是链路坏了）', async () => {
    await control('/next', { email: 'member@acme.test' })
    const result = await signInWithSso({ open, email: 'member@acme.test', pickUser: noPicker })
    try {
      assert(result.ok, `应登录成功：${result.code} ${result.message}`)
    }
    finally {
      await result.context.close()
    }
  })

  await check('T4 用户在身份提供方那边点了拒绝：回到登录页并给出可读提示', async () => {
    await control('/next', { email: 'member@acme.test', deny: true })
    const result = await signInWithSso({ open, email: 'member@acme.test', pickUser: noPicker })
    try {
      assert(!result.ok && result.code === 'IDP_DENIED', `应得到 IDP_DENIED，实际 ${result.code}`)
    }
    finally {
      await result.context.close()
    }
  })

  await check('T5 身份提供方的发现文档报告了另一个颁发者：保存配置被拒绝，提示里有两个地址', async () => {
    await control('/discovery-issuer', { issuer: 'https://somewhere-else.example.com' })
    const saved = await saveOidcConfig({ token, issuer: FAKE_IDP, clientId: 'fema-e2e-fake', clientSecret: FAKE_SECRET })
    await control('/discovery-issuer', { issuer: null })
    assert(saved.status === 409, `应被拒绝，实际 ${saved.status}`)
    const message = saved.json?.params?.message ?? ''
    assert(message.includes('somewhere-else.example.com') && message.includes(FAKE_IDP), `提示应包含两个颁发者：${message}`)
  })
}
finally {
  await resetTenant({ token })
  stopPort({ port: FAKE_IDP_PORT })
  stopPort({ port: FAKE_IDP_PORT + 1 })
  await browser.close()
}
summary()

void WEB
void apiRequest
