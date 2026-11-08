import { randomBytes } from 'node:crypto'

import { FEMA_API, ISSUER, TOKEN_URL } from './saas-kit.mjs'

const run = randomBytes(3).toString('hex')

export const PASSWORD = 'Passw0rd!'

export const TENANTS = {
  alpha: { code: 't_alpha', name: `甲租赁 ${run}`, slug: `alpha-${run}` },
  beta: { code: 't_beta', name: `乙设备 ${run}`, slug: `beta-${run}` },
}

export const PERSONS = [
  { username: 'alice', name: '甲属主 Alice', email: `alice-${run}@alpha.test`, emailVerified: true },
  { username: 'bob', name: '乙属主 Bob', email: `bob-${run}@beta.test`, emailVerified: true },
  { username: 'carol', name: '两家都在的 Carol', email: `carol-${run}@shared.test`, emailVerified: true },
  { username: 'pat', name: '只有手机号的 Pat', email: null, emailVerified: false, phone: '+8613800000001', phoneVerified: true },
  { username: 'uma', name: '邮箱未验证的 Uma', email: `uma-${run}@alpha.test`, emailVerified: false },
  { username: 'dave', name: '乙家成员 Dave', email: `dave-${run}@beta.test`, emailVerified: true },
  { username: 'erin', name: '将被移出的 Erin', email: `erin-${run}@alpha.test`, emailVerified: true },
  { username: 'frank', name: '复核移出的 Frank', email: `frank-${run}@alpha.test`, emailVerified: true },
  { username: 'gina', name: '未受邀的 Gina', email: `gina-${run}@alpha.test`, emailVerified: true },
  { username: 'hank', name: '乱序事件的 Hank', email: `hank-${run}@alpha.test`, emailVerified: true },
  { username: 'otto', name: '被管理员停用的 Otto', email: `otto-${run}@alpha.test`, emailVerified: true },
  { username: 'quinn', name: '从名录加入的 Quinn', email: null, emailVerified: false, phone: '+8613800000009', phoneVerified: true },
].map((person) => ({ password: PASSWORD, ...person }))

export const MEMBERS = {
  aliceA: { id: `m-a-alice-${run}`, tenant: TENANTS.alpha.code, username: 'alice' },
  bobB: { id: `m-b-bob-${run}`, tenant: TENANTS.beta.code, username: 'bob' },
  carolA: { id: `m-a-carol-${run}`, tenant: TENANTS.alpha.code, username: 'carol' },
  carolB: { id: `m-b-carol-${run}`, tenant: TENANTS.beta.code, username: 'carol' },
  patA: { id: `m-a-pat-${run}`, tenant: TENANTS.alpha.code, username: 'pat' },
  umaA: { id: `m-a-uma-${run}`, tenant: TENANTS.alpha.code, username: 'uma' },
  daveB: { id: `m-b-dave-${run}`, tenant: TENANTS.beta.code, username: 'dave' },
  erinA: { id: `m-a-erin-${run}`, tenant: TENANTS.alpha.code, username: 'erin' },
  frankA: { id: `m-a-frank-${run}`, tenant: TENANTS.alpha.code, username: 'frank' },
  ginaA: { id: `m-a-gina-${run}`, tenant: TENANTS.alpha.code, username: 'gina' },
  hankA: { id: `m-a-hank-${run}`, tenant: TENANTS.alpha.code, username: 'hank' },
  ottoA: { id: `m-a-otto-${run}`, tenant: TENANTS.alpha.code, username: 'otto' },
  quinnA: { id: `m-a-quinn-${run}`, tenant: TENANTS.alpha.code, username: 'quinn' },
}

export const CLIENTS = {
  oidcA: { clientId: 'ipaas-t_alpha', secret: `oidc-a-${randomBytes(12).toString('hex')}`, kind: 'oidc', tenant: TENANTS.alpha.code },
  oidcB: { clientId: 'ipaas-t_beta', secret: `oidc-b-${randomBytes(12).toString('hex')}`, kind: 'oidc', tenant: TENANTS.beta.code },
  serviceA: { clientId: 'svc-t_alpha', secret: `svc-a-${randomBytes(12).toString('hex')}`, kind: 'service', tenant: TENANTS.alpha.code },
  serviceB: { clientId: 'svc-t_beta', secret: `svc-b-${randomBytes(12).toString('hex')}`, kind: 'service', tenant: TENANTS.beta.code },
  platform: { clientId: 'svc-platform', secret: `svc-p-${randomBytes(12).toString('hex')}`, kind: 'service', tenant: null, acceptsAnyTenant: false },
}

export function seedBody() {
  return {
    reset: true,
    tenants: Object.values(TENANTS).map(({ code, name }) => ({ code, name })),
    persons: PERSONS,
    members: Object.values(MEMBERS),
    clients: Object.values(CLIENTS),
    objects: [
      { tenant: TENANTS.alpha.code, app: 'rental-agreement', object: 'contract', id: '981233', data: { id: '981233', code: 'HT-2026-0001', status: 'ACTIVE', customer: '甲方客户' } },
      { tenant: TENANTS.beta.code, app: 'rental-agreement', object: 'contract', id: '981233', data: { id: '981233', code: 'HT-BETA-9', status: 'ACTIVE', customer: '乙方客户' } },
    ],
  }
}

export function provisionBody({ tenant, owner, oidcClient, serviceClient, serviceSecret }) {
  return {
    externalRef: { issuer: ISSUER, tenantId: tenant.code },
    name: tenant.name,
    slug: tenant.slug,
    owner: { subject: owner.id, ...(ownerEmail({ owner }) ? { email: ownerEmail({ owner }) } : {}), firstName: owner.username },
    oidc: {
      issuer: ISSUER,
      clientId: oidcClient.clientId,
      clientSecret: oidcClient.secret,
      scopes: 'openid profile email',
      extraAuthParams: { tenant: tenant.code },
      displayName: 'FEMA',
      sessionRecheckMinutes: 5,
    },
    memberEvents: { connectionExternalId: 'fema', apiUrl: FEMA_API },
    connections: [{
      externalId: 'fema',
      connectorName: '@fema-ipaas/connector-fema',
      displayName: 'FEMA 业务接口',
      auth: {
        type: 'OAUTH2_CLIENT_CREDENTIALS',
        tokenUrl: TOKEN_URL,
        clientId: serviceClient.clientId,
        clientSecret: serviceSecret ?? serviceClient.secret,
        props: { apiUrl: FEMA_API, tenant: tenant.code },
      },
    }],
  }
}

function ownerEmail({ owner }) {
  return PERSONS.find((person) => person.username === owner.username && person.emailVerified)?.email ?? null
}
