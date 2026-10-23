// Host 半区集成测试（mock DSH ctx）：
// 多实例共享状态（热重载不再互相覆盖）、新版 session.snapshotEvents 事件采集、
// 每轮角色提醒不再强制首句/称呼方向正确、角色卡按会话取心情、校准写会话心情、成长工具近似去重、写盘。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dshc-host-'))
process.env.DSH_HOME = home
writeFileSync(join(home, 'persona-studio.json'), JSON.stringify({
  version: 6, defaultPersonaId: 'sample-tease', defaultEnabled: true, settings: { concentration: 80 },
  relations: { 'sample-tease': { local: { intimacy: 30 } } },
  sessions: { S1: { personaId: 'sample-tease', enabled: true } },
  templates: {
    'sample-tease': {
      id: 'sample-tease', name: '毒舌损友',
      fields: { name: '江离', speechStyle: ['口语', '毒舌'], catchphrase: '就这？就这啊？', userAddress: '喂' },
      memoryLog: [], growth: [
        { trait: '先接住真实雇佣，再核实劳动关系', since: '2026-10-16', note: '用户明确说明女友经营个体户' },
        { trait: '先接住现实雇佣，再核实劳动关系', since: '2026-10-16', note: '用户明确说女友经营个体户' }
      ],
      mood: { text: '还在想你那个雇工方案', since: '2026-10-16' }
    }
  }
}))

const { default: plugin } = await import('../lib/index.js')

function makeCtx(llmReply) {
  const handlers = {}
  const tools = {}
  const sections = []
  const ctx = {
    fs: {
      resolve: async (p) => p,
      stat: async (p) => { try { readFileSync(p); return { type: 'file' } } catch { return null } },
      readText: async (p) => readFileSync(p, 'utf8')
    },
    sandboxPolicy: {},
    systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
    webServer: { register: () => () => {} },
    agents: { roots: () => [{ id: 'S1' }] },
    llm: { stream: async function* () { yield { type: 'text-delta', text: llmReply() } } },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    tools: { register: (t) => { tools[t.name] = t; return () => {} } },
    effect: (fn) => fn(),
    on: (name, fn) => { handlers[name] = fn }
  }
  return { ctx, handlers, tools, sections }
}

function makeSession(log) {
  // 新版 Session：没有 events 数组，只有 snapshotEvents(fromSeq)
  return { snapshotEvents: (from = 0) => Object.freeze(log.filter((e) => e.seq >= from)) }
}
const ev = (type, seq, data) => ({ type, seq, time: 1000 + seq, data })
const turn = (base, user, reply) => [
  ev('turn/start', base, { turn: 1 }),
  ev('user/message', base + 1, { id: 'u' + base, role: 'user', content: [{ type: 'text', text: user }], source: { kind: 'user' } }),
  ev('assistant/message', base + 2, { turn: 1, step: 1, message: { id: 'a' + base, role: 'assistant', content: [{ type: 'text', text: reply }], source: { kind: 'model' } } })
]
const flush = () => new Promise((r) => setTimeout(r, 30))

let replyFn = () => '{"delta":0,"growth":null,"mood":"被拉来查插件，还挺带劲"}'
const A = makeCtx(() => replyFn())
const B = makeCtx(() => replyFn())
await plugin.apply(A.ctx)
await plugin.apply(B.ctx) // 模拟热重载产生第二个实例

test('迁移：v6 存档加载后升到 v7，成长去重，出厂称呼「喂」→「兄弟」', async () => {
  await flush()
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  assert.equal(saved.version, 7)
  assert.equal(saved.templates['sample-tease'].growth.length, 1)
  assert.equal(saved.templates['sample-tease'].fields.userAddress, '兄弟')
})

test('多实例共享状态：A 实例改亲密度，B 实例立即可见，落盘值一致', async () => {
  const exec = { agent: { id: 'S1' } }
  const r = await A.tools.persona_adjust_intimacy.execute({ delta: 2, reason: '测试共享' }, exec)
  assert.ok(r.includes('当前 32/100'), r)
  const card = B.sections[0].text({ agent: { id: 'S1' } })
  assert.ok(card.includes('【亲密度 32/100'))
  await flush()
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  assert.equal(saved.relations['sample-tease'].local.intimacy, 32)
})

test('事件采集：新版 snapshotEvents 能抓到本轮对话，id 带会话号', async () => {
  const log = [...turn(0, '我这插件人格好生硬', '喂，这锅一半是设置')]
  const agent = { id: 'S1', session: makeSession(log) }
  await B.handlers['agent/turn-stopping']({ agent, turn: 1 })
  await flush()
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  const evs = saved.relations['sample-tease'].local.eventLog
  assert.equal(evs.length, 1)
  assert.equal(evs[0].id, 'evt-S1-0')
  assert.equal(evs[0].sessionId, 'S1')
  assert.equal(evs[0].agentResponse, '喂，这锅一半是设置')
})

test('每轮提醒：不再要求首句起手、称呼方向不再写反、点出上轮开场', async () => {
  const pre = A.handlers['agent/pre-step']
  const decision = await pre({ agent: { id: 'S1' }, turn: 2, step: 1, signal: { aborted: false } }, async () => ({ kind: 'enter', messages: [] }))
  const text = decision.messages[decision.messages.length - 1].content[0].text
  assert.ok(!text.includes('第一句'))
  assert.ok(!text.includes('用户叫你'))
  assert.ok(!text.includes('雇工'))
  assert.ok(text.includes('你上一轮是用「喂」开头的，这轮换个开法'), text)
})

test('角色卡：不注入别的会话/模板上的旧心情；不把「喂」当称呼', () => {
  const card = A.sections[0].text({ agent: { id: 'S1' } })
  assert.ok(!card.includes('雇工方案'))
  assert.ok(!card.includes('口吻锚点'))
  assert.ok(card.includes('偶尔这么叫用户：兄弟'))
})

test('校准：每 3 轮写入「本会话」心情，别的会话看不到', async () => {
  const log = [...turn(0, '我这插件人格好生硬', '喂，这锅一半是设置'), ...turn(3, '那都整一下', '行，开干'), ...turn(6, '跑测试', '全绿')]
  const agent = { id: 'S1', session: makeSession(log) }
  // 轮数计数器按实例计（A 实例此前未走过轮次），走满 3 轮触发校准
  await A.handlers['agent/turn-stopping']({ agent, turn: 1 })
  await A.handlers['agent/turn-stopping']({ agent, turn: 2 })
  await A.handlers['agent/turn-stopping']({ agent, turn: 3 })
  await flush(); await flush()
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  assert.equal(saved.sessionMoods.S1.text, '被拉来查插件，还挺带劲')
  assert.equal(saved.relations['sample-tease'].local.eventLog.length, 3)
  const card = A.sections[0].text({ agent: { id: 'S1' } })
  assert.ok(card.includes('被拉来查插件'))
  const other = A.sections[0].text({ agent: { id: 'S2' } })
  assert.equal(other, '') // S2 未绑定角色
})

test('成长工具：近似条目被拒，新特质可记录', async () => {
  const exec = { agent: { id: 'S1' } }
  const dup = await B.tools.persona_growth.execute({ trait: '先接住真实雇佣，再核实劳动关系', note: '又来一遍' }, exec)
  assert.ok(dup.includes('意思相近'), dup)
  const ok = await B.tools.persona_growth.execute({ trait: '愿意先把话听完', note: '被用户点出说话太满' }, exec)
  assert.ok(ok.startsWith('已记录'), ok)
})
