// 核心纯函数测试：normalize*、关系状态 API、亲密度边界、日期解析
// 运行：node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_USER_ID, INTIMACY_MIN, INTIMACY_MAX,
  clampIntimacy, stageName, toneInstruction,
  normalizeRelations, getRelationshipState, updateRelationshipState, intimacyOf, applyIntimacyDelta,
  normalizeMemory, normalizeMemoryLog, normalizeGrowth, normalizeMood,
  emptyMemory, parseDated, renderMemory,
  todayStr, MEMORY_CAPS, MEMORY_LOG_CAP, GROWTH_CAP, MOOD_MAX
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
test('renderMemory：分区渲染（正常与空）', () => {
  const tpl = { memory: { facts: ['出身书香门第'], events: [{ d: '2024-08-18', t: '看了夜场电影' }] }, memoryLog: [{ d: '2024-08-19', t: '约好下周吃烧烤' }] }
  const out = renderMemory(tpl)
  assert.ok(out.includes('长期事实：\n- 出身书香门第'))
  assert.ok(out.includes('2024-08-18：看了夜场电影'))
  assert.ok(out.includes('最近记录：\n- 2024-08-19：约好下周吃烧烤'))
  assert.ok(renderMemory({ memory: null }).includes('（暂无）'))
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
