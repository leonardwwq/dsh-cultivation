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
  const routes = []
  const ctx = {
    fs: {
      resolve: async (p) => p,
      stat: async (p) => { try { readFileSync(p); return { type: 'file' } } catch { return null } },
      readText: async (p) => readFileSync(p, 'utf8')
    },
    sandboxPolicy: {},
    systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
    webServer: { register: (r) => { routes.push(r); return () => {} } },
    agents: { roots: () => [{ id: 'S1' }] },
    llm: { stream: async function* () { yield { type: 'text-delta', text: llmReply() } } },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    tools: { register: (t) => { tools[t.name] = t; return () => {} } },
    provide: (name, service) => { ctx[name] = service; return () => {} },
    effect: (fn) => fn(),
    on: (name, fn) => { handlers[name] = fn }
  }
  return { ctx, handlers, tools, sections, routes }
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
// 落盘是异步的（写链 + rename）：固定 sleep 在整套测试并行跑时会偶发不够，
// 于是 pol 期望状态而不是赌时间——条件满足立刻返回，超时才失败。
async function waitFor(cond, label, ms = 3000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    let v
    try { v = cond() } catch (e) { v = false }
    if (v) return
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.fail('等待超时：' + (label || '条件未满足'))
}

let replyFn = () => '{"delta":0,"growth":null,"mood":"被拉来查插件，还挺带劲"}'
const A = makeCtx(() => replyFn())
const B = makeCtx(() => replyFn())
await plugin.apply(A.ctx)
await plugin.apply(B.ctx) // 模拟热重载产生第二个实例

test('迁移：v6 存档加载后升到 v8，成长去重，出厂称呼「喂」→「兄弟」，浓度设置被删除', async () => {
  const migrated = () => {
    const s = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
    return s.version === 8 && s.templates['sample-tease'].growth.length === 1 && s.templates['sample-tease'].fields.userAddress === '兄弟'
  }
  await waitFor(migrated, '迁移落盘')
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  assert.equal(saved.version, 8)
  assert.equal(saved.settings.concentration, undefined, '设置里不该再有这个不生效的旋钮')
  assert.equal(saved.templates['sample-tease'].growth.length, 1)
  assert.equal(saved.templates['sample-tease'].fields.userAddress, '兄弟')
})

test('多实例共享状态：A 实例改亲密度，B 实例立即可见，落盘值一致', async () => {
  const exec = { agent: { id: 'S1' } }
  const r = await A.tools.persona_adjust_intimacy.execute({ delta: 2, reason: '测试共享' }, exec)
  assert.ok(r.includes('当前 32/100'), r)
  const card = B.sections[0].text({ agent: { id: 'S1' } })
  assert.ok(card.includes('【亲密度 32/100'))
  await waitFor(() => {
    const s = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
    return s.relations['sample-tease'].local.intimacy === 32
  }, '亲密度落盘')
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  assert.equal(saved.relations['sample-tease'].local.intimacy, 32)
})

test('事件采集：新版 snapshotEvents 能抓到本轮对话，id 带会话号', async () => {
  const log = [...turn(0, '我这插件人格好生硬', '喂，这锅一半是设置')]
  const agent = { id: 'S1', session: makeSession(log) }
  await B.handlers['agent/turn-stopping']({ agent, turn: 1 })
  await waitFor(() => {
    const s = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
    return (s.relations['sample-tease'].local.eventLog || []).length === 1
  }, '事件落盘')
  const saved = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
  const evs = saved.relations['sample-tease'].local.eventLog
  assert.equal(evs.length, 1)
  assert.equal(evs[0].id, 'evt-S1-0')
  assert.equal(evs[0].sessionId, 'S1')
  assert.equal(evs[0].agentResponse, '喂，这锅一半是设置')
})

test('每轮提醒：只留身份与说话底色，不再下发开场/句式指令', async () => {
  const pre = A.handlers['agent/pre-step']
  const decision = await pre({ agent: { id: 'S1' }, turn: 2, step: 1, signal: { aborted: false } }, async () => ({ kind: 'enter', messages: [] }))
  const text = decision.messages[decision.messages.length - 1].content[0].text
  assert.ok(text.includes('江离'), text)
  assert.ok(text.includes('说话底色'), text)
  assert.ok(!text.includes('第一句'))
  assert.ok(!text.includes('用户叫你'))
  assert.ok(!text.includes('雇工'))
  // v8：开场/句式类元指令整条删除——每轮贴在上下文末尾会逼模型自我监控，越提醒越像模板
  assert.ok(!text.includes('换个开法'), text)
  assert.ok(!text.includes('开头'), text)
  assert.ok(!text.includes('不用刻意加'), text)
})

test('角色卡：不注入别的会话/模板上的旧心情；不把「喂」当称呼', () => {
  const card = A.sections[0].text({ agent: { id: 'S1' } })
  assert.ok(!card.includes('雇工方案'))
  assert.ok(!card.includes('口吻锚点'))
  assert.ok(card.includes('偶尔这么叫用户：兄弟'))
})

test('校准：自上次校准后攒够 3 条新事件就写入「本会话」心情，别的会话看不到', async () => {
  const log = [...turn(0, '我这插件人格好生硬', '喂，这锅一半是设置'), ...turn(3, '那都整一下', '行，开干'), ...turn(6, '跑测试', '全绿')]
  const agent = { id: 'S1', session: makeSession(log) }
  // v8：调度不再看易失的轮次计数器，而是看「本会话自上次校准以来的新事件数」
  await A.handlers['agent/turn-stopping']({ agent, turn: 1 })
  await A.handlers['agent/turn-stopping']({ agent, turn: 2 })
  await A.handlers['agent/turn-stopping']({ agent, turn: 3 })
  await waitFor(() => {
    const s = JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
    return s.sessionMoods && s.sessionMoods.S1 && s.sessionMoods.S1.text && s.relations['sample-tease'].local.eventLog.length === 3
  }, '校准/事件落盘')
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

// 用户平时看的就是设置页这份预览。它以前是客户端自己抄的一份 v6 渲染（没有规则块/Belief、
// 心情读模板旧值、记忆没有预算），和真正注入 system prompt 的内容早就不同——用户据此判断"注入什么"必然误判。
test('角色卡预览：/api/load 下发宿主渲染好的卡，不再是客户端自己拼的那份', async () => {
  const route = A.routes.find((r) => r.path === '/persona-studio/api/load')
  assert.ok(route, 'load 路由应已注册')
  const res = { status: 0, body: '', writeHead(code) { this.status = code }, end(body) { this.body = body } }
  await route.handler({}, res)
  const payload = JSON.parse(res.body)
  assert.ok(payload.cards && typeof payload.cards['sample-tease'] === 'string', 'load 应下发 cards')
  const card = payload.cards['sample-tease']
  // 和真实注入同源：具备现实角色卡才有的区块
  assert.ok(card.includes('【怎么做你自己】'), card.slice(0, 80))
  assert.ok(card.includes('【亲密度'), '亲密度段应该也在')
  // v8 删掉的东西不能再从预览里冒出来
  assert.ok(!card.includes('角色浓度'))
  assert.ok(!card.includes('不是剧本、不是扮演'), 'v7 已删的旧话术不该回来')
})
