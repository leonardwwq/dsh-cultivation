import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
async function client(initialModes = {}) {
  const components = new Map(), intervals = [], effects = [], requests = []
  let modes = initialModes
  const data = { version: 8, defaultPersonaId: 'daily', defaultEnabled: true, settings: { showIntimacyBadge: true },
    relations: { daily: { local: { intimacy: 50 } } }, templates: { daily: { id: 'daily', name: '日常角色', fields: {}, avatar: { rev: 1 } } },
    sessions: { game: { personaId: 'daily', enabled: true }, npc: { personaId: 'daily', enabled: true }, ordinary: { personaId: 'daily', enabled: true } } }
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}], useRef: (value) => ({ current: value }),
    useEffect: (effect) => { effects.push(effect) }, Fragment: 'fragment' }
  let plugin
  const context = vm.createContext({ console, AbortController, setTimeout, clearTimeout,
    window: { __ModuleLoader__: { load({ factory }) { plugin = factory((name) => name === 'react' ? react : {}) } } },
    fetch: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null
      requests.push({ url, body })
      return { ok: true, json: async () => url.endsWith('/load')
        ? { data: structuredClone(data), cards: { daily: '日常角色预览' }, userId: 'local', externalSessionModes: structuredClone(modes) }
        : { ok: true, session: body } }
    } })
  vm.runInContext(source, context)
  const slots = { inject: (_name, register) => register(), register: (options, component) => { components.set(options.id, component); return () => {} } }
  await plugin.apply({ get: () => slots, debounce: () => () => {}, effect: (fn) => fn(), interval: (fn) => { intervals.push(fn); return () => {} } })
  return { data, requests, components, render(id, props = {}) { return components.get(id)(props) },
    flushEffects() { for (const effect of effects.splice(0)) effect() },
    async sync(nextModes) { modes = nextModes; intervals[0](); await new Promise(setImmediate) } }
}
const surfaces = ['persona-studio-session-ctrl', 'persona-studio-intimacy', 'persona-studio-turn-avatar', 'persona-studio-chip']
const blank = { blank: true, promptAttempted: false }

test('external DM/NPC sessions hide every daily persona surface while ordinary sessions and settings stay intact', async () => {
  const h = await client({ game: 'dm', npc: 'npc', 'blank-npc': 'npc' })
  for (const sessionId of ['game', 'npc', 'blank-npc']) {
    for (const id of surfaces) assert.equal(h.render(id, { sessionId, session: blank }), null, `${id} in ${sessionId}`)
  }
  for (const id of surfaces) assert.notEqual(h.render(id, { sessionId: 'ordinary', session: blank }), null, id)
  assert.notEqual(h.render('persona-studio'), null, 'settings role library stays available')
  const before = JSON.stringify(h.data)
  h.flushEffects()
  await new Promise(setImmediate)
  assert.equal(h.requests.filter((request) => request.url.endsWith('/session-set')).length, 0)
  assert.equal(JSON.stringify(h.data), before)
})

test('periodic load sync applies and clears transient external modes without overwriting saved bindings', async () => {
  const h = await client()
  assert.notEqual(h.render('persona-studio-session-ctrl', { sessionId: 'game' }), null)
  await h.sync({ game: 'dm' })
  for (const id of surfaces) assert.equal(h.render(id, { sessionId: 'game', session: blank }), null)
  await h.sync({})
  for (const id of surfaces) assert.notEqual(h.render(id, { sessionId: 'game', session: blank }), null)
  assert.deepEqual(h.data.sessions.game, { personaId: 'daily', enabled: true })
  assert.equal(Object.hasOwn(h.data, 'externalSessionModes'), false)
})

test('blank ordinary sessions still automatically bind default daily persona', async () => {
  const h = await client()
  assert.notEqual(h.render('persona-studio-chip', { sessionId: 'new-ordinary', session: blank }), null)
  h.flushEffects()
  await new Promise(setImmediate)
  const binding = h.requests.find((request) => request.url.endsWith('/session-set'))
  assert.deepEqual(binding.body, { sessionId: 'new-ordinary', personaId: 'daily', enabled: true })
})
