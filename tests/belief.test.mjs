// Belief 层（Persona → User）测试：可修正信念的建立与更新
// 覆盖：Proposal 校验、evidence 真实性、action 白名单、更新公式、幂等、cap、隔离、持久化、读取接口。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BELIEF_CAP, BELIEF_LEARNING_RATE, BELIEF_CONTRADICTION_FACTOR, BELIEF_CREATE_MIN_CONFIDENCE,
  validateBeliefProposal, applyBeliefUpdate, trimBeliefs, getRelevantBeliefs,
  normalizeBeliefs, normalizeBeliefUpdates, getBeliefs, ensureBeliefsArray, getBeliefUpdates, hasBeliefUpdate, recordBeliefUpdate,
  buildBeliefSystem, buildBeliefContext, normalizeRelations, migrate, intimacyOf, DEFAULT_USER_ID
} from '../lib/core.js'

// ---- 辅助 ----
function ctxFor(eventIds, beliefIds, eventId = 'evt-1') {
  return { eventId, eventIds: new Set(eventIds), beliefIds: new Set(beliefIds) }
}
function createProposal(over = {}) {
  return Object.assign({ candidate: true, action: 'create', beliefId: '', proposition: '我认为用户可能比较重视工作与生活的平衡', confidence: 0.65, evidence: ['evt-1'], reasoning: 'r' }, over)
}

// ============ Test 1：合法 create proposal ============
test('Test 1：合法 create proposal 通过校验', () => {
  const v = validateBeliefProposal(createProposal(), ctxFor(['evt-1'], []))
  assert.equal(v.kind, 'apply')
  assert.equal(v.proposal.action, 'create')
  assert.equal(v.proposal.proposition, '我认为用户可能比较重视工作与生活的平衡')
  assert.equal(v.proposal.confidence, 0.65)
  assert.deepEqual(v.proposal.evidence, ['evt-1'])
  assert.equal(v.proposal.eventId, 'evt-1')
})

// ============ Test 2：非法 action 被拒绝 ============
test('Test 2：非法 action 被拒绝', () => {
  for (const bad of ['delete', 'reset', 'create-new', 'replace', '']) {
    const v = validateBeliefProposal(createProposal({ action: bad }), ctxFor(['evt-1'], []))
    assert.equal(v.kind, 'reject', 'action=' + bad + ' 应被拒绝')
  }
})

// ============ Test 3：不存在的 evidence 被拒绝 ============
test('Test 3：不存在的 evidence 被拒绝（不能伪造证据）', () => {
  const v = validateBeliefProposal(createProposal({ evidence: ['evt-fake'] }), ctxFor(['evt-1'], []))
  assert.equal(v.kind, 'reject')
  assert.match(v.reason, /unknown-evidence/)
  // 部分伪造也拒绝
  const v2 = validateBeliefProposal(createProposal({ evidence: ['evt-1', 'evt-fake'] }), ctxFor(['evt-1'], []))
  assert.equal(v2.kind, 'reject')
})

// ============ Test 4：不存在的 beliefId 被拒绝 ============
test('Test 4：不存在的 beliefId 被拒绝', () => {
  const base = { candidate: true, action: 'strengthen', beliefId: 'belief-999', confidence: 0.8, evidence: ['evt-1'], reasoning: 'r' }
  const v = validateBeliefProposal(base, ctxFor(['evt-1'], ['belief-001']))
  assert.equal(v.kind, 'reject')
  assert.match(v.reason, /unknown-belief/)
})

// ============ Test 5：create 能建立 Belief ============
test('Test 5：create 能建立 Belief', () => {
  const beliefs = []
  const v = validateBeliefProposal(createProposal({ beliefId: 'belief-001' }), ctxFor(['evt-1'], []))
  const r = applyBeliefUpdate(beliefs, v.proposal, 1000)
  assert.equal(r.ok, true)
  assert.equal(r.created, true)
  assert.equal(beliefs.length, 1)
  assert.equal(beliefs[0].id, 'belief-001')
  assert.equal(beliefs[0].confidence, 0.65)
  assert.equal(beliefs[0].createdAt, 1000)
  assert.equal(beliefs[0].updatedAt, 1000)
  assert.deepEqual(beliefs[0].evidence, ['evt-1'])
})

// ============ Test 6：strengthen 提高 confidence ============
test('Test 6：strengthen 提高 confidence（learningRate 公式）', () => {
  const beliefs = [{ id: 'belief-001', proposition: 'p', confidence: 0.6, evidence: ['evt-1'], createdAt: 1, updatedAt: 1 }]
  const v = validateBeliefProposal({ candidate: true, action: 'strengthen', beliefId: 'belief-001', confidence: 0.8, evidence: ['evt-2'], reasoning: 'r' }, ctxFor(['evt-2'], ['belief-001']))
  const r = applyBeliefUpdate(beliefs, v.proposal, 2000)
  assert.equal(r.ok, true)
  assert.equal(r.before, 0.6)
  assert.equal(r.after, 0.6 + BELIEF_LEARNING_RATE * 0.8) // 0.8
  assert.equal(beliefs[0].confidence, 0.8)
  assert.equal(beliefs[0].updatedAt, 2000)
  // evidence 合并
  assert.deepEqual(beliefs[0].evidence, ['evt-1', 'evt-2'])
})

// ============ Test 7：weaken 降低 confidence ============
test('Test 7：weaken 降低 confidence', () => {
  const beliefs = [{ id: 'belief-001', proposition: 'p', confidence: 0.8, evidence: ['evt-1'], createdAt: 1, updatedAt: 1 }]
  const v = validateBeliefProposal({ candidate: true, action: 'weaken', beliefId: 'belief-001', confidence: 0.8, evidence: ['evt-2'], reasoning: 'r' }, ctxFor(['evt-2'], ['belief-001']))
  const r = applyBeliefUpdate(beliefs, v.proposal, 2000)
  assert.equal(r.after, 0.6) // 0.8 - 0.25×0.8（代码已规整 4 位小数，无浮点噪声）
  assert.equal(beliefs[0].confidence, 0.6)
})

// ============ Test 8：contradict 降低 confidence（不删除旧信念） ============
test('Test 8：contradict 降低 confidence（不删除）', () => {
  const beliefs = [{ id: 'belief-001', proposition: 'p', confidence: 0.8, evidence: ['evt-1'], createdAt: 1, updatedAt: 1 }]
  const v = validateBeliefProposal({ candidate: true, action: 'contradict', beliefId: 'belief-001', confidence: 1, evidence: ['evt-2'], reasoning: 'r' }, ctxFor(['evt-2'], ['belief-001']))
  const r = applyBeliefUpdate(beliefs, v.proposal, 2000)
  assert.equal(r.after, 0.8 * (1 - BELIEF_CONTRADICTION_FACTOR * 1)) // 0.4
  assert.equal(beliefs[0].confidence, 0.4)
  assert.equal(beliefs.length, 1) // 未删除
})

// ============ Test 9：confidence 永远 0~1 ============
test('Test 9：confidence 永远 0~1（clamp）', () => {
  // strengthen 到顶
  let b1 = [{ id: 'b1', proposition: 'p', confidence: 0.95, evidence: [], createdAt: 1, updatedAt: 1 }]
  let r1 = applyBeliefUpdate(b1, { action: 'strengthen', beliefId: 'b1', confidence: 1, evidence: ['e1'] }, 2)
  assert.equal(r1.after, 1)
  // weaken 到底
  let b2 = [{ id: 'b2', proposition: 'p', confidence: 0.05, evidence: [], createdAt: 1, updatedAt: 1 }]
  let r2 = applyBeliefUpdate(b2, { action: 'weaken', beliefId: 'b2', confidence: 1, evidence: ['e1'] }, 2)
  assert.equal(r2.after, 0)
  // 越界 proposal confidence 被 clamp
  const v = validateBeliefProposal(createProposal({ confidence: 99 }), ctxFor(['evt-1'], []))
  assert.equal(v.proposal.confidence, 1)
})

// ============ Test 10：Belief 数量不超过 30 ============
test('Test 10：Belief 数量不超过 cap（trimBeliefs deterministic 淘汰）', () => {
  const beliefs = []
  for (let i = 0; i < BELIEF_CAP + 5; i++) {
    beliefs.push({ id: 'b' + i, proposition: 'p' + i, confidence: i % 3 === 0 ? 0.2 : 0.8, evidence: ['evt-' + i], createdAt: i, updatedAt: i })
  }
  trimBeliefs(beliefs)
  assert.equal(beliefs.length, BELIEF_CAP)
  // 被淘汰的是 confidence 最低且 updatedAt 最旧的（确定性）
  const ids = new Set(beliefs.map((b) => b.id))
  assert.ok(!ids.has('b0'), '低置信且最旧应被淘汰')
  assert.ok(ids.has('b' + (BELIEF_CAP + 4)), '高置信/最新应保留')
})

// ============ Test 11：同 Event 不会重复更新同一 Belief ============
test('Test 11：同 Event 不会重复更新同一 Belief（幂等记录）', () => {
  const relations = {}
  const rec = recordBeliefUpdate(relations, 'p', 'u', { eventId: 'evt-1', beliefId: 'belief-001', action: 'strengthen', timestamp: 1000 })
  assert.ok(rec)
  assert.equal(recordBeliefUpdate(relations, 'p', 'u', { eventId: 'evt-1', beliefId: 'belief-001', action: 'strengthen', timestamp: 2000 }), null)
  assert.equal(getBeliefUpdates(relations, 'p', 'u').length, 1)
  assert.ok(hasBeliefUpdate(relations, 'p', 'u', 'evt-1'))
  assert.ok(!hasBeliefUpdate(relations, 'p', 'u', 'evt-2'))
})

// ============ Test 12：Belief 与 Event/Appraisal 正确关联 ============
test('Test 12：Belief 与 Event/Appraisal 正确关联（evidence 引用真实事件；prompt 含 appraisal）', () => {
  // evidence 必须来自 eventLog 真实 id
  const v = validateBeliefProposal(createProposal({ evidence: ['evt-21', 'evt-21', 'evt-34'] }), ctxFor(['evt-21', 'evt-34'], []))
  assert.equal(v.kind, 'apply')
  assert.deepEqual(v.proposal.evidence, ['evt-21', 'evt-34']) // 去重
  // buildBeliefSystem 包含 Appraisal 输入
  const sys = buildBeliefSystem({ traitTags: ['谨慎'] }, { id: 'evt-21', userInput: '我辞职了', agentResponse: '怎么突然辞职了？' }, { relevance: 0.9, valence: -0.7, arousal: 0.8, relationshipRelevance: 0.9, uncertainty: 0.8, reasoning: '让人担心' }, [], 60)
  assert.ok(sys.includes('我辞职了'))
  assert.ok(sys.includes('valence=-0.7'))
  assert.ok(sys.includes('让人担心'))
})

// ============ Test 13：不同 user 的 Beliefs 完全隔离 ============
test('Test 13：不同 user 的 Beliefs 完全隔离', () => {
  const relations = {}
  recordBeliefUpdate(relations, 'p', 'u1', { eventId: 'evt-1', beliefId: 'b1', action: 'create', timestamp: 1 })
  recordBeliefUpdate(relations, 'p', 'u2', { eventId: 'evt-1', beliefId: 'b2', action: 'create', timestamp: 1 })
  assert.ok(hasBeliefUpdate(relations, 'p', 'u1', 'evt-1'))
  assert.ok(hasBeliefUpdate(relations, 'p', 'u2', 'evt-1'))
  // 各自可独立追加不同 belief
  const b1 = getBeliefs(relations, 'p', 'u1')
  const b2 = getBeliefs(relations, 'p', 'u2')
  assert.deepEqual(b1, [])
  assert.deepEqual(b2, [])
  // 通过行结构验证隔离
  assert.ok(relations.p.u1)
  assert.ok(relations.p.u2)
  assert.notEqual(relations.p.u1, relations.p.u2)
})

// ============ Test 14：同 user 不同 session 共享 Beliefs ============
test('Test 14：同 user 不同 session 共享 Beliefs（同一 (persona,user) 行）', () => {
  const relations = {}
  // 会话 A 建立 belief
  const beliefsA = []
  const v = validateBeliefProposal(createProposal({ beliefId: 'belief-001' }), ctxFor(['evt-1'], []))
  applyBeliefUpdate(beliefsA, v.proposal, 1000)
  // 把同一 beliefs 数组挂到 (p, DEFAULT_USER_ID) 行
  relations.p = { [DEFAULT_USER_ID]: { intimacy: 0, beliefs: beliefsA } }
  // 会话 B（同 user）读取同一行
  assert.equal(getBeliefs(relations, 'p', DEFAULT_USER_ID).length, 1)
  assert.equal(getBeliefs(relations, 'p', DEFAULT_USER_ID)[0].id, 'belief-001')
})

// ============ Test 15：Belief 失败不影响 Event/Appraisal/Intimacy ============
test('Test 15：Belief 失败不影响 Event/Appraisal/Intimacy', () => {
  const relations = {
    p: { u: { intimacy: 50, eventLog: [{ id: 'evt-1', timestamp: 1, userInput: 'u', agentResponse: 'r', significance: null, source: 'conversation' }], appraisals: [{ eventId: 'evt-1', relevance: 0.8, valence: -0.3, arousal: 0.7, relationshipRelevance: 0.9, uncertainty: 0.5, reasoning: 'r', timestamp: 2 }] } }
  }
  // 校验失败（伪造 evidence）→ 不写任何状态
  const v = validateBeliefProposal(createProposal({ evidence: ['evt-fake'] }), ctxFor(['evt-1'], []))
  assert.equal(v.kind, 'reject')
  assert.equal(getBeliefs(relations, 'p', 'u').length, 0)
  assert.equal(intimacyOf(relations, 'p', 'u'), 50)
  assert.equal(relations.p.u.eventLog.length, 1)
  assert.equal(relations.p.u.appraisals.length, 1)
  // applyBeliefUpdate 失败路径
  const r = applyBeliefUpdate([], { action: 'strengthen', beliefId: 'missing', confidence: 0.8, evidence: [] }, 1)
  assert.equal(r.ok, false)
})

// ============ Test 16：旧 v6 数据正常加载 ============
test('Test 16：旧 v6 数据（无 beliefs）正常加载', () => {
  const data = { version: 6, templates: { p1: { id: 'p1', name: 'A', fields: {} } }, sessions: {}, relations: { p1: { local: { intimacy: 72, eventLog: [], appraisals: [] } } } }
  const out = migrate(data)
  assert.deepEqual(getBeliefs(out.relations, 'p1', 'local'), [])
  assert.deepEqual(getBeliefUpdates(out.relations, 'p1', 'local'), [])
  assert.equal(out.relations.p1.local.intimacy, 72)
})

// ============ Test 17：重新加载 Beliefs 不丢失 ============
test('Test 17：重新加载 Beliefs 不丢失（normalize/migrate 保留）', () => {
  const relations = {
    p1: { local: { intimacy: 60, beliefs: [{ id: 'belief-001', proposition: '我认为用户重视工作生活平衡', confidence: 0.72, evidence: ['evt-21'], createdAt: 100, updatedAt: 200 }], beliefUpdates: [{ eventId: 'evt-21', beliefId: 'belief-001', action: 'create', timestamp: 100 }] } }
  }
  const norm = normalizeRelations(relations)
  assert.equal(norm.p1.local.beliefs.length, 1)
  assert.equal(norm.p1.local.beliefs[0].confidence, 0.72)
  assert.equal(norm.p1.local.beliefUpdates.length, 1)
  // 经 migrate 不丢
  const data = { version: 6, templates: { p1: { id: 'p1', name: 'A', fields: {} } }, sessions: {}, relations }
  const out = migrate(data)
  assert.equal(out.relations.p1.local.beliefs.length, 1)
  assert.deepEqual(out.relations.p1.local.beliefs[0], { id: 'belief-001', proposition: '我认为用户重视工作生活平衡', confidence: 0.72, evidence: ['evt-21'], createdAt: 100, updatedAt: 200 })
})

// ============ Test 18：getRelevantBeliefs 返回正确排序和数量 ============
test('Test 18：新鲜度相同时按 confidence 降序、数量受限', () => {
  const relations = { p: { u: { intimacy: 0, beliefs: [
    { id: 'b1', proposition: 'p1', confidence: 0.4, evidence: [], createdAt: 1, updatedAt: 1 },
    { id: 'b2', proposition: 'p2', confidence: 0.9, evidence: [], createdAt: 1, updatedAt: 1 },
    { id: 'b3', proposition: 'p3', confidence: 0.7, evidence: [], createdAt: 1, updatedAt: 1 },
    { id: 'b4', proposition: 'p4', confidence: 0.2, evidence: [], createdAt: 1, updatedAt: 1 },
    { id: 'b5', proposition: 'p5', confidence: 0.95, evidence: [], createdAt: 1, updatedAt: 1 },
    { id: 'b6', proposition: 'p6', confidence: 0.5, evidence: [], createdAt: 1, updatedAt: 1 }
  ] } } }
  // now 传 2（只比 updatedAt=1 晚 1ms）：六条新鲜度相同，排序退化为纯置信度
  const rel = getRelevantBeliefs(relations, 'p', 'u', 5, 2) // 默认最多 5 条
  assert.equal(rel.length, 5)
  assert.deepEqual(rel.map((b) => b.id), ['b5', 'b2', 'b3', 'b6', 'b1'])
  const rel3 = getRelevantBeliefs(relations, 'p', 'u', 3, 2)
  assert.equal(rel3.length, 3)
  assert.deepEqual(rel3.map((b) => b.id), ['b5', 'b2', 'b3'])
})

// ============ Test 18b：置信度 × 新鲜度（v8）============
test('Test 18b：陈年高置信信念让位给新观察，但不被删除、置信度也不变', () => {
  const now = Date.UTC(2026, 9, 28)
  const day = 86400000
  const old = { id: 'old', proposition: '一条 100% 的老判断', confidence: 1, evidence: [], createdAt: now - 60 * day, updatedAt: now - 60 * day }
  const fresh = { id: 'fresh', proposition: '刚验证的新观察', confidence: 0.6, evidence: [], createdAt: now, updatedAt: now }
  const relations = { p: { u: { intimacy: 0, beliefs: [old, fresh] } } }
  const rel = getRelevantBeliefs(relations, 'p', 'u', 5, now)
  assert.deepEqual(rel.map((b) => b.id), ['fresh', 'old'], '老判断应该排到新的后面')
  // 排序只影响"这一轮先注入谁"：数据本身一个字段都不能变
  assert.equal(old.confidence, 1)
  assert.equal(old.updatedAt, now - 60 * day)
  assert.equal(getBeliefs(relations, 'p', 'u').length, 2, '不能因为排后面就被丢掉')
})

test('Test 18c：注入文本带「多久前确认过」，并自己按新鲜度排序', () => {
  const now = Date.UTC(2026, 9, 28)
  const day = 86400000
  const beliefs = [
    { id: 'a', proposition: '三天前的判断', confidence: 0.6, evidence: [], createdAt: now - 3 * day, updatedAt: now - 3 * day },
    { id: 'b', proposition: '今天的判断', confidence: 0.9, evidence: [], createdAt: now, updatedAt: now }
  ]
  const text = buildBeliefContext(beliefs, 5, now)
  assert.ok(text.includes('今天的判断'), text)
  assert.ok(text.includes('今天确认过'), text)
  assert.ok(text.includes('3 天前确认过'), text)
  assert.ok(text.indexOf('今天的判断') < text.indexOf('三天前的判断'), '新判断排前面')
  // 纯函数：不改动传入数组
  assert.deepEqual(beliefs.map((b) => b.id), ['a', 'b'])
})

// ============ Test 19：无意义 Event 不会产生 Belief ============
test('Test 19：无意义 Event 不会产生 Belief（candidate=false → skip；弱 create 被拒）', () => {
  // LLM 明确 candidate=false
  const v = validateBeliefProposal({ candidate: false }, ctxFor(['evt-1'], []))
  assert.equal(v.kind, 'skip')
  // 缺失 candidate → reject（不产生信念）
  const v2 = validateBeliefProposal({ action: 'create', proposition: 'p', confidence: 0.8, evidence: ['evt-1'] }, ctxFor(['evt-1'], []))
  assert.equal(v2.kind, 'reject')
  // 弱 create（confidence 低于确定性门槛）→ reject，防止信念爆炸
  const v3 = validateBeliefProposal(createProposal({ confidence: BELIEF_CREATE_MIN_CONFIDENCE - 0.1 }), ctxFor(['evt-1'], []))
  assert.equal(v3.kind, 'reject')
  assert.match(v3.reason, /weak-create/)
})

// ============ Test 20：不同 Persona 对同一 Event 可产生不同 Belief Proposal ============
test('Test 20：不同 Persona 对同一 Event 产生不同 Belief Proposal', () => {
  const personaA = { traitTags: ['谨慎', '高安全需求'], fears: '失业', dislikes: '冒险', currentGoal: '攒钱买房' }
  const personaB = { traitTags: ['冒险', '自由'], fears: '被束缚', dislikes: '一成不变', currentGoal: '环游世界' }
  const event = { id: 'evt-1', userInput: '我准备辞职去旅行一年', agentResponse: '听起来很自由' }
  const appraisal = { relevance: 0.9, valence: 0.5, arousal: 0.7, relationshipRelevance: 0.8, uncertainty: 0.6, reasoning: 'r' }
  const sysA = buildBeliefSystem(personaA, event, appraisal, [], 60)
  const sysB = buildBeliefSystem(personaB, event, appraisal, [], 60)
  assert.ok(sysA.includes('谨慎'))
  assert.ok(sysA.includes('失业'))
  assert.ok(sysB.includes('冒险'))
  assert.notEqual(sysA, sysB)
  // mock LLM：两个角色按各自 system 给出不同信念
  const mockLlm = (system) => system.includes('谨慎')
    ? { candidate: true, action: 'create', proposition: '我认为用户可能很冲动，做事不考虑后果', confidence: 0.7, evidence: ['evt-1'], reasoning: '辞职旅行太冒险' }
    : { candidate: true, action: 'create', proposition: '我认为用户可能向往自由、喜欢冒险', confidence: 0.75, evidence: ['evt-1'], reasoning: '和我一样爱自由' }
  const vA = validateBeliefProposal(mockLlm(sysA), ctxFor(['evt-1'], []))
  const vB = validateBeliefProposal(mockLlm(sysB), ctxFor(['evt-1'], []))
  assert.equal(vA.kind, 'apply')
  assert.equal(vB.kind, 'apply')
  assert.notEqual(vA.proposal.proposition, vB.proposal.proposition)
  assert.ok(vA.proposal.proposition.includes('冲动'))
  assert.ok(vB.proposal.proposition.includes('自由'))
})

// ============ 补充 ============
test('补充：normalizeBeliefs 过滤非法条目、cap 生效', () => {
  assert.deepEqual(normalizeBeliefs(null), [])
  assert.deepEqual(normalizeBeliefs([null, {}, { proposition: '' }]), [])
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'b' + i, proposition: 'p' + i, confidence: 0.5, evidence: [], createdAt: i, updatedAt: i }))
  assert.equal(normalizeBeliefs(many).length, BELIEF_CAP)
})

test('补充：applyBeliefUpdate 拒绝重复 id 与非法输入', () => {
  const beliefs = [{ id: 'b1', proposition: 'p', confidence: 0.5, evidence: [], createdAt: 1, updatedAt: 1 }]
  const dup = applyBeliefUpdate(beliefs, { action: 'create', beliefId: 'b1', proposition: 'x', confidence: 0.6, evidence: [] }, 2)
  assert.equal(dup.ok, false)
  assert.match(dup.reason, /duplicate-id/)
  assert.equal(applyBeliefUpdate(null, { action: 'create', proposition: 'x', confidence: 0.6, evidence: [] }, 2).ok, false)
})

test('补充：recordBeliefUpdate 缺 eventId 拒绝、cap 生效', () => {
  const relations = {}
  assert.equal(recordBeliefUpdate(relations, 'p', 'u', { beliefId: 'b', action: 'create' }), null)
  for (let i = 0; i < 60; i++) recordBeliefUpdate(relations, 'p', 'u', { eventId: 'evt-' + i, beliefId: 'b', action: 'create', timestamp: i })
  assert.ok(getBeliefUpdates(relations, 'p', 'u').length <= 50)
})

test('补充：ensureBeliefsArray 确保首条信念挂载到行上（写路径不丢失）', () => {
  const relations = {}
  // 模拟 believeOne 的写路径：行尚不存在 beliefs 键
  const arr = ensureBeliefsArray(relations, 'p', 'u')
  const v = validateBeliefProposal(createProposal({ beliefId: 'belief-001' }), ctxFor(['evt-1'], []))
  applyBeliefUpdate(arr, v.proposal, 1000)
  // 信念必须真正挂在 relations.p.u.beliefs 上（持久化不丢）
  assert.equal(relations.p.u.beliefs.length, 1)
  assert.equal(getBeliefs(relations, 'p', 'u')[0].id, 'belief-001')
  // 再次调用返回同一引用
  assert.equal(ensureBeliefsArray(relations, 'p', 'u'), arr)
})

// ============ 补充：buildBeliefSystem 渲染「可引用的事件 id」（防回归：不得再读 f.__eventIds） ============
test('补充：buildBeliefSystem 渲染调用方传入的事件 id（两个 id 都出现）', () => {
  const event = { id: 'evt-1', userInput: '我辞职了' }
  const sys = buildBeliefSystem({ traitTags: ['谨慎'] }, event, null, [], 60, ['evt-1', 'evt-2'])
  assert.ok(sys.includes('evt-1'))
  assert.ok(sys.includes('evt-2'))
  assert.ok(sys.includes('evt-1、evt-2'))
})

test('补充：buildBeliefSystem 无可引用事件 id 时兜底文案不误导', () => {
  const event = { id: 'evt-1', userInput: '我辞职了' }
  for (const ids of [undefined, []]) {
    const sys = buildBeliefSystem({ traitTags: ['谨慎'] }, event, null, [], 60, ids)
    assert.ok(!sys.includes('由调用方另行提供'))
    assert.ok(sys.includes('（无：本次没有可引用的事件 id，必须 candidate=false）'))
  }
})

test('补充：buildBeliefSystem 对非法 eventIds 不抛异常（非数组当空）', () => {
  const event = { id: 'evt-1', userInput: '我辞职了' }
  for (const ids of [null, 'evt-1', 42, {}]) {
    let sys
    assert.doesNotThrow(() => { sys = buildBeliefSystem({ traitTags: ['谨慎'] }, event, null, [], 60, ids) })
    assert.ok(sys.includes('（无：本次没有可引用的事件 id，必须 candidate=false）'))
  }
})

test('补充：buildBeliefSystem 标注当前事件 id（缺失时不渲染、不打印 undefined）', () => {
  const withId = buildBeliefSystem({ traitTags: ['谨慎'] }, { id: 'evt-42', userInput: '我辞职了' }, null, [], 60, ['evt-42'])
  assert.ok(withId.includes('当前事件 id：evt-42'))
  assert.ok(withId.includes('（evidence 通常应包含它）'))
  assert.ok(withId.includes('引用其它 id 只用于佐证同一判断的更早事件'))
  const noId = buildBeliefSystem({ traitTags: ['谨慎'] }, { userInput: '我辞职了' }, null, [], 60, [])
  assert.ok(!noId.includes('当前事件 id：'))
  assert.ok(!noId.includes('undefined'))
})
