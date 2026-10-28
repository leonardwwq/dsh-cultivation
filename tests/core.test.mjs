// 核心纯函数测试：normalize*、关系状态 API、亲密度边界、日期解析
// 运行：node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_USER_ID, INTIMACY_MIN, INTIMACY_MAX,
  clampIntimacy, stageName, toneInstruction,
  normalizeRelations, getRelationshipState, updateRelationshipState, intimacyOf, applyIntimacyDelta,
  normalizeMemory, normalizeMemoryLog, normalizeGrowth, normalizeMood,
  emptyMemory, parseDated, renderMemory, renderPersonaCard,
  todayStr, MEMORY_CAPS, MEMORY_LOG_CAP, GROWTH_CAP, MOOD_MAX,
  MEMORY_RENDER_BUDGET, MEMORY_RENDER_CAPS, MEMORY_RENDER_ENTRY_MAX, MEMORY_LOG_RENDER_CAP, MEMORY_LOG_RENDER_LIMIT
} from '../lib/core.js'

// ============ normalizeMemory ============
test('normalizeMemory：正常数据', () => {
  const m = { facts: ['a', 'b'], userInfo: ['u'], relationship: ['r'], promises: ['p'], events: [{ d: '2024-08-19', t: '看电影' }] }
  const out = normalizeMemory(m)
  assert.deepEqual(out.facts, ['a', 'b'])
  assert.deepEqual(out.userInfo, ['u'])
  assert.deepEqual(out.events, [{ d: '2024-08-19', t: '看电影' }])
})

test('normalizeMemory：缺字段 → 空分区', () => {
  assert.deepEqual(normalizeMemory({}), emptyMemory())
  assert.deepEqual(normalizeMemory({ facts: undefined }), emptyMemory())
})

test('normalizeMemory：非法字段（非数组/非对象条目/空串）被过滤', () => {
  const out = normalizeMemory({
    facts: 'not-array',
    userInfo: [123, '', '  ', null],
    relationship: [null, { x: 1 }],
    events: [null, {}, { t: '' }, { d: '2024-08-01', t: 'ok' }]
  })
  assert.deepEqual(out.facts, [])
  // 原行为：String(s).trim() 后过滤空串——123→'123'、null→'null' 均保留
  assert.deepEqual(out.userInfo, ['123', 'null'])
  // 原行为：null→'null'、{x:1}→'[object Object]' 均保留
  assert.deepEqual(out.relationship, ['null', '[object Object]'])
  assert.deepEqual(out.events, [{ d: '2024-08-01', t: 'ok' }])
})

test('normalizeMemory：null / 非对象', () => {
  assert.deepEqual(normalizeMemory(null), emptyMemory())
  assert.deepEqual(normalizeMemory(undefined), emptyMemory())
  assert.deepEqual(normalizeMemory('str'), emptyMemory())
  assert.deepEqual(normalizeMemory(42), emptyMemory())
})

test('normalizeMemory：cap 限制', () => {
  const many = Array.from({ length: 50 }, (_, i) => 'f' + i)
  const out = normalizeMemory({ facts: many, userInfo: many, relationship: many, promises: many, events: many.map((t) => ({ d: '2024-08-01', t })) })
  assert.equal(out.facts.length, MEMORY_CAPS.facts)
  assert.equal(out.userInfo.length, MEMORY_CAPS.userInfo)
  assert.equal(out.relationship.length, MEMORY_CAPS.relationship)
  assert.equal(out.promises.length, MEMORY_CAPS.promises)
  assert.equal(out.events.length, MEMORY_CAPS.events)
})

// ============ normalizeMemoryLog ============
test('normalizeMemoryLog：正常/缺/非法/null/cap', () => {
  const log = [{ d: '2024-08-19', t: 'a' }, { t: 'b' }]
  assert.deepEqual(normalizeMemoryLog(log), [{ d: '2024-08-19', t: 'a' }, { d: '', t: 'b' }])
  assert.deepEqual(normalizeMemoryLog(undefined), [])
  assert.deepEqual(normalizeMemoryLog('x'), [])
  assert.deepEqual(normalizeMemoryLog([null, {}, { t: 1 }]), [{ d: '', t: '1' }])
  const many = Array.from({ length: 100 }, (_, i) => ({ d: '', t: 'e' + i }))
  assert.equal(normalizeMemoryLog(many).length, MEMORY_LOG_CAP)
})

// ============ normalizeGrowth / normalizeMood ============
test('normalizeGrowth：正常/缺/非法/null/cap', () => {
  const g = [{ trait: '信任', since: '2024-08-19', note: '长期被真诚对待' }]
  assert.deepEqual(normalizeGrowth(g), g)
  assert.deepEqual(normalizeGrowth(null), [])
  assert.deepEqual(normalizeGrowth([null, {}, { trait: '' }, { trait: '  开朗  ' }]), [{ trait: '开朗', since: '', note: '' }])
  const many = Array.from({ length: 20 }, (_, i) => ({ trait: 't' + i }))
  assert.equal(normalizeGrowth(many).length, GROWTH_CAP)
})

test('normalizeMood：正常/缺/非法/null', () => {
  assert.deepEqual(normalizeMood({ text: '有点开心', since: '2024-08-19' }), { text: '有点开心', since: '2024-08-19' })
  assert.equal(normalizeMood(null), null)
  assert.equal(normalizeMood({}), null)
  assert.equal(normalizeMood({ text: '   ' }), null)
  const long = normalizeMood({ text: 'x'.repeat(500) })
  assert.equal(long.text.length, MOOD_MAX)
})

// ============ 日期解析 ============
test('parseDated：带日期/不带日期/中文冒号', () => {
  assert.deepEqual(parseDated('2024-08-26：约好吃烧烤', '2024-08-19'), { d: '2024-08-26', t: '约好吃烧烤' })
  assert.deepEqual(parseDated('2024-08-26: 带英文冒号', '2024-08-19'), { d: '2024-08-26', t: '带英文冒号' })
  assert.deepEqual(parseDated('下周去吃饭', '2024-08-19'), { d: '2024-08-19', t: '下周去吃饭' })
})

test('todayStr：格式 YYYY-MM-DD', () => {
  assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/)
})

// ============ renderMemory ============
test('renderMemory：分区渲染（正常与全空）', () => {
  const tpl = { memory: { facts: ['出身书香门第'], events: [{ d: '2024-08-18', t: '看了夜场电影' }] }, memoryLog: [{ d: '2024-08-19', t: '约好下周吃烧烤' }] }
  const out = renderMemory(tpl)
  assert.ok(out.includes('长期事实：\n- 出身书香门第'))
  assert.ok(out.includes('2024-08-18：看了夜场电影'))
  // events 非空时「最近记录」仍渲染：日志可能含尚未归档的新信息（归档失败时尤其重要）
  assert.ok(out.includes('最近记录：\n- 2024-08-19：约好下周吃烧烤'))
  assert.equal(renderMemory({ memory: null }), '')
})

test('renderMemory：空分区不渲染「（暂无）」，全空返回空串', () => {
  assert.equal(renderMemory({ memory: emptyMemory(), memoryLog: [] }), '')
  const out = renderMemory({ memory: { facts: ['只有这一条事实'] } })
  assert.ok(out.includes('长期事实：\n- 只有这一条事实'))
  assert.ok(!out.includes('（暂无）'))
  assert.ok(!out.includes('关于用户：'))
  assert.ok(!out.includes('近期事件：'))
  assert.ok(!out.includes('最近记录：'))
})

test('renderMemory：所有分区塞满时总长 ≤ MEMORY_RENDER_BUDGET，且各分区 ≤ 分区上限', () => {
  const long = '很长的记忆内容'.repeat(40) // 280 字，远超单条上限
  const tpl = {
    memory: {
      facts: Array.from({ length: MEMORY_CAPS.facts }, (_, i) => '事实' + i + long),
      userInfo: Array.from({ length: MEMORY_CAPS.userInfo }, (_, i) => '用户' + i + long),
      relationship: Array.from({ length: MEMORY_CAPS.relationship }, (_, i) => '关系' + i + long),
      promises: Array.from({ length: MEMORY_CAPS.promises }, (_, i) => '承诺' + i + long),
      events: Array.from({ length: MEMORY_CAPS.events }, (_, i) => ({ d: '2024-08-' + String(i + 1).padStart(2, '0'), t: '事件' + i + long }))
    },
    memoryLog: Array.from({ length: MEMORY_LOG_CAP }, (_, i) => ({ d: '2024-09-01', t: '日志' + i + long }))
  }
  const out = renderMemory(tpl)
  assert.ok(out.length <= MEMORY_RENDER_BUDGET, '实际 ' + out.length + ' 字符，超过预算 ' + MEMORY_RENDER_BUDGET)
  // 每个分区（含标题与条目前缀）都不超过自己的上限
  const labels = ['长期事实', '关于用户', '关系状态', '承诺与约定', '近期事件']
  const keys = ['facts', 'userInfo', 'relationship', 'promises', 'events']
  const starts = labels.map((l) => out.indexOf(l + '：'))
  starts.forEach((start, i) => {
    assert.ok(start >= 0, labels[i] + ' 应被渲染')
    const end = i + 1 < starts.length ? starts[i + 1] - 1 : out.indexOf('最近记录：') - 1
    assert.ok(end - start <= MEMORY_RENDER_CAPS[keys[i]], labels[i] + ' 超分区上限')
  })
})

test('renderMemory：最近记录最多 3 条、总长 ≤ 240，且保留最新（头插在开头）', () => {
  // memoryLog 是 unshift 头插：数组开头最新
  const log = Array.from({ length: 20 }, (_, i) => ({ d: '2024-09-' + String(i + 1).padStart(2, '0'), t: '日志第' + i + '条' }))
  const out = renderMemory({ memoryLog: log })
  assert.ok(out.includes('日志第0条'))
  assert.ok(out.includes('日志第1条'))
  assert.ok(out.includes('日志第2条'))
  assert.ok(!out.includes('日志第3条'), '只应渲染最新 3 条')
  const block = out.slice(out.indexOf('最近记录：'))
  assert.ok(block.length <= MEMORY_LOG_RENDER_CAP, '实际 ' + block.length + ' 字符')
  assert.equal((block.match(/^- /gm) || []).length, MEMORY_LOG_RENDER_LIMIT)
  assert.ok(out.length <= MEMORY_RENDER_BUDGET)
})

test('renderMemory：分区超限丢旧留新（facts 保留末尾，events 保留开头）', () => {
  const facts = Array.from({ length: MEMORY_CAPS.facts }, (_, i) => '事实' + String(i).padStart(2, '0') + 'x'.repeat(40))
  const events = Array.from({ length: MEMORY_CAPS.events }, (_, i) => ({ d: '2024-08-' + String(i + 1).padStart(2, '0'), t: '事件' + String(i).padStart(2, '0') + 'x'.repeat(40) }))
  const out = renderMemory({ memory: { facts, events } })
  // facts 是 push 追加，末尾最新：保留事实19，丢弃事实00
  assert.ok(out.includes('事实19'))
  assert.ok(!out.includes('事实00'))
  // events 是 unshift 头插，开头最新：保留事件00，丢弃事件19
  assert.ok(out.includes('事件00'))
  assert.ok(!out.includes('事件19'))
})

test('renderMemory：单条超长条目被截断（≤120 字 + 省略号）', () => {
  const long = '开头' + '中'.repeat(300) + '结尾'
  const out = renderMemory({ memory: { facts: [long] } })
  const line = out.split('\n').find((l) => l.startsWith('- '))
  assert.ok(line.endsWith('…'))
  assert.equal(line.length, 2 + MEMORY_RENDER_ENTRY_MAX)
  assert.ok(!out.includes('结尾'))
})

test('renderPersonaCard：记忆全空时不渲染空的「你的记忆」标题', () => {
  const data = {
    version: 6,
    settings: { concentration: 80 },
    templates: {
      p: { id: 'p', name: '角色P', fields: { name: '角色P' }, memory: emptyMemory(), memoryLog: [], growth: [], mood: null }
    },
    relations: {},
    sessions: {}
  }
  assert.ok(!renderPersonaCard(data, 'p').includes('【你的记忆'))
  data.templates.p.memory.facts = ['一个会被记住的事实']
  const card = renderPersonaCard(data, 'p')
  assert.ok(card.includes('【你的记忆（今天：'))
  assert.ok(card.includes('一个会被记住的事实'))
})

// ============ 关系状态 / 亲密度（Test 1/2/4/5） ============
test('Test 1：不同用户隔离 — Persona A + User1=80 与 User2=20 互不影响', () => {
  const relations = {}
  updateRelationshipState(relations, 'personaA', 'user1', { intimacy: 80 })
  updateRelationshipState(relations, 'personaA', 'user2', { intimacy: 20 })
  assert.equal(intimacyOf(relations, 'personaA', 'user1'), 80)
  assert.equal(intimacyOf(relations, 'personaA', 'user2'), 20)
  // 更新 user1 不影响 user2
  applyIntimacyDelta(relations, 'personaA', 'user1', -30)
  assert.equal(intimacyOf(relations, 'personaA', 'user1'), 50)
  assert.equal(intimacyOf(relations, 'personaA', 'user2'), 20)
})

test('Test 2：同用户多会话共享 — 同一 userId 读写同一行', () => {
  const relations = {}
  // 两个"会话"都归属同一用户（DEFAULT_USER_ID），应共享同一 intimacy
  updateRelationshipState(relations, 'personaA', DEFAULT_USER_ID, { intimacy: 40 })
  applyIntimacyDelta(relations, 'personaA', DEFAULT_USER_ID, 15)
  assert.equal(intimacyOf(relations, 'personaA', DEFAULT_USER_ID), 55)
  // 另一个会话再次读取/更新，看到的是同一个值
  applyIntimacyDelta(relations, 'personaA', DEFAULT_USER_ID, -5)
  assert.equal(intimacyOf(relations, 'personaA', DEFAULT_USER_ID), 50)
})

test('Test 4：intimacy=100 时继续 +5 不得超过 100', () => {
  const relations = {}
  updateRelationshipState(relations, 'p', 'u', { intimacy: 100 })
  const res = applyIntimacyDelta(relations, 'p', 'u', 5)
  assert.equal(res.after, INTIMACY_MAX)
  assert.equal(intimacyOf(relations, 'p', 'u'), INTIMACY_MAX)
})

test('Test 5：intimacy=0 时继续 -5 不得低于 0', () => {
  const relations = {}
  updateRelationshipState(relations, 'p', 'u', { intimacy: 0 })
  const res = applyIntimacyDelta(relations, 'p', 'u', -5)
  assert.equal(res.after, INTIMACY_MIN)
  assert.equal(intimacyOf(relations, 'p', 'u'), INTIMACY_MIN)
})

test('intimacy 边界：clampIntimacy 只夹 0..100、不四舍五入、非法回退 0', () => {
  assert.equal(clampIntimacy(-3), 0)
  assert.equal(clampIntimacy(150), 100)
  assert.equal(clampIntimacy(73.4), 73.4) // 与旧行为一致：保留小数
  assert.equal(clampIntimacy('abc'), 0)
  assert.equal(clampIntimacy(NaN), 0)
  assert.equal(clampIntimacy(undefined), 0)
  assert.equal(clampIntimacy('73'), 73)
})

test('五阶段边界：0/20/40/60/80 分界', () => {
  assert.equal(stageName(0), '冷淡')
  assert.equal(stageName(19.9), '冷淡')
  assert.equal(stageName(20), '客气')
  assert.equal(stageName(39), '客气')
  assert.equal(stageName(40), '熟络')
  assert.equal(stageName(59), '熟络')
  assert.equal(stageName(60), '亲密')
  assert.equal(stageName(79), '亲密')
  assert.equal(stageName(80), '依赖')
  assert.equal(stageName(100), '依赖')
  assert.ok(toneInstruction(0).includes('疏离'))
  assert.ok(toneInstruction(100).includes('依赖'))
})

// ============ normalizeRelations ============
test('normalizeRelations：正常/缺/非法/null/钳制', () => {
  assert.deepEqual(normalizeRelations(null), {})
  assert.deepEqual(normalizeRelations({}), {})
  assert.deepEqual(normalizeRelations({ p: null }), {})
  assert.deepEqual(normalizeRelations({ p: { u1: { intimacy: 80 }, u2: { intimacy: -5 }, u3: 'bad', u4: { intimacy: 250 } } }), {
    p: { u1: { intimacy: 80 }, u2: { intimacy: 0 }, u4: { intimacy: 100 } }
  })
})

test('getRelationshipState / updateRelationshipState：创建、读取、更新', () => {
  const relations = {}
  assert.equal(getRelationshipState(relations, 'p', 'u'), null)
  updateRelationshipState(relations, 'p', 'u', { intimacy: 30 })
  assert.deepEqual(getRelationshipState(relations, 'p', 'u'), { intimacy: 30 })
  updateRelationshipState(relations, 'p', 'u', { intimacy: 500 })
  assert.equal(intimacyOf(relations, 'p', 'u'), 100)
  // 非法 patch 不写入
  updateRelationshipState(relations, 'p', 'u', { intimacy: 'oops' })
  assert.equal(intimacyOf(relations, 'p', 'u'), 0)
  // 缺参防御
  assert.equal(getRelationshipState(relations, '', 'u'), null)
  assert.equal(updateRelationshipState(relations, 'p', '', { intimacy: 1 }), null)
})

test('applyIntimacyDelta：非法 delta 拒绝且不改状态', () => {
  const relations = {}
  updateRelationshipState(relations, 'p', 'u', { intimacy: 50 })
  const res = applyIntimacyDelta(relations, 'p', 'u', 'x')
  assert.equal(res.ok, false)
  assert.equal(intimacyOf(relations, 'p', 'u'), 50)
})
