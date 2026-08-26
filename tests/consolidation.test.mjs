// Belief Consolidation 测试：整理碎片化 / 明显冲突的 Belief
// 覆盖：merge / conflict 的校验与执行、确定性规则、幂等、隔离、cap、旧数据兼容、失败处理、Response 兼容。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BELIEF_CAP, BELIEF_CONFLICT_DECAY, BELIEF_CONSOLIDATION_CANDIDATE_LIMIT, BELIEF_EVIDENCE_MAX,
  validateConsolidationProposal, applyConsolidation,
  normalizeBeliefConsolidations, getBeliefConsolidations, hasConsolidation, recordBeliefConsolidation,
  buildConsolidationSystem,
  getBeliefs, ensureBeliefsArray, getRelevantBeliefs, renderPersonaCard,
  normalizeRelations, migrate, intimacyOf, DEFAULT_USER_ID
} from '../lib/core.js'

// ---- 辅助 ----
function belief(id, proposition, confidence, evidence = []) {
  return { id, proposition, confidence, evidence, createdAt: 1, updatedAt: 1 }
}
function ctxFor(eventIds, beliefIds) {
  return { eventIds: new Set(eventIds), beliefIds: new Set(beliefIds) }
}
function mergeProposal(over = {}) {
  return Object.assign({ action: 'merge', beliefIds: ['A', 'B'], proposition: '用户可能不重视工作侵占私人时间', confidence: 0.9, evidence: ['evt-1', 'evt-3'], reasoning: '表述高度相近' }, over)
}

// ============ Test 1：Merge ============
test('Test 1：Merge 按确定性规则执行（confidence=max、evidence=union、数量减少）', () => {
  const beliefs = [
    belief('A', '用户可能不喜欢加班', 0.7, ['evt-1', 'evt-3']),
    belief('B', '用户可能重视工作生活平衡', 0.8, ['evt-3', 'evt-7'])
  ]
  const v = validateConsolidationProposal(mergeProposal(), ctxFor(['evt-1', 'evt-3', 'evt-7'], ['A', 'B']))
  assert.equal(v.kind, 'apply')
  const r = applyConsolidation(beliefs, v.proposal, 1000)
  assert.equal(r.ok, true)
  assert.equal(r.action, 'merge')
  // A/B 被移除，C 加入
  assert.equal(beliefs.length, 1)
  assert.equal(beliefs[0].id, r.targetBeliefId)
  assert.equal(beliefs[0].proposition, '用户可能不重视工作侵占私人时间')
  // confidence 由代码决定 = max(0.7, 0.8)（LLM 提议 0.9 不参与最终计算）
  assert.equal(beliefs[0].confidence, 0.8)
  // evidence = union(A, B)，最多 3 个
  assert.deepEqual(beliefs[0].evidence, ['evt-1', 'evt-3', 'evt-7'])
  assert.equal(beliefs[0].evidence.length, BELIEF_EVIDENCE_MAX)
})

// ============ Test 2：Merge 不合法时 reject，原 Beliefs 不变 ============
test('Test 2：Merge 不合法时 reject（原 Beliefs 完全不变）', () => {
  const orig = [belief('A', '用户可能不喜欢加班', 0.7, ['evt-1']), belief('B', '用户可能重视工作生活平衡', 0.8, ['evt-3'])]
  const snapshot = JSON.stringify(orig)
  const base = ctxFor(['evt-1', 'evt-3'], ['A', 'B'])
  // beliefId 不存在
  assert.equal(validateConsolidationProposal(mergeProposal({ beliefIds: ['A', 'missing'] }), base).kind, 'reject')
  // proposition 为空
  assert.equal(validateConsolidationProposal(mergeProposal({ proposition: '   ' }), base).kind, 'reject')
  // proposition 超长 → reject（不截断接受）
  assert.equal(validateConsolidationProposal(mergeProposal({ proposition: '长'.repeat(200) }), base).kind, 'reject')
  // evidence 不存在（伪造）
  assert.equal(validateConsolidationProposal(mergeProposal({ evidence: ['evt-fake'] }), base).kind, 'reject')
  // evidence 为空
  assert.equal(validateConsolidationProposal(mergeProposal({ evidence: [] }), base).kind, 'reject')
  // 单条 beliefIds
  assert.equal(validateConsolidationProposal(mergeProposal({ beliefIds: ['A'] }), base).kind, 'reject')
  // 非法 action
  assert.equal(validateConsolidationProposal({ action: 'delete', beliefIds: ['A', 'B'] }, base).kind, 'reject')
  assert.equal(validateConsolidationProposal({ action: 'replace-all' }, base).kind, 'reject')
  // 所有 reject 后原 Beliefs 完全不变
  assert.equal(JSON.stringify(orig), snapshot)
  // 非法 proposal 直接 apply 也不改
  assert.equal(applyConsolidation(orig, null, 1).ok, false)
  assert.equal(JSON.stringify(orig), snapshot)
})

// ============ Test 3：Conflict ============
test('Test 3：Conflict 只降置信度、不删除、intimacy 不变', () => {
  const relations = { p: { u: { intimacy: 60, beliefs: [belief('A', '用户可能喜欢独处', 0.8, ['evt-1']), belief('B', '用户可能非常喜欢社交', 0.7, ['evt-2'])] } } }
  const beliefs = getBeliefs(relations, 'p', 'u')
  const v = validateConsolidationProposal({ action: 'conflict', beliefIds: ['A', 'B'], reasoning: '同一维度相反取向' }, ctxFor(['evt-1', 'evt-2'], ['A', 'B']))
  assert.equal(v.kind, 'apply')
  const r = applyConsolidation(beliefs, v.proposal, 1000)
  assert.equal(r.ok, true)
  assert.equal(r.action, 'conflict')
  // 两条仍存在
  assert.equal(beliefs.length, 2)
  // 都降了 ×0.8（代码已规整 4 位小数）
  assert.equal(beliefs.find((b) => b.id === 'A').confidence, 0.64)
  assert.equal(beliefs.find((b) => b.id === 'B').confidence, 0.56)
  // intimacy 不变
  assert.equal(intimacyOf(relations, 'p', 'u'), 60)
})

// ============ Test 4：False conflict 保守处理 ============
test('Test 4：False conflict 保守处理（不武断删除/定性，只轻微降置信度）', () => {
  // 真实用户可同时喜欢独处与熟人社交——即使 LLM 误判返回 conflict，
  // 系统也不删除任何一条、不产生新 belief、只是轻微降两条的置信度。
  const beliefs = [belief('A', '用户可能喜欢独处', 0.85, ['evt-1']), belief('B', '用户可能喜欢和熟悉的朋友出去玩', 0.75, ['evt-2'])]
  const snapshot = JSON.stringify(beliefs)
  const v = validateConsolidationProposal({ action: 'conflict', beliefIds: ['A', 'B'], reasoning: '看似矛盾' }, ctxFor(['evt-1', 'evt-2'], ['A', 'B']))
  assert.equal(v.kind, 'apply')
  const r = applyConsolidation(beliefs, v.proposal, 1000)
  assert.equal(r.ok, true)
  assert.equal(beliefs.length, 2) // 没有删除
  assert.equal(beliefs[0].proposition, '用户可能喜欢独处') // 没有改写
  assert.equal(beliefs[1].proposition, '用户可能喜欢和熟悉的朋友出去玩')
  // 只轻微降置信度（保守：宁可保留不确定，不替用户定性）
  assert.equal(beliefs[0].confidence, 0.68)
  // prompt 层面也约束了冲突必须极保守
  const sys = buildConsolidationSystem(beliefs, ['evt-1', 'evt-2'])
  assert.ok(sys.includes('真实用户完全可以既喜欢独处'))
  assert.ok(sys.includes('这种情况不是冲突'))
  assert.ok(!sys.includes('delete'))
  assert.ok(!sys.includes('replace all'))
})

// ============ Test 5：No-op ============
test('Test 5：action=none 不改变任何状态、无副作用', () => {
  const relations = { p: { u: { intimacy: 60, beliefs: [belief('A', 'p1', 0.6, ['evt-1']), belief('B', 'p2', 0.6, ['evt-2'])] } } }
  const before = JSON.stringify(relations)
  const v = validateConsolidationProposal({ action: 'none' }, ctxFor([], ['A', 'B']))
  assert.equal(v.kind, 'skip')
  assert.equal(JSON.stringify(relations), before)
})

// ============ Test 6：Idempotency ============
test('Test 6：同一 batch 不重复执行（hasConsolidation 幂等）', () => {
  const relations = {}
  recordBeliefConsolidation(relations, 'p', 'u', { action: 'merge', sourceBeliefIds: ['A', 'B'], targetBeliefId: 'C', timestamp: 1 })
  // 同一组合（无序）再次检查 → 已处理
  assert.ok(hasConsolidation(relations, 'p', 'u', ['B', 'A']))
  // 不同组合 → 未处理
  assert.ok(!hasConsolidation(relations, 'p', 'u', ['A', 'C']))
  // 端到端：同 batch 执行两次，第二次不改变状态
  const beliefs = [belief('A', 'p1', 0.7, ['evt-1']), belief('B', 'p2', 0.8, ['evt-2'])]
  const v = validateConsolidationProposal(mergeProposal({ evidence: ['evt-1', 'evt-2'] }), ctxFor(['evt-1', 'evt-2'], ['A', 'B']))
  assert.equal(v.kind, 'apply')
  const r1 = applyConsolidation(beliefs, v.proposal, 1000)
  assert.equal(r1.ok, true)
  const afterFirst = JSON.stringify(beliefs)
  // merge 后 A/B 已不在 active —— 再对相同 beliefIds 执行会因缺源而失败
  const r2 = applyConsolidation(beliefs, v.proposal, 2000)
  assert.equal(r2.ok, false)
  assert.equal(JSON.stringify(beliefs), afterFirst)
})

// ============ Test 7：不同 Persona 隔离 ============
test('Test 7：Consolidation 不跨 Persona', () => {
  const relations = {
    pA: { local: { intimacy: 0, beliefs: [belief('A1', 'pA1', 0.7, ['evt-1']), belief('A2', 'pA2', 0.7, ['evt-1'])] } },
    pB: { local: { intimacy: 0, beliefs: [belief('B1', 'pB1', 0.7, ['evt-1']), belief('B2', 'pB2', 0.7, ['evt-1'])] } }
  }
  // 对 pA 执行 merge
  const beliefsA = getBeliefs(relations, 'pA', 'local')
  const v = validateConsolidationProposal(mergeProposal({ beliefIds: ['A1', 'A2'], proposition: '合并A', evidence: ['evt-1'] }), ctxFor(['evt-1'], ['A1', 'A2']))
  assert.equal(v.kind, 'apply')
  applyConsolidation(beliefsA, v.proposal, 1000)
  assert.equal(getBeliefs(relations, 'pA', 'local').length, 1)
  assert.equal(getBeliefs(relations, 'pB', 'local').length, 2) // pB 不受影响
})

// ============ Test 8：不同 User 隔离 ============
test('Test 8：Consolidation 不跨 User', () => {
  const relations = {
    p: {
      userA: { intimacy: 0, beliefs: [belief('A1', 'ua1', 0.7, ['evt-1']), belief('A2', 'ua2', 0.7, ['evt-1'])] },
      userB: { intimacy: 0, beliefs: [belief('B1', 'ub1', 0.7, ['evt-1']), belief('B2', 'ub2', 0.7, ['evt-1'])] }
    }
  }
  const beliefsA = getBeliefs(relations, 'p', 'userA')
  const v = validateConsolidationProposal(mergeProposal({ beliefIds: ['A1', 'A2'], proposition: '合并A', evidence: ['evt-1'] }), ctxFor(['evt-1'], ['A1', 'A2']))
  assert.equal(v.kind, 'apply')
  applyConsolidation(beliefsA, v.proposal, 1000)
  assert.equal(getBeliefs(relations, 'p', 'userA').length, 1)
  assert.equal(getBeliefs(relations, 'p', 'userB').length, 2) // userB 不受影响
})

// ============ Test 9：Response Generation 兼容 ============
test('Test 9：Consolidation 后 getRelevantBeliefs / Response Prompt 正常', () => {
  const relations = {
    pA: { local: { intimacy: 60, beliefs: [belief('A', '用户可能不喜欢加班', 0.7, ['evt-1']), belief('B', '用户可能重视工作生活平衡', 0.8, ['evt-3']), belief('C', '用户可能热爱阅读', 0.9, ['evt-5'])] } }
  }
  // 先 consolidation（merge A+B）
  const beliefs = getBeliefs(relations, 'pA', 'local')
  const v = validateConsolidationProposal(mergeProposal({ beliefIds: ['A', 'B'], proposition: '用户可能很重视工作生活平衡', evidence: ['evt-1', 'evt-3'] }), ctxFor(['evt-1', 'evt-3', 'evt-5'], ['A', 'B', 'C']))
  applyConsolidation(beliefs, v.proposal, 1000)
  // getRelevantBeliefs 仍正常（按 confidence 排序）
  const relevant = getRelevantBeliefs(relations, 'pA', 'local')
  assert.equal(relevant.length, 2)
  assert.equal(relevant[0].proposition, '用户可能热爱阅读') // 0.9 最高
  assert.equal(relevant[1].proposition, '用户可能很重视工作生活平衡') // max(0.7,0.8)=0.8
  // Response Prompt 仍能读取合并后的 Beliefs（第五阶段不破坏）
  const data = { version: 6, settings: { concentration: 80 }, templates: { pA: { id: 'pA', name: '角色A', fields: { name: '林晚', traitTags: ['高冷'] }, memory: { facts: [], userInfo: [], relationship: [], promises: [], events: [] }, memoryLog: [], growth: [], mood: null } }, relations, sessions: {} }
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('用户可能很重视工作生活平衡'))
  assert.ok(card.includes('用户可能热爱阅读'))
  assert.ok(!card.includes('用户可能不喜欢加班')) // 已被合并移除
})

// ============ Test 10：旧数据兼容 ============
test('Test 10：旧数据（无 beliefConsolidations）正常', () => {
  const relations = { pA: { local: { intimacy: 60, beliefs: [belief('A', 'p1', 0.6, ['evt-1'])] } } }
  assert.deepEqual(getBeliefConsolidations(relations, 'pA', 'local'), [])
  assert.ok(!hasConsolidation(relations, 'pA', 'local', ['A']))
  // normalize/migrate 不崩溃
  const norm = normalizeRelations(relations)
  assert.equal(norm.pA.local.beliefs.length, 1)
  const data = { version: 6, templates: { pA: { id: 'pA', name: 'A', fields: {} } }, sessions: {}, relations }
  const out = migrate(data)
  assert.deepEqual(getBeliefConsolidations(out.relations, 'pA', 'local'), [])
})

// ============ Test 11：LLM 失败不影响其他层 ============
test('Test 11：Consolidation 失败不影响对话/Beliefs/Intimacy/Memory', () => {
  const relations = {
    p: { u: { intimacy: 50, beliefs: [belief('A', 'p1', 0.7, ['evt-1']), belief('B', 'p2', 0.7, ['evt-2'])],
      eventLog: [{ id: 'evt-1', timestamp: 1, userInput: 'u', agentResponse: 'r', significance: null, source: 'conversation' }],
      appraisals: [{ eventId: 'evt-1', relevance: 0.5, valence: 0.1, arousal: 0.2, relationshipRelevance: 0.6, uncertainty: 0.3, reasoning: 'r', timestamp: 2 }] } }
  }
  const before = JSON.stringify(relations)
  // LLM 返回非法 JSON / 校验 reject / apply 失败 → 全部静默，状态不变
  assert.equal(validateConsolidationProposal(null, ctxFor(['evt-1'], ['A', 'B'])).kind, 'reject')
  assert.equal(validateConsolidationProposal('garbage', ctxFor(['evt-1'], ['A', 'B'])).kind, 'reject')
  assert.equal(applyConsolidation(getBeliefs(relations, 'p', 'u'), null, 1).ok, false)
  assert.equal(JSON.stringify(relations), before)
})

// ============ Test 12：cap ============
test('Test 12：Consolidation 后 beliefs 数量仍 ≤ cap', () => {
  const beliefs = []
  for (let i = 0; i < BELIEF_CAP; i++) beliefs.push(belief('b' + i, 'p' + i, 0.5 + (i % 5) * 0.1, ['evt-' + i]))
  // 先对前两条 merge（数量 -1 → 29）
  const v = validateConsolidationProposal(mergeProposal({ beliefIds: ['b0', 'b1'], proposition: '合并' }), ctxFor(Array.from({ length: BELIEF_CAP + 5 }, (_, i) => 'evt-' + i), beliefs.map((b) => b.id)))
  assert.equal(v.kind, 'apply')
  applyConsolidation(beliefs, v.proposal, 1)
  assert.ok(beliefs.length <= BELIEF_CAP)
  // 即使从 35 条开始 consolidation 后也不超 cap（trimBeliefs 兜底在编排器里，这里验证 apply 不超）
  const many = []
  for (let i = 0; i < BELIEF_CAP + 5; i++) many.push(belief('m' + i, 'p' + i, 0.6, ['evt-' + i]))
  const v2 = validateConsolidationProposal(mergeProposal({ beliefIds: ['m0', 'm1'], proposition: '合并' }), ctxFor(Array.from({ length: BELIEF_CAP + 10 }, (_, i) => 'evt-' + i), many.map((b) => b.id)))
  applyConsolidation(many, v2.proposal, 1)
  assert.equal(many.length, BELIEF_CAP + 4) // merge 减一；cap 兜底由 trimBeliefs 在编排器负责
})

// ============ 行为验证：碎片化 Beliefs → 更少、更稳定的 Beliefs ============
test('行为验证：多轮积累的碎片 Belief 被整理（数量下降、evidence 不凭空、Response 仍可读）', () => {
  // 模拟多轮对话后积累的碎片 Belief（评审中的例子）
  const relations = {
    pA: { local: { intimacy: 65, beliefs: [
      belief('A', '用户可能喜欢安静独处', 0.62, ['evt-1']),
      belief('B', '用户可能不喜欢社交', 0.65, ['evt-3']),
      belief('C', '用户可能喜欢户外活动', 0.58, ['evt-7'])
    ] } }
  }
  const eventIds = ['evt-1', 'evt-3', 'evt-7']
  // mock LLM：识别出 A/B 高度相关，提议 merge（C 与它们不同维度，不合并）
  const mockProposal = { action: 'merge', beliefIds: ['A', 'B'], proposition: '用户可能偏内向、喜欢安静独处', confidence: 0.66, evidence: ['evt-1', 'evt-3'], reasoning: '两条都在描述用户内向倾向' }
  const v = validateConsolidationProposal(mockProposal, ctxFor(eventIds, ['A', 'B', 'C']))
  assert.equal(v.kind, 'apply')
  const beliefs = getBeliefs(relations, 'pA', 'local')
  const r = applyConsolidation(beliefs, v.proposal, 1000)
  assert.equal(r.ok, true)
  // 1) active Beliefs 数量下降：3 → 2
  assert.equal(beliefs.length, 2)
  // 2) evidence 没有凭空产生：合并信念的 evidence = union(A,B) = [evt-1, evt-3]
  const merged = beliefs.find((b) => b.proposition.includes('内向'))
  assert.deepEqual(merged.evidence, ['evt-1', 'evt-3'])
  assert.equal(merged.confidence, 0.65) // max(0.62, 0.65)，确定性规则
  // 3) Response Generation 仍能读取新 Beliefs
  const data = { version: 6, settings: { concentration: 80 }, templates: { pA: { id: 'pA', name: '角色A', fields: { name: '林晚', traitTags: ['高冷'] }, memory: { facts: [], userInfo: [], relationship: [], promises: [], events: [] }, memoryLog: [], growth: [], mood: null } }, relations, sessions: {} }
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('用户可能偏内向、喜欢安静独处'))
  assert.ok(card.includes('用户可能喜欢户外活动'))
  // A/B 作为独立信念已被合并移除——旧表述不再单独作为一条信念出现（合并后的新表述取代它们）
  const mergedBelief = getBeliefs(relations, 'pA', 'local').find((b) => b.id === merged.id)
  assert.equal(getBeliefs(relations, 'pA', 'local').some((b) => b.proposition === '用户可能不喜欢社交'), false)
  assert.ok(mergedBelief.proposition.includes('安静独处'))
})

// ============ 补充：normalize / 记录 cap / prompt 约束 ============
test('补充：normalizeBeliefConsolidations 过滤非法、cap 生效', () => {
  assert.deepEqual(normalizeBeliefConsolidations(null), [])
  assert.deepEqual(normalizeBeliefConsolidations([null, {}, { action: 'delete', sourceBeliefIds: ['A'] }]), [])
  const relations = {}
  for (let i = 0; i < 60; i++) recordBeliefConsolidation(relations, 'p', 'u', { action: 'merge', sourceBeliefIds: ['A' + i, 'B' + i], targetBeliefId: 'C' + i, timestamp: i })
  assert.ok(getBeliefConsolidations(relations, 'p', 'u').length <= 50)
})

test('补充：buildConsolidationSystem 包含候选集合与约束（不提炼/不删除/极保守冲突）', () => {
  const sys = buildConsolidationSystem([belief('A', 'p1', 0.7, ['evt-1']), belief('B', 'p2', 0.8, ['evt-2'])], ['evt-1', 'evt-2'])
  assert.ok(sys.includes('id=A'))
  assert.ok(sys.includes('id=B'))
  assert.ok(sys.includes('不要提炼新特质'))
  assert.ok(sys.includes('不要删除信念'))
  assert.ok(sys.includes('只输出一个 JSON'))
  assert.ok(sys.includes('"action": "none" 或 "merge" 或 "conflict"'))
  // 候选上限：只展示传入的候选
  const many = Array.from({ length: 20 }, (_, i) => belief('b' + i, 'p' + i, 0.6, ['evt-' + i]))
  const sysMany = buildConsolidationSystem(many, many.map((b) => b.evidence[0]))
  assert.ok(sysMany.includes('当前候选信念（20 条）'))
})

test('补充：候选选择复用 getRelevantBeliefs 且不超过候选上限', () => {
  const relations = { p: { u: { intimacy: 0, beliefs: Array.from({ length: 12 }, (_, i) => belief('b' + i, 'p' + i, 0.5 + i * 0.03, ['evt-' + i])) } } }
  const candidates = getRelevantBeliefs(relations, 'p', 'u', BELIEF_CONSOLIDATION_CANDIDATE_LIMIT)
  assert.equal(candidates.length, BELIEF_CONSOLIDATION_CANDIDATE_LIMIT)
  assert.equal(candidates[0].confidence, 0.5 + 11 * 0.03) // confidence 最高者在前
})
