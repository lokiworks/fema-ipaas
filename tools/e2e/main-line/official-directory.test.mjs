import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDirectoryOfficial } from './official-directory.mjs'

test('DingTalk suppresses identical work notices within a day and keeps application scope', () => {
  let time = 1000
  const routes = createDirectoryOfficial({ target: 'dingtalk', kit: { ok: (body) => body }, now: () => time }).routes()
  const send = (body) => routes['POST /dingtalk/topapi/message/corpconversation/asyncsend_v2']({ body, query: new URLSearchParams({ access_token: 'dingtalk-token-app' }), headers: {} })
  const body = { agent_id: 1, userid_list: 'hr', msg: { msgtype: 'text', text: { content: 'Employee onboarded' } } }
  assert.equal(send(body).errcode, 0)
  assert.equal(send(body).errcode, 0)
  assert.equal(routes['GET /__admin/dingtalk']().messages.length, 1)
  assert.equal(routes['GET /__admin/dingtalk']().suppressedNotices, 1)
  send({ ...body, agent_id: 2 })
  send({ ...body, userid_list: 'it' })
  send({ ...body, msg: { msgtype: 'text', text: { content: 'Employee transferred' } } })
  assert.equal(routes['GET /__admin/dingtalk']().messages.length, 4)
  time += 86400000
  send(body)
  assert.equal(routes['GET /__admin/dingtalk']().messages.length, 5)
})
