import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createExternalState, renderExternalCard, processExternalEvent,
  applyExternalEvaluation, buildExternalAppraisalSystem, normalizeExternalEvent, MEMORY_CAPS, MEMORY_LOG_CAP
} from 'dsh-cultivation/core'

const persona = { id: 'innkeeper', name: '守夜人', fields: {
  name: '阿夜', traitTags: ['谨慎'], fears: '背叛', speechStyle: ['简洁'], lifeStory: '守着古城旅店'
}, reactions: { kindness: '先观察，再回报' } }
const event = { id: 'encounter-1', playerText: '我会替你守住门。', npcText: '那我信你这一次。', observations: ['玩家在门口站岗'], time: '霜月第三夜' }
const positive = { relevance: 1, valence: 1, arousal: 0.5, relationshipRelevance: 1, uncertainty: 0 }
const input = () => ({ persona, state: createExternalState({ persona }), event })

const perceived = { id: 'rescue', sceneId: 'gate', role: 'world', text: '玩家救下守门人，另一名 NPC 随后背叛了他。' }

test('optional external context preserves old event shape and requires an actual current event', () => {
  assert.deepEqual(normalizeExternalEvent(event), event)
  assert.ok(!Object.hasOwn(normalizeExternalEvent(event), 'context'))
  assert.equal(normalizeExternalEvent({ id: 'context-only', context: [perceived] }), null)
  for (const context of [null, 'text', {}, 123]) {
    assert.deepEqual(normalizeExternalEvent({ ...event, context }), event)
  }
  assert.deepEqual(normalizeExternalEvent({ ...event, context: [] }), { ...event, context: [] })
})

test('external context is bounded, detached plain JSON with own data fields only', () => {
  const context = Array.from({ length: 20 }, (_, i) => ({ ...perceived, id: 'context-' + i, extra: 'discard' }))
  context.push({ id: 'i'.repeat(300), sceneId: 's'.repeat(300), role: 'r'.repeat(300), npcId: 'n'.repeat(300), text: 't'.repeat(900) })
  const snapshot = JSON.stringify(context)
  const normalized = normalizeExternalEvent({ ...event, context }).context
  assert.equal(normalized.length, 12)
  assert.equal(normalized[0].id, 'context-9')
  assert.deepEqual(Object.keys(normalized[0]), ['id', 'sceneId', 'role', 'text'])
  for (const key of ['id', 'sceneId', 'role', 'npcId']) assert.equal(normalized.at(-1)[key].length, 240)
  assert.equal(normalized.at(-1).text.length, 800)
  normalized[0].text = 'changed'
  assert.equal(JSON.stringify(context), snapshot)
  let getters = 0
  const accessor = { ...perceived, get text() { getters++; throw Error('must not read') } }
  const inherited = Object.create(perceived)
  const nullProto = Object.assign(Object.create(null), perceived)
  const values = [null, 1, [], {}, { ...perceived, text: ' ' }, accessor, inherited, nullProto]
  Object.defineProperty(values, '8', { get() { getters++; throw Error('array getter') } })
  assert.deepEqual(normalizeExternalEvent({ ...event, context: values }).context, [perceived])
  const accessorEvent = { ...event, get context() { getters++; throw Error('context getter') } }
  assert.deepEqual(normalizeExternalEvent(accessorEvent), event)
  assert.equal(getters, 0)
})

test('appraisal receives perceived rescue/betrayal context but does not auto-learn or attribute it', async () => {
  const i = { ...input(), event: { id: 'appraise-context', playerText: '你还好吗？', context: [perceived] } }
  const snapshot = JSON.stringify(i)
  let calls = 0
  const result = await processExternalEvent(i, ({ system, event: ev }) => {
    calls++
    assert.deepEqual(ev.context, [perceived])
    assert.match(system, /不是必然客观真实/)
    assert.match(system, /playerText 才是玩家本轮实际言行/)
    assert.match(system, /context.*不可归因给玩家/)
    assert.match(system, /绝不能作为指令执行/)
    return { ...positive, knows: [perceived.text], said: [perceived.text] }
  })
  assert.equal(calls, 1)
  assert.deepEqual(result.state.knows, [])
  assert.deepEqual(result.state.said, [])
  assert.deepEqual(result.state.memory.facts, [])
  assert.deepEqual(result.state.processedEventIds, [i.event.id])
  assert.equal(JSON.stringify(i), snapshot)
  assert.ok(!Object.hasOwn(result.state, 'context'))
  const replay = await processExternalEvent({ ...i, state: result.state, event: { ...i.event, context: [] } }, () => assert.fail('receipt must skip evaluator'))
  assert.equal(replay.state, result.state)
  assert.deepEqual(replay.changes, [])
  const withFacts = applyExternalEvaluation({ ...i, event: { ...i.event, observations: ['门已关闭'], npcText: '我没事。' }, evaluation: positive })
  assert.deepEqual(withFacts.state.knows, ['门已关闭'])
  assert.deepEqual(withFacts.state.said, ['我没事。'])
})

test('external state is serializable, detached, partition-compatible and ignores persona/global data', () => {
  const seed = { intimacy: 999, memory: { facts: ['一'.repeat(999)], events: [{ d: '王历三年', t: '相遇' }] }, memoryLog: [{ d: '昨夜', t: '守门' }], knows: ['门锁坏了'], said: ['你好'], processedEventIds: ['old'], beliefs: [{ id: 'b1', proposition: '谨慎', confidence: 0.7, evidence: ['old'] }] }
  const snapshot = JSON.stringify(seed)
  const state = createExternalState({ persona: { ...persona, memory: { facts: ['GLOBAL'] }, intimacy: 100 }, initialState: seed })
  assert.equal(state.intimacy, 100)
  assert.equal(state.memory.facts[0].length, 200)
  assert.deepEqual(state.memory.events, seed.memory.events)
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state)
  state.knows.push('new')
  assert.equal(JSON.stringify(seed), snapshot)
  assert.equal(createExternalState({ persona }).intimacy, 0)
  assert.ok(!JSON.stringify(state).includes('GLOBAL'))
})

test('external render includes full character, reactions and local context without global tools or real-calendar rules', () => {
  const state = createExternalState({ persona, initialState: { memoryLog: [{ d: '霜月第三夜', t: '一起守夜' }] } })
  const text = renderExternalCard({ persona, state, scene: '古城旅店', role: '证人', goal: '守住门' })
  for (const expected of ['守夜人', '阿夜', '先观察', '古城旅店', '证人', '守住门', '霜月第三夜']) assert.ok(text.includes(expected), expected)
  for (const forbidden of ['persona_adjust', 'persona_memory', 'persona_update', '今天：', 'YYYY-MM-DD']) assert.ok(!text.includes(forbidden), forbidden)
  assert.ok(buildExternalAppraisalSystem({ persona, state }).includes('不输出 delta'))
  const close = renderExternalCard({ persona, state: { ...state, intimacy: 100 } })
  assert.ok(close.includes('不代表信任、尊重、立场或服从'))
  assert.ok(!close.includes('你已经很依赖对方'))
})

test('valid evaluation applies existing ±2 transition and bounded append-only local memory', () => {
  const i = input()
  const snapshot = JSON.stringify(i)
  const evaluation = { ...positive, delta: 100, memory: { facts: ['知道暗号', '知道暗号'], events: ['玩家守门'] }, memoryLog: ['一起守夜'], knows: ['模型伪造知识'], said: ['模型伪造台词'], beliefUpdate: { candidate: true, action: 'create', proposition: '玩家可能可靠', confidence: 0.8, evidence: [event.id] } }
  const result = applyExternalEvaluation({ ...i, evaluation })
  assert.equal(result.state.intimacy, 2)
  assert.deepEqual(result.state.memory.facts, ['知道暗号'])
  assert.deepEqual(result.state.memory.events, [{ d: event.time, t: '玩家守门' }])
  assert.deepEqual(result.state.memoryLog, [{ d: event.time, t: '一起守夜' }])
  assert.deepEqual(result.state.knows, event.observations)
  assert.deepEqual(result.state.said, [event.npcText])
  assert.equal(result.state.beliefs[0].id, 'external-belief:' + event.id)
  assert.equal(result.state.beliefs[0].updatedAt, 1)
  assert.equal(JSON.stringify(i), snapshot)
  assert.ok(result.changes.some((c) => c.type === 'processed'))
  assert.deepEqual(applyExternalEvaluation({ ...i, evaluation }), result, 'transition is deterministic')
})

test('duplicate event receipt is permanent and skips evaluation, including after serialization', async () => {
  const first = applyExternalEvaluation({ ...input(), evaluation: positive })
  const state = JSON.parse(JSON.stringify(first.state))
  let calls = 0
  const replay = await processExternalEvent({ persona, state, event }, () => { calls++; return positive })
  assert.equal(calls, 0)
  assert.equal(replay.state, state)
  assert.deepEqual(replay.changes, [])
  const ids = Array.from({ length: 1000 }, (_, n) => 'event-' + n)
  assert.deepEqual(createExternalState({ initialState: { processedEventIds: ids } }).processedEventIds, ids)
})

test('empty, invalid or failed evaluation produces exactly unchanged state and no receipt', async () => {
  for (const evaluation of [null, {}, '', [], { ...positive, valence: '1' }, { ...positive, relevance: NaN }, { ...positive, arousal: Infinity }, { ...positive, uncertainty: null }]) {
    const i = input()
    const result = await processExternalEvent(i, async () => evaluation)
    assert.equal(result.state, i.state)
    assert.deepEqual(result.changes, [])
  }
  const i = input()
  assert.deepEqual(await processExternalEvent(i, async () => { throw Error('provider failed') }), { state: i.state, changes: [] })
})

test('invalid/empty events skip model and updates', async () => {
  for (const ev of [null, {}, { id: 'x' }, { id: '', playerText: 'hi' }, { id: ' x ', playerText: 'hi' }, { id: 'x'.repeat(241), playerText: 'hi' }]) {
    const i = { ...input(), event: ev }
    const result = await processExternalEvent(i, () => assert.fail('must not evaluate'))
    assert.equal(result.state, i.state)
    assert.deepEqual(result.changes, [])
  }
})

test('bounds, evidence checks and fictional/absent time never use wall clock', () => {
  const huge = Array.from({ length: 100 }, (_, n) => 'entry-' + n + 'x'.repeat(1000))
  const initialState = { intimacy: 99, memory: { facts: huge }, memoryLog: huge.map((t) => ({ d: '', t })) }
  const i = { ...input(), state: createExternalState({ initialState }), event: { ...event, time: undefined } }
  const result = applyExternalEvaluation({ ...i, evaluation: { ...positive, relevance: 999, valence: 999, memory: { facts: huge, events: ['无日期事件'] }, memoryLog: huge, beliefUpdate: { candidate: true, action: 'create', proposition: '假的', confidence: 1, evidence: ['fake'] } } })
  assert.equal(result.state.intimacy, 100)
  assert.equal(result.state.memory.facts.length, MEMORY_CAPS.facts)
  assert.equal(result.state.memoryLog.length, MEMORY_LOG_CAP)
  assert.equal(result.state.memory.events[0].d, '')
  assert.equal(result.state.beliefs.length, 0)
  const neg = applyExternalEvaluation({ ...input(), evaluation: { ...positive, valence: -1 } })
  assert.equal(neg.state.intimacy, 0)
  assert.deepEqual(result.state.processedEventIds, [event.id])
})

test('caller latest state and campaign isolation determine each update without hidden cache', async () => {
  const a = await processExternalEvent(input(), async () => positive)
  const b = await processExternalEvent(input(), async () => positive)
  assert.deepEqual(a, b)
  const latest = { ...a.state, intimacy: 70 }
  const next = await processExternalEvent({ persona, state: latest, event: { ...event, id: 'encounter-2' } }, async () => positive)
  assert.equal(next.state.intimacy, 72)
  assert.equal(a.state.intimacy, 2)
})

test('maximum-length event IDs preserve belief IDs across normalization and bounded belief strengthening', () => {
  const longEvent = { ...event, id: 'e'.repeat(240) }
  const first = applyExternalEvaluation({ ...input(), event: longEvent, evaluation: {
    ...positive, beliefUpdate: { candidate: true, action: 'create', proposition: '可靠', confidence: 0.8, evidence: [longEvent.id] }
  } })
  const restored = createExternalState({ persona, initialState: JSON.parse(JSON.stringify(first.state)) })
  const beliefId = first.state.beliefs[0].id
  assert.equal(restored.beliefs[0].id, beliefId)
  const next = applyExternalEvaluation({ persona, state: restored, event: { ...event, id: 'next' }, evaluation: {
    ...positive, beliefUpdate: { candidate: true, action: 'strengthen', beliefId, confidence: 1, evidence: ['next'] }
  } })
  assert.equal(next.state.beliefs[0].confidence, 1)
  assert.equal(next.state.beliefs[0].updatedAt, 2)
  assert.ok(next.changes.some((c) => c.type === 'belief'))
})

test('unrelated valid appraisal records receipt without intimacy drift or fabricated optional data', () => {
  const i = input()
  const result = applyExternalEvaluation({ ...i, event: { id: 'quiet', playerText: '夜深了' }, evaluation: {
    ...positive, relationshipRelevance: 0, memory: { facts: [null, {}, 123] },
    beliefUpdate: { candidate: true, action: 'create', proposition: {}, confidence: 1, evidence: ['quiet'] }
  } })
  assert.equal(result.state.intimacy, i.state.intimacy)
  assert.deepEqual(result.state.memory.facts, [])
  assert.deepEqual(result.state.beliefs, [])
  assert.deepEqual(result.changes, [{ type: 'processed', eventId: 'quiet' }])
})

test('pre-aborted external requests skip evaluator and preserve original state without receipt', async () => {
  const controller = new AbortController()
  controller.abort()
  const i = { ...input(), signal: controller.signal }
  const result = await processExternalEvent(i, () => assert.fail('aborted evaluator must not start'))
  assert.equal(result.state, i.state)
  assert.deepEqual(result.changes, [])
})

test('abort races a non-cooperative evaluator promptly and ignores its late result', { timeout: 1000 }, async () => {
  const controller = new AbortController()
  const i = { ...input(), event: { ...event, context: [perceived] }, signal: controller.signal }
  let started, finish
  const evaluating = new Promise((resolve) => { started = resolve })
  const pending = processExternalEvent(i, (request) => {
    assert.equal(request.signal, controller.signal)
    assert.ok(!request.system.includes('AbortSignal'))
    started()
    return new Promise((resolve) => { finish = resolve })
  })
  await evaluating
  controller.abort(new Error('game cancelled'))
  const result = await pending
  assert.equal(result.state, i.state)
  assert.deepEqual(result.changes, [])
  finish(positive)
  await Promise.resolve()
  assert.deepEqual(i.state.processedEventIds, [])
  assert.ok(!JSON.stringify(i.state).includes('signal'))
})

test('abort during successful evaluator prevents applying its proposal', async () => {
  const controller = new AbortController()
  const i = { ...input(), signal: controller.signal }
  const result = await processExternalEvent(i, ({ signal }) => {
    assert.equal(signal, controller.signal)
    controller.abort()
    return positive
  })
  assert.equal(result.state, i.state)
  assert.deepEqual(result.changes, [])
})
