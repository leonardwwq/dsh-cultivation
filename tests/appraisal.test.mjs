// Appraisal 层测试：Event → Appraisal Proposal → Validation → Bounded State Transition
// 覆盖：Schema 校验/clamp、幂等去重、失败不影响事件、Persona 依赖、bounded delta、持久化、异常防御。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPRAISAL_CAP, APPRAISAL_REASONING_MAX, APPRAISAL_INTIMACY_MAX_DELTA, APPRAISAL_RELATIONSHIP_THRESHOLD,
  clampUnit, clampValence,
  normalizeAppraisalProposal, normalizeAppraisal, normalizeAppraisals,
  getAppraisals, hasAppraisal, saveAppraisal,
  appraisalIntimacyDelta, applyAppraisalTransition,
  buildAppraisalSystem,
  normalizeRelations, migrate, intimacyOf, applyIntimacyDelta, appendEvents, getEventLog, DEFAULT_USER_ID
} from '../lib/core.js'

// ============ Test 1：合法 Appraisal 通过 normalize ============
test('Test 1：合法 Appraisal 能通过 normalize', () => {
  const p = { eventId: 'evt-120', relevance: 0.8, valence: -0.2, arousal: 0.7, relationshipRelevance: 0.9, uncertainty: 0.6, reasoning: '用户辞职，对依赖稳定关系的角色来说有冲击' }
  const out = normalizeAppraisalProposal(p, 'evt-120')
  assert.deepEqual(out, {
    eventId: 'evt-120', relevance: 0.8, valence: -0.2, arousal: 0.7,
    relationshipRelevance: 0.9, uncertainty: 0.6, reasoning: '用户辞职，对依赖稳定关系的角色来说有冲击'
  })
})

// ============ Test 2：relevance 越界 clamp ============
test('Test 2：relevance 越界能够 clamp（不 reject 不崩溃）', () => {
  assert.equal(clampUnit(1.5), 1)
  assert.equal(clampUnit(-0.5), 0)
  assert.equal(clampUnit(0.4), 0.4)
  assert.equal(clampUnit('abc'), 0)
  const full = (patch) => Object.assign({ eventId: 'e1', relevance: 0.5, valence: 0, arousal: 0, relationshipRelevance: 0, uncertainty: 0, reasoning: '' }, patch)
  assert.equal(normalizeAppraisalProposal(full({ relevance: 99 }), 'e1').relevance, 1)
  assert.equal(normalizeAppraisalProposal(full({ relevance: -3 }), 'e1').relevance, 0)
})

// ============ Test 3：valence 必须在 -1 到 1 ============
test('Test 3：valence 必须在 -1 到 1（越界 clamp）', () => {
  assert.equal(clampValence(2), 1)
  assert.equal(clampValence(-2), -1)
  assert.equal(clampValence(0.5), 0.5)
  assert.equal(clampValence(NaN), 0)
  const full = (patch) => Object.assign({ eventId: 'e1', relevance: 0.5, valence: 0, arousal: 0, relationshipRelevance: 0, uncertainty: 0, reasoning: '' }, patch)
  assert.equal(normalizeAppraisalProposal(full({ valence: 5 }), 'e1').valence, 1)
  assert.equal(normalizeAppraisalProposal(full({ valence: -9 }), 'e1').valence, -1)
})

// ============ Test 4：缺字段不能污染 state ============
test('Test 4：缺字段/非法输入不能污染 state', () => {
  assert.equal(normalizeAppraisalProposal(null, 'e1'), null)
  assert.equal(normalizeAppraisalProposal({}, 'e1'), null)
  assert.equal(normalizeAppraisalProposal('str', 'e1'), null)
  assert.equal(normalizeAppraisalProposal({ eventId: '' }, ''), null)
  // 缺字段 → 默认 0，仍可保存（clamp 兜底），但 null proposal 不写
  const relations = {}
  assert.equal(saveAppraisal(relations, 'p', 'u', null), null)
  assert.deepEqual(getAppraisals(relations, 'p', 'u'), [])
})

// ============ Test 5：同一个 eventId 不会产生两次 appraisal ============
test('Test 5：同一个 eventId 不会产生两次 appraisal（幂等）', () => {
  const relations = {}
  const a = { eventId: 'evt-120', relevance: 0.8, valence: -0.2, arousal: 0.7, relationshipRelevance: 0.9, uncertainty: 0.6, reasoning: 'r', timestamp: 1000 }
  assert.ok(saveAppraisal(relations, 'p', 'u', a))
  assert.equal(saveAppraisal(relations, 'p', 'u', a), null) // 第二次被拒
  assert.equal(getAppraisals(relations, 'p', 'u').length, 1)
  assert.ok(hasAppraisal(relations, 'p', 'u', 'evt-120'))
  assert.ok(!hasAppraisal(relations, 'p', 'u', 'evt-999'))
})

// ============ Test 6：Appraisal 失败不影响 Event 保存 ============
test('Test 6：Appraisal 失败不影响 Event 保存（事件先落库，评价失败可重试）', () => {
  const relations = {}
  // 事件先保存（captureTurnEvents 的产物）
  appendEvents(relations, 'p', 'u', [{ id: 'evt-1', timestamp: 1000, userInput: '我今天辞职了', agentResponse: '怎么突然辞职了？', significance: null, source: 'conversation' }])
  assert.equal(getEventLog(relations, 'p', 'u').length, 1)
  // Appraisal 失败（如 LLM 返回 null / 校验失败）→ 不写入、不抛
  assert.equal(saveAppraisal(relations, 'p', 'u', null), null)
  assert.equal(normalizeAppraisalProposal(null, 'evt-1'), null)
  assert.equal(getAppraisals(relations, 'p', 'u').length, 0)
  // 事件仍在
  assert.equal(getEventLog(relations, 'p', 'u').length, 1)
  // 失败后允许 retry：重新保存成功
  const ok = saveAppraisal(relations, 'p', 'u', { eventId: 'evt-1', relevance: 0.8, valence: -0.4, arousal: 0.6, relationshipRelevance: 0.9, uncertainty: 0.5, reasoning: 'retry', timestamp: 2000 })
  assert.ok(ok)
  assert.equal(getAppraisals(relations, 'p', 'u').length, 1)
})

// ============ Test 7：不同 Persona 对同一 Event 可产生不同 appraisal ============
test('Test 7：不同 Persona 对同一 Event 可产生不同 appraisal（Persona 是评价条件）', () => {
  // 两个 Persona：一个风险厌恶（高安全需求），一个追求自由（高冒险）
  const personaA = { traitTags: ['谨慎', '保守', '高安全需求'], fears: '失业、财务不稳定', dislikes: '冒险', hobbies: ['存钱'], relationshipStatus: 'married', currentGoal: '攒钱买房' }
  const personaB = { traitTags: ['冒险', '自由', '冲动'], fears: '被束缚', dislikes: '一成不变', hobbies: ['旅行'], relationshipStatus: 'single', currentGoal: '环游世界' }
  const sysA = buildAppraisalSystem(personaA, 60)
  const sysB = buildAppraisalSystem(personaB, 60)
  // system 包含各自角色信息 → 评价条件不同
  assert.ok(sysA.includes('谨慎'))
  assert.ok(sysA.includes('失业'))
  assert.ok(sysB.includes('冒险'))
  assert.ok(sysB.includes('被束缚'))
  assert.notEqual(sysA, sysB)
  // 模拟 mock LLM：同一事件（用户辞职），两个角色按各自 system 给出不同 proposal
  const mockLlm = (system) => system.includes('谨慎')
    ? { eventId: 'evt-1', relevance: 0.9, valence: -0.7, arousal: 0.8, relationshipRelevance: 0.9, uncertainty: 0.8, reasoning: '她辞职让我担心我们的稳定' }
    : { eventId: 'evt-1', relevance: 0.7, valence: 0.6, arousal: 0.9, relationshipRelevance: 0.8, uncertainty: 0.3, reasoning: '她自由了，我们可以一起冒险' }
  const proposalA = normalizeAppraisalProposal(mockLlm(sysA), 'evt-1')
  const proposalB = normalizeAppraisalProposal(mockLlm(sysB), 'evt-1')
  assert.ok(proposalA.valence < 0)
  assert.ok(proposalB.valence > 0)
  assert.ok(proposalA.uncertainty > proposalB.uncertainty)
})

// ============ Test 8：relationshipRelevance 很低时不产生 intimacyDelta ============
test('Test 8：relationshipRelevance 很低时不产生 intimacyDelta（即使 valence 很高）', () => {
  const low = { relevance: 1, valence: 1, relationshipRelevance: 0.1, arousal: 0.9, uncertainty: 0.5 }
  assert.equal(appraisalIntimacyDelta(low), 0)
  // 阈值边界：等于阈值也允许
  const atThreshold = { relevance: 1, valence: 1, relationshipRelevance: APPRAISAL_RELATIONSHIP_THRESHOLD }
  assert.notEqual(appraisalIntimacyDelta(atThreshold), 0)
})

// ============ Test 9：intimacyDelta 永远在 -2 到 +2 ============
test('Test 9：intimacyDelta 永远在 -2 到 +2', () => {
  const cases = [
    { relevance: 1, valence: 1, relationshipRelevance: 1 },          // +2
    { relevance: 1, valence: -1, relationshipRelevance: 1 },         // -2
    { relevance: 1, valence: 1, relationshipRelevance: 0.5 },        // +1
    { relevance: 0.5, valence: 1, relationshipRelevance: 1 },        // +1
    { relevance: 0.1, valence: -1, relationshipRelevance: 0.9 },     // round(-0.18)=0
    { relevance: 1, valence: 1, relationshipRelevance: 0.9 },        // round(1.8)=2
    { relevance: 1, valence: -1, relationshipRelevance: 0.51 }       // round(-1.02)=-1
  ]
  for (const c of cases) {
    const d = appraisalIntimacyDelta(c)
    assert.ok(d >= -APPRAISAL_INTIMACY_MAX_DELTA && d <= APPRAISAL_INTIMACY_MAX_DELTA, `delta ${d} out of bounds for ${JSON.stringify(c)}`)
  }
  // 极端输入也不越界（clampUnit 把负值夹到 0，所以负向极端用 relevance=1）
  assert.equal(appraisalIntimacyDelta({ relevance: 999, valence: 999, relationshipRelevance: 999 }), APPRAISAL_INTIMACY_MAX_DELTA)
  assert.equal(appraisalIntimacyDelta({ relevance: 1, valence: -999, relationshipRelevance: 1 }), -APPRAISAL_INTIMACY_MAX_DELTA)
  assert.equal(appraisalIntimacyDelta(null), 0)
})

// ============ Test 10：intimacy 永远在 0 到 100 ============
test('Test 10：应用 transition 后 intimacy 永远在 0 到 100', () => {
  const relations = {}
  // 100 时再 +2 → 100
  updateIntimacy(relations, 'p', 'u', 100)
  const r1 = applyAppraisalTransition(relations, 'p', 'u', { relevance: 1, valence: 1, relationshipRelevance: 1 })
  assert.equal(r1.delta, 2)
  assert.equal(intimacyOf(relations, 'p', 'u'), 100)
  // 0 时再 -2 → 0
  updateIntimacy(relations, 'p', 'u', 0)
  const r2 = applyAppraisalTransition(relations, 'p', 'u', { relevance: 1, valence: -1, relationshipRelevance: 1 })
  assert.equal(r2.delta, -2)
  assert.equal(intimacyOf(relations, 'p', 'u'), 0)
})

// ============ Test 11：重新加载数据后 appraisal 不丢失 ============
test('Test 11：重新加载数据后 appraisal 不丢失（normalize/migrate 保留）', () => {
  const relations = {
    personaA: {
      local: {
        intimacy: 72,
        eventLog: [{ id: 'evt-1', timestamp: 1000, userInput: 'u', agentResponse: 'r', significance: null, source: 'conversation' }],
        appraisals: [{ eventId: 'evt-1', relevance: 0.8, valence: -0.3, arousal: 0.7, relationshipRelevance: 0.9, uncertainty: 0.5, reasoning: 'r', timestamp: 1500 }]
      }
    }
  }
  const norm = normalizeRelations(relations)
  assert.equal(norm.personaA.local.appraisals.length, 1)
  assert.deepEqual(norm.personaA.local.appraisals[0], relations.personaA.local.appraisals[0])
  // 经 migrate（统一兜底）也不丢
  const data = { version: 6, templates: { personaA: { id: 'personaA', name: 'A', fields: {} } }, sessions: {}, relations: relations }
  const out = migrate(data)
  assert.equal(out.relations.personaA.local.appraisals.length, 1)
  assert.equal(out.relations.personaA.local.intimacy, 72)
})

// ============ Test 12：正常对话不依赖 appraisal 成功 ============
test('Test 12：正常对话不依赖 appraisal 成功（失败静默、状态不受影响）', () => {
  const relations = { p: { u: { intimacy: 50 } } }
  // 无 appraisal / 非法 appraisal 应用 → 不抛、无变化
  const r = applyAppraisalTransition(relations, 'p', 'u', null)
  assert.deepEqual(r, { delta: 0, before: 50, after: 50 })
  assert.equal(intimacyOf(relations, 'p', 'u'), 50)
  // normalize 非法列表 → 空，不崩溃
  assert.deepEqual(normalizeAppraisals([null, 'x', {}]), [])
  assert.deepEqual(normalizeAppraisals('bad'), [])
})

// ============ 补充：eventId 权威覆盖 / reasoning 截断 / cap / timestamp ============
test('补充：LLM 返回错误 eventId 被权威 eventId 覆盖（防串号）', () => {
  const p = normalizeAppraisalProposal({ eventId: 'evt-wrong', relevance: 0.5, valence: 0.1, arousal: 0.2, relationshipRelevance: 0.6, uncertainty: 0.3, reasoning: 'x' }, 'evt-120')
  assert.equal(p.eventId, 'evt-120')
})

test('补充：reasoning 超长被截断', () => {
  const p = normalizeAppraisalProposal({ eventId: 'e1', relevance: 0.5, valence: 0.1, arousal: 0.2, relationshipRelevance: 0.6, uncertainty: 0.3, reasoning: '长'.repeat(APPRAISAL_REASONING_MAX + 100) }, 'e1')
  assert.equal(p.reasoning.length, APPRAISAL_REASONING_MAX)
})

test('补充：appraisals cap 保留最近 N 条', () => {
  const relations = {}
  for (let i = 0; i < APPRAISAL_CAP + 10; i++) {
    saveAppraisal(relations, 'p', 'u', { eventId: 'evt-' + i, relevance: 0.5, valence: 0.1, arousal: 0.2, relationshipRelevance: 0.6, uncertainty: 0.3, reasoning: 'r' + i, timestamp: i })
  }
  const list = getAppraisals(relations, 'p', 'u')
  assert.equal(list.length, APPRAISAL_CAP)
  assert.equal(list[list.length - 1].eventId, 'evt-' + (APPRAISAL_CAP + 9))
})

test('补充：normalizeAppraisal 保留 timestamp，缺省为 0', () => {
  assert.equal(normalizeAppraisal({ eventId: 'e1', relevance: 0.5, valence: 0, arousal: 0, relationshipRelevance: 0, uncertainty: 0, reasoning: '', timestamp: 123 }).timestamp, 123)
  assert.equal(normalizeAppraisal({ eventId: 'e1', relevance: 0.5, valence: 0, arousal: 0, relationshipRelevance: 0, uncertainty: 0, reasoning: '' }).timestamp, 0)
})

// ---- 本地辅助：intimacy 直接设值（等价于 index.js 的 applyIntimacyDelta 路径） ----
function updateIntimacy(relations, p, u, v) {
  const cur = intimacyOf(relations, p, u)
  applyIntimacyDelta(relations, p, u, v - cur)
}
