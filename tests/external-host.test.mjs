import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import plugin from '../lib/index.js'

const home = mkdtempSync(join(tmpdir(), 'dshc-external-'))
process.env.DSH_HOME = home
const data = {
  version: 8, templates: { bound: { id: 'bound', name: '普通角色', fields: { name: '普通角色' }, memoryLog: [] } },
  relations: { bound: { local: { intimacy: 30 } } },
  sessions: { game: { personaId: 'bound', enabled: true }, ordinary: { personaId: 'bound', enabled: true } },
  sessionMoods: {}
}
globalThis[Symbol.for('dsh-cultivation/shared-state')] = {
  state: { data }, loading: null, writeChain: Promise.resolve(), writePending: false, migratedOnLoad: false
}
let reply = JSON.stringify({ relevance: 1, valence: 1, arousal: 0.5, relationshipRelevance: 1, uncertainty: 0 })
let calls = 0
let fail = false
let resumeModel = null
let streamOverride = null
const requests = []
function makeCtx() {
  const handlers = {}, sections = [], tools = {}, services = {}, routes = []
  let insideEffect = false
  const ctx = {
    fs: new Proxy({}, { get() { assert.fail('external service must not read global disk state') } }),
    sandboxPolicy: {}, agents: { roots: () => [{ id: 'game' }, { id: 'ordinary' }] },
    systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    tools: { register: (t) => { tools[t.name] = t; return () => {} } },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: { stream: async function* (options) {
      calls++
      requests.push(options)
      if (streamOverride) { yield* streamOverride(options); return }
      if (resumeModel) await resumeModel
      if (fail) throw Error('failed provider')
      if (reply) yield { type: 'text-delta', text: reply }
    } },
    effect: (fn) => { insideEffect = true; try { return fn() } finally { insideEffect = false } },
    provide: (name, service) => { assert.equal(insideEffect, false); services[name] = service; return () => {} },
    on: (name, fn) => { handlers[name] = fn }
  }
  return { ctx, handlers, sections, tools, services, routes }
}
const A = makeCtx(), B = makeCtx()
await plugin.apply(A.ctx)
await plugin.apply(B.ctx)
const service = A.services.cultivation
const persona = { id: 'npc', name: '旅店老板', fields: { name: '老板', traitTags: ['热情'] } }
const event = { id: 'e1', playerText: '谢谢', npcText: '不客气', time: '暮色时分', context: [{ id: 'seen-rescue', sceneId: 'gate', role: 'world', text: 'WITNESSED_RESCUE_队友替玩家挡伤' }] }

test('apiVersion 1 service is provided directly during apply; all operations remain campaign-local', async () => {
  assert.equal(service.apiVersion, 1)
  const before = JSON.stringify(data)
  const state = service.createExternalState({ persona })
  assert.ok(service.renderExternalCard({ persona, state }).includes('旅店老板'))
  const result = await service.processExternalEvent({ persona, state, event })
  assert.equal(result.state.intimacy, 2)
  assert.ok(JSON.stringify(requests.at(-1).messages).includes('WITNESSED_RESCUE_'))
  assert.deepEqual(result.state.knows, []) // Context is not auto-learned as fact.
  const count = calls
  assert.deepEqual(await service.processExternalEvent({ persona, state: result.state, event }), { state: result.state, changes: [] })
  assert.equal(calls, count)
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(readdirSync(home), [])
})

test('external model failures, empty and invalid output never log/write global state', async () => {
  const before = JSON.stringify(data)
  const state = service.createExternalState({ persona })
  for (const mode of ['failure', 'empty', 'invalid']) {
    fail = mode === 'failure'
    reply = mode === 'invalid' ? '{}' : ''
    const result = await service.processExternalEvent({ persona, state, event })
    assert.equal(result.state, state)
    assert.deepEqual(result.changes, [])
  }
  fail = false
  reply = JSON.stringify({ relevance: 1, valence: 1, arousal: 0.5, relationshipRelevance: 1, uncertainty: 0 })
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(readdirSync(home), [])
})

test('shared session modes suppress both instances, lifecycle, reminder and all global write tools without changing bindings', async () => {
  const before = JSON.stringify(data)
  assert.ok(B.sections[0].text({ agent: { id: 'game' } }).includes('普通角色'))
  for (const mode of ['dm', 'npc']) {
    service.setExternalSessionMode('game', mode)
    service.setExternalSessionMode('game', mode)
    assert.equal(B.sections[0].text({ agent: { id: 'game' } }), '')
    assert.ok(B.sections[0].text({ agent: { id: 'ordinary' } }).includes('普通角色'))
    const decision = { kind: 'enter', messages: [] }
    assert.equal(await B.handlers['agent/pre-step']({ agent: { id: 'game' }, turn: 1, step: 1, signal: { aborted: false } }, async () => decision), decision)
    const count = calls
    await B.handlers['agent/turn-stopping']({ agent: { id: 'game', session: { snapshotEvents: () => assert.fail('must not inspect game log') } } })
    assert.equal(calls, count)
    const args = {
      persona_adjust_intimacy: { delta: 3, reason: 'test' }, persona_growth: { trait: 'test', note: 'test' },
      persona_memory_log: { entry: 'test' }, persona_memory_update: { section: 'facts', entries: ['test'] }
    }
    for (const [name, tool] of Object.entries(B.tools)) {
      await tool.execute(args[name] || { section: 'facts', entries: ['test'], entry: 'test' }, { agent: { id: 'game' } })
    }
    assert.equal(JSON.stringify(data), before)
  }
  B.services.cultivation.clearExternalSessionMode('game')
  B.services.cultivation.clearExternalSessionMode('game')
  assert.ok(A.sections[0].text({ agent: { id: 'game' } }).includes('普通角色'))
  assert.equal(JSON.stringify(data), before)
  assert.throws(() => service.setExternalSessionMode('game', 'bad'), TypeError)
  assert.throws(() => service.setExternalSessionMode('', 'dm'), TypeError)
  assert.deepEqual(readdirSync(home), [])
})

test('marking while a global appraisal is in flight discards its pending transition', async () => {
  // Supply an existing event directly, so turn capture performs no pre-mark writes.
  const rel = data.relations.bound.local
  rel.eventLog = [{ id: 'pending', sessionId: 'game', userInput: '守住门', agentResponse: '谢谢', timestamp: 0 }]
  let release
  resumeModel = new Promise((resolve) => { release = resolve })
  const count = calls
  const pending = A.handlers['agent/turn-stopping']({ agent: { id: 'game' } })
  // Queue starts on a microtask; no background jobs or timing polls.
  await Promise.resolve()
  await Promise.resolve()
  assert.ok(calls > count)
  service.setExternalSessionMode('game', 'npc')
  const before = JSON.stringify(data)
  release()
  await pending
  resumeModel = null
  assert.equal(JSON.stringify(data), before)
  service.clearExternalSessionMode('game')
  delete rel.eventLog
  assert.deepEqual(readdirSync(home), [])
})


test('host forwards the exact AbortSignal to DSH stream and stops without retry or global write', { timeout: 1000 }, async () => {
  const controller = new AbortController()
  const state = service.createExternalState({ persona })
  const before = JSON.stringify(data)
  const count = calls
  let started
  const ready = new Promise((resolve) => { started = resolve })
  streamOverride = async function* (options) {
    assert.equal(options.signal, controller.signal)
    await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      started()
    })
  }
  try {
    const pending = service.processExternalEvent({ persona, state, event, signal: controller.signal })
    await ready
    controller.abort(new Error('plugin unloaded'))
    assert.deepEqual(await pending, { state, changes: [] })
  } finally { streamOverride = null }
  // The next request also proves cancellation released the shared model queue.
  assert.equal((await service.processExternalEvent({ persona, state, event })).state.intimacy, 2)
  assert.equal(calls, count + 2)
  assert.equal(Object.hasOwn(requests.at(-1), 'signal'), false, 'normal calls keep their previous request shape')
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(readdirSync(home), [])
})

test('aborted queued external request returns promptly and never starts network work', { timeout: 1000 }, async () => {
  const controller = new AbortController()
  const state = service.createExternalState({ persona })
  let started, release
  const ready = new Promise((resolve) => { started = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  const count = calls
  streamOverride = async function* () {
    started()
    await gate
    yield { type: 'text-delta', text: reply }
  }
  try {
    const first = service.processExternalEvent({ persona, state, event })
    await ready
    const queued = service.processExternalEvent({ persona, state, event: { ...event, id: 'queued' }, signal: controller.signal })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    assert.deepEqual(await queued, { state, changes: [] })
    release()
    assert.equal((await first).state.intimacy, 2)
  } finally { release(); streamOverride = null }
  // Flush queued work by making a final successful request.
  assert.equal((await service.processExternalEvent({ persona, state, event })).state.intimacy, 2)
  assert.equal(calls, count + 2, 'cancelled queued operation must not call ctx.llm.stream')
  assert.deepEqual(readdirSync(home), [])
})


test('/load exposes external modes only at top level without persisting or mutating persona bindings', async () => {
  const before = JSON.stringify(data)
  const route = B.routes.find((route) => route.path === '/persona-studio/api/load')
  const load = async () => {
    let payload
    await route.handler({}, { writeHead(status) { assert.equal(status, 200) }, end(body) { payload = JSON.parse(body) } })
    return payload
  }
  service.setExternalSessionMode('game', 'dm')
  service.setExternalSessionMode('blank-npc', 'npc')
  try {
    const payload = await load()
    assert.deepEqual(payload.externalSessionModes, { game: 'dm', 'blank-npc': 'npc' })
    assert.equal(Object.hasOwn(payload.data, 'externalSessionModes'), false)
    assert.equal(JSON.stringify(payload.data), before)
    assert.deepEqual(payload.data.sessions.game, { personaId: 'bound', enabled: true })
    assert.equal(Object.hasOwn(payload.data.sessions, 'blank-npc'), false)
    assert.ok(!JSON.stringify(payload.data.templates).includes('externalSessionModes'))
    assert.ok(payload.cards.bound.includes('普通角色'), 'settings card previews remain independent')
    assert.equal(JSON.stringify(data), before)
    assert.deepEqual(readdirSync(home), [])
  } finally {
    service.clearExternalSessionMode('game')
    service.clearExternalSessionMode('blank-npc')
  }
  assert.deepEqual((await load()).externalSessionModes, {})
})
