import { ADMIN, MEMBER, api, http, signIn, summary } from './lib/s5-kit.mjs'
import { websocketChecks } from './lib/s5-websocket.mjs'

const admin = await signIn(ADMIN)
const member = await signIn(MEMBER)
if (!admin || !member) {
  throw new Error('先跑 s5-compliance.mjs 建好成员账号')
}
await http({ method: 'POST', path: '/project-members', body: { projectId: admin.projectId, userId: member.userId, role: 'Operator' }, token: admin.token })
void api
await websocketChecks({ admin, member })
summary()
