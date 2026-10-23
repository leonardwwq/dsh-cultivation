// v7「人格不生硬」相关测试：
// 扮演规则不再强制首句起手、称呼方向/语气词称呼、成长近似去重、心情按会话隔离与过期、
// 新版 DSH session API 读取、跨会话事件 id 不撞号、v6 → v7 迁移。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRoleRules, renderPersonaCard, toneInstruction,
  usableAddress, textSimilarity, isSimilarGrowth, dedupeGrowth, addGrowth, GROWTH_CAP,
  isMoodFresh, sessionMoodOf, setSessionMood, normalizeSessionMoods, SESSION_MOODS_CAP,
  readSessionEvents, buildEventsFromLog, buildTurnEvent, appendEvents, getEventLog, sessionEvents, openingOf,
  migrate, DEFAULT_USER_ID
} from '../lib/core.js'

function ev(type, seq, time, data) { return { type, seq, time, data } }
const turnStart = (seq, t, turn = 1) => ev('turn/start', seq, t, { turn })
const turnEnd = (seq, t, turn = 1) => ev('turn/end', seq, t, { turn, reason: { kind: 'completed' } })
const userEv = (seq, t, text) => ev('user/message', seq, t, { id: 'm' + seq, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
const asstEv = (seq, t, text) => ev('assistant/message', seq, t, { turn: 1, step: 1, message: { id: 'a' + seq, role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model' } } })

function teaseData(extra) {
  return Object.assign({
    version: 7,
    settings: { concentration: 80 },
    templates: {
      t: {
        id: 't', name: '毒舌损友',
        fields: { name: '江离', speechStyle: ['口语', '毒舌'], catchphrase: '就这？就这啊？', userAddress: '喂' },
        memory: { facts: [], userInfo: [], relationship: [], promises: [], events: [] }, memoryLog: [],
        growth: [], mood: { text: '还在想你那个雇工方案', since: '2026-10-16' }
      }
    },
    relations: { t: { local: { intimacy: 30 } } },
    sessions: {}
  }, extra || {})
}

// ============ 扮演规则 ============
test('规则：不再强制「第一句」用称呼/口头禅起手，并明确反对重复开场', () => {
  const rules = buildRoleRules('毒舌损友')
  assert.ok(!rules.includes('第一句必须'))
  assert.ok(!rules.includes('硬性规则'))
  assert.ok(rules.includes('不要每轮用同一个称呼、语气词或口头禅起手'))
  assert.ok(rules.includes('persona_memory_log') && rules.includes('persona_adjust_intimacy') && rules.includes('persona_growth'))
})

test('角色卡：语气词「喂」不当称呼注入；口头禅标注偶尔用', () => {
  const card = renderPersonaCard(teaseData(), 't', DEFAULT_USER_ID, { sessionId: 's1', today: '2026-10-19' })
  assert.ok(!card.includes('叫用户：喂'))
  assert.ok(!card.includes('对用户的称呼：喂'))
  assert.ok(!card.includes('口吻锚点'))
  assert.ok(card.includes('偶尔冒一句才像口头禅'))
})

test('角色卡：正常称呼以「偶尔」方式注入；超长描述不当称呼', () => {
  const d = teaseData()
  d.templates.t.fields.userAddress = '兄弟'
  assert.ok(renderPersonaCard(d, 't').includes('熟了以后偶尔这么叫用户：兄弟'))
  d.templates.t.fields.userAddress = '她从不把客户当朋友，但会留意记录每个客户看不出来的小习惯'
  assert.ok(!renderPersonaCard(d, 't').includes('偶尔这么叫用户'))
})

test('usableAddress：语气词/超长/空 → 空串；正常称呼保留', () => {
  assert.equal(usableAddress('喂'), '')
  assert.equal(usableAddress('  '), '')
  assert.equal(usableAddress('x'.repeat(13)), '')
  assert.equal(usableAddress('小同学'), '小同学')
})

test('toneInstruction：语气是性格上的偏移，不再要求「您」', () => {
  for (const v of [0, 20, 40, 60, 80, 100]) assert.ok(!toneInstruction(v).includes('您'))
  assert.ok(toneInstruction(10).includes('保持你本来的性格'))
})

// ============ 成长去重 ============
test('成长：换个说法的同一件事被判为近似', () => {
  const a = { trait: '先接住真实雇佣，再核实劳动关系', note: '用户明确说明女友经营个体户、自己实际受雇领工资，应先承认真实雇佣的可能性' }
  const b = { trait: '先接住现实雇佣，再核实劳动关系', note: '用户明确说女友经营个体户、自己实际受雇领工资，提醒我不能只凭关系判断' }
  assert.ok(isSimilarGrowth(a, b))
})

test('成长：真正不同的变化不会被误判', () => {
  const a = { trait: '开始信任对方', note: '长期被真诚对待，开始相信有人不会离开' }
  const b = { trait: '愿意主动开口', note: '有人一直陪着，开始主动靠近、先开口聊天' }
  assert.ok(!isSimilarGrowth(a, b))
  assert.ok(textSimilarity('', 'abc') === 0)
})

test('成长：dedupeGrowth 保留每组最新一条；addGrowth 拒绝近似、接受新特质、受 cap 约束', () => {
  const list = [
    { trait: '先接住真实雇佣，再核实劳动关系', since: '2026-10-16', note: 'n1' },
    { trait: '先接住现实雇佣，再核实劳动关系', since: '2026-10-15', note: 'n2' },
    { trait: '开始信任对方', since: '2026-10-01', note: '' }
  ]
  const out = dedupeGrowth(list)
  assert.equal(out.length, 2)
  assert.equal(out[0].since, '2026-10-16')
  const dup = addGrowth(out, { trait: '先接住真实雇佣，再核实劳动关系！', since: '2026-10-19', note: '' })
  assert.equal(dup.added, false)
  assert.equal(dup.reason, 'similar')
  const ok = addGrowth(out, { trait: '愿意主动开口', since: '2026-10-19', note: '' })
  assert.equal(ok.added, true)
  assert.equal(ok.growth[0].trait, '愿意主动开口')
  let g = []
  for (let i = 0; i < GROWTH_CAP + 3; i++) g = addGrowth(g, { trait: '特质' + 'ABCDEFGHIJKLMNOP'[i] + i + '号' + 'xyzwvutsrqponml'[i], since: '2026-10-19', note: '' }).growth
  assert.ok(g.length <= GROWTH_CAP)
})

// ============ 心情按会话 ============
test('心情：只注入本会话的、未过期的心情；模板上的旧全局心情不再注入', () => {
  const d = teaseData()
  // 模板上有旧心情，但会话没有 → 不注入
  assert.ok(!renderPersonaCard(d, 't', DEFAULT_USER_ID, { sessionId: 's1', today: '2026-10-19' }).includes('雇工方案'))
  setSessionMood(d, 's1', '被拉来查插件，还挺有意思', '2026-10-19')
  const c1 = renderPersonaCard(d, 't', DEFAULT_USER_ID, { sessionId: 's1', today: '2026-10-19' })
  const c2 = renderPersonaCard(d, 't', DEFAULT_USER_ID, { sessionId: 's2', today: '2026-10-19' })
  assert.ok(c1.includes('被拉来查插件'))
  assert.ok(!c2.includes('被拉来查插件'))
  // 过期
  assert.equal(sessionMoodOf(d, 's1', '2026-10-25'), null)
})

test('isMoodFresh：边界与非法', () => {
  assert.ok(isMoodFresh({ text: 'x', since: '2026-10-17' }, '2026-10-19'))
  assert.ok(!isMoodFresh({ text: 'x', since: '2026-10-16' }, '2026-10-19'))
  assert.ok(!isMoodFresh({ text: 'x', since: '' }, '2026-10-19'))
  assert.ok(!isMoodFresh(null, '2026-10-19'))
})

test('normalizeSessionMoods：过滤非法、超 cap 按新→旧保留', () => {
  const sm = { a: { text: 'x', since: '2026-10-01' }, b: null, c: { text: '' } }
  assert.deepEqual(Object.keys(normalizeSessionMoods(sm)), ['a'])
  const big = {}
  for (let i = 0; i < SESSION_MOODS_CAP + 5; i++) big['s' + i] = { text: 't', since: '2026-' + String(1 + (i % 12)).padStart(2, '0') + '-01' }
  assert.equal(Object.keys(normalizeSessionMoods(big)).length, SESSION_MOODS_CAP)
})

// ============ 新版 DSH session 读取 ============
test('readSessionEvents：新版 snapshotEvents / 旧版 events / 都没有', () => {
  const log = [turnStart(0, 1), userEv(1, 2, '问'), asstEv(2, 3, '答')]
  const newSession = { snapshotEvents: (from) => Object.freeze(log.filter((e) => e.seq >= from)) }
  assert.equal(readSessionEvents(newSession, 0).length, 3)
  assert.equal(readSessionEvents(newSession, 2).length, 1)
  assert.equal(readSessionEvents({ events: log }).length, 3)
  assert.deepEqual(readSessionEvents({}), [])
  assert.deepEqual(readSessionEvents(null), [])
  const throwing = { snapshotEvents() { throw new Error('x') }, events: log }
  assert.equal(readSessionEvents(throwing).length, 3)
})

test('事件 id：带 sessionId 时跨会话不撞号，且与 turn/end 是否写入无关', () => {
  const open = [turnStart(5, 1), userEv(6, 2, '问'), asstEv(7, 3, '答')]
  const closed = [...open, turnEnd(8, 4)]
  const a = buildTurnEvent(open, { sessionId: 'A' })
  const b = buildTurnEvent(closed, { sessionId: 'A' })
  assert.equal(a.id, 'evt-A-5')
  assert.equal(a.id, b.id)
  assert.equal(a.sessionId, 'A')
  const relations = {}
  appendEvents(relations, 'p', DEFAULT_USER_ID, buildEventsFromLog(closed, -1, { sessionId: 'A' }))
  appendEvents(relations, 'p', DEFAULT_USER_ID, buildEventsFromLog(closed, -1, { sessionId: 'B' }))
  const log = getEventLog(relations, 'p', DEFAULT_USER_ID)
  assert.equal(log.length, 2) // 旧实现两边都是 evt-8，第二条会被当重复丢掉
  assert.equal(sessionEvents(log, 'B').length, 1)
  assert.deepEqual(sessionEvents(log, ''), [])
})

test('openingOf：取第一个标点前的开场', () => {
  assert.equal(openingOf('喂，大刀阔斧可以'), '喂')
  assert.equal(openingOf('就这？就这啊？'), '就这')
  assert.equal(openingOf(''), '')
})

// ============ 迁移 v6 → v7 ============
test('migrate v6 → v7：出厂称呼「喂」改为「兄弟」、成长去重、sessionMoods 初始化、幂等', () => {
  const d = {
    version: 6, settings: {}, sessions: {}, relations: {},
    templates: {
      'sample-tease': { id: 'sample-tease', name: '毒舌损友', fields: { userAddress: '喂' }, growth: [
        { trait: '先接住真实雇佣，再核实劳动关系', since: '2026-10-16', note: 'a' },
        { trait: '先接住现实雇佣，再核实劳动关系', since: '2026-10-16', note: 'b' }
      ] },
      other: { id: 'other', name: 'X', fields: { userAddress: '喂' } }
    }
  }
  const out = migrate(d)
  assert.equal(out.version, 7)
  assert.equal(out.templates['sample-tease'].fields.userAddress, '兄弟')
  assert.equal(out.templates.other.fields.userAddress, '喂') // 用户自建角色不动（渲染时会被 usableAddress 忽略）
  assert.equal(out.templates['sample-tease'].growth.length, 1)
  assert.deepEqual(out.sessionMoods, {})
  const again = migrate(JSON.parse(JSON.stringify(out)))
  assert.deepEqual(again, out)
})
