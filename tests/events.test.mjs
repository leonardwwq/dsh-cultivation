// 事件层（Event Layer）测试：Conversation → Event Log
// 覆盖：完整事件记录、tool call / plugin 排除、用户隔离、跨会话共享、cap、旧数据兼容、
//       calibrate / personaSaying 的完整上下文输入。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EVENT_LOG_CAP, EVENT_TEXT_MAX, EVENT_SOURCE_CONVERSATION,
  contentText, normalizeEvent, normalizeEventLog,
  buildTurnEvent, buildEventsFromLog,
  getEventLog, appendEvents, eventIdsUpTo, eventsToChatHistory, eventsToSayingLines,
  normalizeRelations, migrate, DEFAULT_USER_ID
} from '../lib/core.js'

// ---- 构造 DSH session log 事件的辅助函数（形状对齐 dsh-session SessionEvent） ----
function ev(type, seq, time, data) { return { type, seq, time, data } }
function turnStart(seq, time, turn = 1) { return ev('turn/start', seq, time, { turn }) }
function turnEnd(seq, time, turn = 1) { return ev('turn/end', seq, time, { turn, reason: { kind: 'completed' } }) }
function userMsgEv(seq, time, text, source = { kind: 'user' }) {
  return ev('user/message', seq, time, { id: 'm' + seq, role: 'user', content: [{ type: 'text', text }], source })
}
function pluginEv(seq, time, text) { return userMsgEv(seq, time, text, { kind: 'plugin', plugin: 'dsh-cultivation' }) }
function asstMsgEv(seq, time, blocks) {
  const content = typeof blocks === 'string' ? [{ type: 'text', text: blocks }] : blocks
  return ev('assistant/message', seq, time, { turn: 1, step: 1, message: { id: 'a' + seq, role: 'assistant', content, source: { kind: 'model', provider: 'p', model: 'm' } } })
}
function toolCallEv(seq, time, name = 'bash') {
  return ev('tool/call', seq, time, { turn: 1, step: 1, callId: 'c' + seq, name, arguments: '{}' })
}
function toolResultEv(seq, time) {
  return ev('tool/result', seq, time, {
    turn: 1, step: 1,
    message: { id: 't' + seq, role: 'user', content: [{ type: 'tool-result', toolCallId: 'c' + seq, content: [{ type: 'text', text: '工具结果' }] }], source: { kind: 'tool', callId: 'c' + seq } }
  })
}

// ============ Test 1：Event 同时记录 userInput 和 agentResponse ============
test('Test 1：Event 同时记录 userInput 和 agentResponse', () => {
  const turn = [
    turnStart(1, 1000),
    userMsgEv(2, 1001, '今天心情如何？'),
    asstMsgEv(3, 1002, '还行吧，刚改完稿子。')
  ]
  const e = buildTurnEvent(turn)
  assert.ok(e)
  assert.equal(e.userInput, '今天心情如何？')
  assert.equal(e.agentResponse, '还行吧，刚改完稿子。')
  assert.equal(e.significance, null)
  assert.equal(e.source, EVENT_SOURCE_CONVERSATION)
  assert.equal(e.id, 'evt-3')
  assert.equal(e.timestamp, 1000) // turn/start 时间
})

// ============ Test 2：Tool call 不会被当作 agentResponse ============
test('Test 2：Tool call 不会被当作 agentResponse', () => {
  // tool/call 是独立事件类型，不是消息；assistant 的 tool-call 块也不是 text
  const turn = [
    turnStart(1, 1000),
    userMsgEv(2, 1001, '帮我跑一下测试'),
    asstMsgEv(3, 1002, [{ type: 'text', text: '我来查' }, { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"cmd":"npm test"}' }]),
    toolCallEv(4, 1003, 'bash'),
    toolResultEv(5, 1004),
    asstMsgEv(6, 1005, '测试全部通过。')
  ]
  const e = buildTurnEvent(turn)
  assert.ok(e)
  assert.equal(e.agentResponse, '我来查\n测试全部通过。') // 只有 text 块
  assert.ok(!e.agentResponse.includes('npm test'))
  assert.ok(!e.agentResponse.includes('tool'))
})

test('contentText：只提取 text 块，忽略 tool-call / reasoning / image / tool-result', () => {
  assert.equal(contentText([{ type: 'text', text: 'A' }, { type: 'tool-call', id: 'c', name: 'bash', arguments: '{}' }]), 'A')
  assert.equal(contentText([{ type: 'reasoning', text: '内心想法' }, { type: 'text', text: 'B' }]), 'B')
  assert.equal(contentText([{ type: 'image', attachment: { id: 'i' } }]), '')
  assert.equal(contentText(null), '')
  assert.equal(contentText('str'), '')
})

// ============ Test 3：Plugin message 不会被当作 agentResponse（也不是用户输入） ============
test('Test 3：Plugin message 不会进入 userInput / agentResponse', () => {
  // 纯插件驱动轮次（如角色提醒注入）：无真实用户输入 → 不构成事件
  const pluginOnlyTurn = [
    turnStart(1, 1000),
    pluginEv(2, 1001, '【角色提醒】你是「高冷御姐」…'),
    asstMsgEv(3, 1002, '知道了。')
  ]
  assert.equal(buildTurnEvent(pluginOnlyTurn), null)

  // 混合轮次：真实用户消息 + 插件提醒 → userInput 只含真实用户消息
  const mixedTurn = [
    turnStart(1, 1000),
    pluginEv(2, 1001, '【角色提醒】你是「高冷御姐」…'),
    userMsgEv(3, 1002, '周末去看电影吗？'),
    asstMsgEv(4, 1003, '可以。')
  ]
  const e = buildTurnEvent(mixedTurn)
  assert.ok(e)
  assert.equal(e.userInput, '周末去看电影吗？')
  assert.ok(!e.userInput.includes('角色提醒'))
  assert.equal(e.agentResponse, '可以。')
})

// ============ Test 4：不同 user 的 eventLog 完全隔离 ============
test('Test 4：不同 user 的 eventLog 完全隔离', () => {
  const relations = {}
  const e1 = { id: 'evt-1', timestamp: 1000, userInput: 'u1 说话', agentResponse: 'r1', significance: null, source: 'conversation' }
  const e2 = { id: 'evt-2', timestamp: 2000, userInput: 'u2 说话', agentResponse: 'r2', significance: null, source: 'conversation' }
  appendEvents(relations, 'personaA', 'user1', [e1])
  appendEvents(relations, 'personaA', 'user2', [e2])
  const log1 = getEventLog(relations, 'personaA', 'user1')
  const log2 = getEventLog(relations, 'personaA', 'user2')
  assert.equal(log1.length, 1)
  assert.equal(log1[0].userInput, 'u1 说话')
  assert.equal(log2.length, 1)
  assert.equal(log2[0].userInput, 'u2 说话')
  // 互不影响
  appendEvents(relations, 'personaA', 'user1', [{ id: 'evt-3', timestamp: 3000, userInput: '再来一句', agentResponse: '', significance: null, source: 'conversation' }])
  assert.equal(getEventLog(relations, 'personaA', 'user1').length, 2)
  assert.equal(getEventLog(relations, 'personaA', 'user2').length, 1)
})

// ============ Test 5：同一 user 不同 session 共享 eventLog ============
test('Test 5：同一 user 不同 session 共享 eventLog', () => {
  const relations = {}
  // 两个"会话"都归属同一用户（DEFAULT_USER_ID），追加到同一行
  appendEvents(relations, 'personaA', DEFAULT_USER_ID, [{ id: 'evt-1', timestamp: 1000, userInput: '第一轮', agentResponse: '回1', significance: null, source: 'conversation' }])
  appendEvents(relations, 'personaA', DEFAULT_USER_ID, [{ id: 'evt-2', timestamp: 2000, userInput: '第二轮（另一个会话）', agentResponse: '回2', significance: null, source: 'conversation' }])
  const log = getEventLog(relations, 'personaA', DEFAULT_USER_ID)
  assert.equal(log.length, 2)
  assert.deepEqual(log.map((x) => x.userInput), ['第一轮', '第二轮（另一个会话）'])
})

// ============ Test 6：eventLog 超过 cap 后只保留最近 N 条 ============
test('Test 6：eventLog 超过 cap 后只保留最近 N 条', () => {
  const relations = {}
  const many = Array.from({ length: EVENT_LOG_CAP + 20 }, (_, i) => ({ id: 'evt-' + i, timestamp: i, userInput: 'u' + i, agentResponse: 'r' + i, significance: null, source: 'conversation' }))
  appendEvents(relations, 'p', 'u', many)
  const log = getEventLog(relations, 'p', 'u')
  assert.equal(log.length, EVENT_LOG_CAP)
  // 保留的是最近的（id 最大/时间最新）
  assert.equal(log[log.length - 1].id, 'evt-' + (EVENT_LOG_CAP + 19))
  assert.equal(log[0].id, 'evt-' + 20)
})

test('appendEvents：按 id 去重（幂等追加）', () => {
  const relations = {}
  const e = { id: 'evt-1', timestamp: 1000, userInput: 'u', agentResponse: 'r', significance: null, source: 'conversation' }
  appendEvents(relations, 'p', 'u', [e])
  appendEvents(relations, 'p', 'u', [e])
  assert.equal(getEventLog(relations, 'p', 'u').length, 1)
})

// ============ Test 7：旧 v6 数据没有 eventLog 时能够正常读取 ============
test('Test 7：旧 v6 数据没有 eventLog 时正常读取（缺失视为空）', () => {
  const relations = { personaA: { local: { intimacy: 72 } } }
  assert.deepEqual(getEventLog(relations, 'personaA', 'local'), [])
  // normalizeRelations 也不崩溃、保留 intimacy
  const norm = normalizeRelations(relations)
  assert.equal(norm.personaA.local.intimacy, 72)
  assert.deepEqual(getEventLog(norm, 'personaA', 'local'), [])
})

test('normalizeEventLog：非法条目被过滤，cap 生效', () => {
  assert.deepEqual(normalizeEventLog(null), [])
  assert.deepEqual(normalizeEventLog([null, {}, { userInput: 'u', agentResponse: 'r' }]).length, 1)
  assert.equal(normalizeEvent({ userInput: '', agentResponse: '' }), null)
  const long = normalizeEvent({ id: 'x', userInput: 'u'.repeat(EVENT_TEXT_MAX + 100), agentResponse: 'r' })
  assert.equal(long.userInput.length, EVENT_TEXT_MAX)
})

// ============ Test 8：旧 memory / mood / growth / intimacy 不受影响 ============
test('Test 8：旧 memory / mood / growth / intimacy 不受影响', () => {
  const data = {
    version: 5,
    templates: {
      p1: {
        id: 'p1', name: '角色A', intimacy: 73,
        fields: { name: '林晚' },
        memory: { facts: ['出身书香门第'], events: [{ d: '2024-08-18', t: '看电影' }] },
        memoryLog: [{ d: '2024-08-19', t: '约好烧烤' }],
        growth: [{ trait: '信任', since: '2024-08-01', note: 'n' }],
        mood: { text: '不错', since: '2024-08-19' }
      }
    },
    sessions: {}
  }
  const out = migrate(data)
  // intimacy 迁移到 relations，eventLog 缺失不报错
  assert.equal(out.relations.p1[DEFAULT_USER_ID].intimacy, 73)
  assert.deepEqual(getEventLog(out.relations, 'p1', DEFAULT_USER_ID), [])
  // memory / mood / growth 原样保留
  assert.deepEqual(out.templates.p1.memory.facts, ['出身书香门第'])
  assert.deepEqual(out.templates.p1.memory.events, [{ d: '2024-08-18', t: '看电影' }])
  assert.deepEqual(out.templates.p1.memoryLog, [{ d: '2024-08-19', t: '约好烧烤' }])
  assert.deepEqual(out.templates.p1.growth, [{ trait: '信任', since: '2024-08-01', note: 'n' }])
  assert.deepEqual(out.templates.p1.mood, { text: '不错', since: '2024-08-19' })
})

// ============ Test 9：calibrate 能获得 user + agent 完整上下文 ============
test('Test 9：eventsToChatHistory 输出 user + agent 完整上下文', () => {
  const evLog = [
    { id: 'e1', timestamp: 1000, userInput: '你好', agentResponse: '嗨', significance: null, source: 'conversation' },
    { id: 'e2', timestamp: 2000, userInput: '帮我写代码', agentResponse: '写好了', significance: null, source: 'conversation' }
  ]
  const hist = eventsToChatHistory(evLog)
  assert.deepEqual(hist, [
    { role: 'user', text: '你好' },
    { role: 'assistant', text: '嗨' },
    { role: 'user', text: '帮我写代码' },
    { role: 'assistant', text: '写好了' }
  ])
  // 空 agentResponse 的事件只产生 user 消息
  const sparse = eventsToChatHistory([{ id: 'e3', timestamp: 3000, userInput: '只干活', agentResponse: '', significance: null, source: 'conversation' }])
  assert.deepEqual(sparse, [{ role: 'user', text: '只干活' }])
  // 窗口限制：只取最近 limit 个事件
  const many = Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i, timestamp: i, userInput: 'u' + i, agentResponse: 'r' + i, significance: null, source: 'conversation' }))
  const hist2 = eventsToChatHistory(many, 3)
  assert.deepEqual(hist2.map((m) => m.text), ['u7', 'r7', 'u8', 'r8', 'u9', 'r9'])
})

// ============ Test 10：personaSaying 能获得 user + agent 完整上下文 ============
test('Test 10：eventsToSayingLines 输出 user + agent 完整上下文', () => {
  const evLog = [
    { id: 'e1', timestamp: 1000, userInput: '周末去看电影？', agentResponse: '可以，但别迟到。', significance: null, source: 'conversation' }
  ]
  const lines = eventsToSayingLines(evLog)
  assert.equal(lines.length, 1)
  assert.ok(lines[0].includes('用户：周末去看电影？'))
  assert.ok(lines[0].includes('你（回复）：可以，但别迟到。'))
  // 空回复不产生「你」行
  const lines2 = eventsToSayingLines([{ id: 'e2', timestamp: 2000, userInput: 'q', agentResponse: '', significance: null, source: 'conversation' }])
  assert.ok(lines2[0].includes('用户：q'))
  assert.ok(!lines2[0].includes('你（回复）'))
})

// ============ buildEventsFromLog：按 turn 分组 / 尾部未闭合 / fromSeq ============
test('buildEventsFromLog：按 turn 分组构建多个事件', () => {
  const log = [
    turnStart(1, 1000, 1), userMsgEv(2, 1001, '第一问'), asstMsgEv(3, 1002, '第一答'), turnEnd(4, 1003, 1),
    turnStart(5, 2000, 2), userMsgEv(6, 2001, '第二问'), asstMsgEv(7, 2002, '第二答'), turnEnd(8, 2003, 2)
  ]
  const events = buildEventsFromLog(log)
  assert.equal(events.length, 2)
  assert.equal(events[0].userInput, '第一问')
  assert.equal(events[0].agentResponse, '第一答')
  assert.equal(events[1].userInput, '第二问')
})

test('buildEventsFromLog：尾部未闭合的 turn（turn/end 未写入）也产出事件', () => {
  const log = [
    turnStart(1, 1000), userMsgEv(2, 1001, '问'), asstMsgEv(3, 1002, '答')
    // 无 turn/end（turn-stopping 时机）
  ]
  const events = buildEventsFromLog(log)
  assert.equal(events.length, 1)
  assert.equal(events[0].userInput, '问')
  assert.equal(events[0].agentResponse, '答')
})

test('buildEventsFromLog：fromSeq 只处理新事件，且幂等', () => {
  const log = [
    turnStart(1, 1000), userMsgEv(2, 1001, '旧问'), asstMsgEv(3, 1002, '旧答'), turnEnd(4, 1003),
    turnStart(5, 2000), userMsgEv(6, 2001, '新问'), asstMsgEv(7, 2002, '新答')
  ]
  const first = buildEventsFromLog(log, 0)
  assert.equal(first.length, 2)
  const lastSeq = log[log.length - 1].seq
  // 游标推进后再跑：无新事件
  assert.deepEqual(buildEventsFromLog(log, lastSeq), [])
  // 只跑后半段
  const second = buildEventsFromLog(log, 4)
  assert.equal(second.length, 1)
  assert.equal(second[0].userInput, '新问')
})

test('buildEventsFromLog：纯插件轮次被跳过（不产生事件）', () => {
  const log = [
    turnStart(1, 1000), pluginEv(2, 1001, '【角色提醒】…'), asstMsgEv(3, 1002, '嗯'), turnEnd(4, 1003),
    turnStart(5, 2000), userMsgEv(6, 2001, '真问题'), asstMsgEv(7, 2002, '真回答'), turnEnd(8, 2003)
  ]
  const events = buildEventsFromLog(log)
  assert.equal(events.length, 1)
  assert.equal(events[0].userInput, '真问题')
})

// ============ eventIdsUpTo：Belief evidence 的时序前缀（更早或等于当前事件） ============
test('eventIdsUpTo：返回从开头到当前事件（含）的 id 前缀', () => {
  const events = [{ id: 'evt-1' }, { id: 'evt-2' }, { id: 'evt-3' }]
  assert.deepEqual(eventIdsUpTo(events, 'evt-1'), ['evt-1'])
  assert.deepEqual(eventIdsUpTo(events, 'evt-2'), ['evt-1', 'evt-2'])
  assert.deepEqual(eventIdsUpTo(events, 'evt-3'), ['evt-1', 'evt-2', 'evt-3'])
})

test('eventIdsUpTo：eventId 不存在时返回空数组（不退回全长）', () => {
  const events = [{ id: 'evt-1' }, { id: 'evt-2' }]
  assert.deepEqual(eventIdsUpTo(events, 'evt-404'), [])
})

test('eventIdsUpTo：非数组 / 空数组 / 空 id 返回空数组', () => {
  assert.deepEqual(eventIdsUpTo(null, 'evt-1'), [])
  assert.deepEqual(eventIdsUpTo('evt-1', 'evt-1'), [])
  assert.deepEqual(eventIdsUpTo([], 'evt-1'), [])
  assert.deepEqual(eventIdsUpTo([{ id: 'evt-1' }], ''), [])
})

test('eventIdsUpTo：重复 id 不重复输出、空 id / 脏条目被过滤', () => {
  const events = [{ id: 'evt-1' }, { id: '' }, null, { id: 'evt-2' }, { id: 'evt-2' }, { id: 'evt-3' }]
  assert.deepEqual(eventIdsUpTo(events, 'evt-3'), ['evt-1', 'evt-2', 'evt-3'])
})
