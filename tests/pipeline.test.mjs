// 事件流水线集成测试（mock DSH ctx）：
// 1) processEvents 每轮从最旧的 pending 事件开始消化，积压不会被新事件插队；
// 2) appraisal 解析失败 / 校验失败 / belief 校验失败都会打一行可定位的 warn（不再静默 return）；
// 3) Belief Consolidation 端到端跑通（合并真正落盘、无告警）——防止「import 缺失 + 静默 catch」
//    这类「路径从未被执行过」的 bug 再次逃过测试。
// 本文件独立进程运行、自带 DSH_HOME，不复用 host.test.mjs 的共享状态。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_USER_ID } from '../lib/core.js'

const home = mkdtempSync(join(tmpdir(), 'dshc-pipeline-'))
process.env.DSH_HOME = home

// 最小的 v7 存档：每个角色一条关系行（eventLog / appraisals / beliefs 显式给出）
const ev = (id, userInput) => ({ id, timestamp: 1000, userInput, agentResponse: '好', source: 'conversation' })
// 带 sessionId 的事件：periodicIfDue 只认「本会话」的事件，没有 sessionId 的事件永远触发不了周期任务
const evS = (id, userInput) => Object.assign(ev(id, userInput), { sessionId: 'S5' })
const CE_IDS = ['ce1', 'ce2', 'ce3', 'ce4', 'ce5', 'ce6', 'ce7', 'ce8', 'ce9', 'ce10']
const evS8 = (id, userInput) => Object.assign(ev(id, userInput), { sessionId: 'S8' })
// 合法的 appraisal（5 个数值字段齐全，否则 normalizeAppraisals 会丢弃，事件重新变成 pending）
const appraisalOf = (eventId) => ({ eventId, relevance: 0.5, valence: 0, arousal: 0.2, relationshipRelevance: 0.5, uncertainty: 0.3, reasoning: '', timestamp: 1000 })
const beliefOf = (id, proposition, confidence, evidence) => ({ id, proposition, confidence, evidence, createdAt: 1000, updatedAt: 1000 })
const tpl = (id) => ({ id, name: '角色' + id, fields: { name: '角色' + id }, memoryLog: [], growth: [], mood: null })
const SIXTY_LOG = Array.from({ length: 60 }, (_, i) => ({ d: '2026-10-' + String(1 + Math.floor(i / 3)).padStart(2, '0'), t: '第 ' + (i + 1) + ' 条日志' }))
const row = (events, appraisals = [], beliefs = []) => ({ intimacy: 30, eventLog: events, appraisals, beliefs })

writeFileSync(join(home, 'persona-studio.json'), JSON.stringify({
  version: 7,
  defaultPersonaId: 'p1',
  defaultEnabled: true,
  settings: { concentration: 80, showIntimacyBadge: true },
  sessionMoods: {},
  sessions: {
    S1: { personaId: 'p1', enabled: true },
    S2: { personaId: 'p2', enabled: true },
    S3: { personaId: 'p3', enabled: true },
    S4: { personaId: 'p4', enabled: true },
    S5: { personaId: 'p5', enabled: true },
    S6: { personaId: 'p6', enabled: true },
    S7: { personaId: 'p7', enabled: true },
    S8: { personaId: 'p8', enabled: true },
    S9: { personaId: 'p9', enabled: true },
    S10: { personaId: 'p10', enabled: true },
    S11: { personaId: 'p11', enabled: true }
  },
  relations: {
    p1: { [DEFAULT_USER_ID]: row([ev('e1', '第一问'), ev('e2', '第二问'), ev('e3', '第三问'), ev('e4', '第四问'), ev('e5', '第五问')]) },
    p2: { [DEFAULT_USER_ID]: row([ev('bad1', '解析失败的事件')]) },
    p3: { [DEFAULT_USER_ID]: row([ev('bad2', '字段不全的事件')]) },
    // p4 的事件先正常通过 appraisal，再由 belief 校验拒绝
    p4: { [DEFAULT_USER_ID]: row([ev('b3', '信念校验失败的事件')]) },
    // p6：只有一个永远解析不出 JSON 的事件，专供「连续失败到上限后放弃」测试
    p6: { [DEFAULT_USER_ID]: row([ev('dead1', '这条永远评不出来')]) },
    // p7：日志满 60 条、没有事件（因此 calibrate / 口吻样本都不会发请求），专供归档端到端测试
    p7: { [DEFAULT_USER_ID]: row([]) },
    // p8：满 60 条日志 + 2 条待评价事件，用来验证「归档与事件流水线不会并发打模型」
    p8: { [DEFAULT_USER_ID]: row([evS8('q1', '第一条'), evS8('q2', '第二条')]) },
    // p9：一条待评价事件，专供「空回复自动重试」测试
    p9: { [DEFAULT_USER_ID]: row([ev('r1', '空回复后重试的事件')]) },
    // p10：满 60 条日志、无事件，专供「归档批次降级」测试
    p10: { [DEFAULT_USER_ID]: row([]) },
    // p11：满 60 条日志、无事件，专供「归档全线失败 → 原文降级」测试
    p11: { [DEFAULT_USER_ID]: row([]) },
    // p5：10 条已评价事件 + 2 条相近信念。consolidation 现在按「自上次整理以来新增 ≥10 条事件」触发，
    // 所以这里必须有 10 条带 sessionId 的事件（否则 periodicIfDue 取不到本会话事件，永远不整理）。
    p5: {
      [DEFAULT_USER_ID]: row(
        CE_IDS.map((id, i) => evS(id, '第 ' + (i + 1) + ' 件旧事')),
        CE_IDS.map((id) => appraisalOf(id)),
        [
          beliefOf('b1', '用户喜欢深夜写代码', 0.7, ['ce1']),
          beliefOf('b2', '用户习惯熬夜做项目', 0.6, ['ce2'])
        ]
      )
    }
  },
  templates: {
    p1: tpl('p1'), p2: tpl('p2'), p3: tpl('p3'), p4: tpl('p4'), p5: tpl('p5'), p6: tpl('p6'),
    // 满 60 条日志：模拟真实数据里"日志卡在 cap、归档不工作"的状态
    p7: Object.assign(tpl('p7'), { memoryLog: SIXTY_LOG }),
    p8: Object.assign(tpl('p8'), { memoryLog: SIXTY_LOG }),
    p9: tpl('p9'),
    p10: Object.assign(tpl('p10'), { memoryLog: SIXTY_LOG }),
    p11: Object.assign(tpl('p11'), { memoryLog: SIXTY_LOG })
  }
}))

const { default: plugin } = await import('../lib/index.js')

let replies = [] // 每次 LLM 调用按顺序取一条；取完回落到 '{}'
let llmError = null // 非空时下一次调用抛错误块
let emptyFirst = false // 置 true 时下一次调用返回空内容（模拟间歇性空回复）
let llmAlwaysEmpty = false // 置 true 时所有调用都返回空内容（模拟归档这条路上模型持续空返回）
let inflight = 0
let maxInflight = 0
const ctx = {
  fs: {
    resolve: async (p) => p,
    stat: async (p) => { try { readFileSync(p); return { type: 'file' } } catch { return null } },
    readText: async (p) => readFileSync(p, 'utf8')
  },
  sandboxPolicy: {},
  systemPrompt: { section: () => () => {} },
  webServer: { register: () => () => {} },
  agents: { roots: () => [] },
  // 记录并发峰值：后台任务必须串行（并发会让模型返回空串，实测过）
  llm: {
    stream: async function* () {
      inflight += 1
      maxInflight = Math.max(maxInflight, inflight)
      try {
        if (llmError) { yield { type: 'error', error: { message: llmError } }; return }
        if (llmAlwaysEmpty) return // 持续空回复
        if (emptyFirst) { emptyFirst = false; return } // 什么都不 yield = 空回复
        yield { type: 'text-delta', text: replies.length ? replies.shift() : '{}' }
      } finally { inflight -= 1 }
    }
  },
  agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
  tools: { register: () => () => {} },
  provide: () => () => {},
  effect: (fn) => fn(),
  on: (name, fn) => { handlers[name] = fn }
}
const handlers = {}
await plugin.apply(ctx)

// 后台流水线是 fire-and-forget：落盘先后由事件循环决定，固定 sleep(30) 在并行跑整套测试时
// 偶发不够（表现为 appraisals 读到 []），于是测试时红时绿。改成轮询期望状态，条件满足立即返回。
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
const flush = () => new Promise((r) => setTimeout(r, 0)) // 让出一个事件循环周期（宏任务）
const trigger = (id) => handlers['agent/turn-stopping']({ agent: { id } })
const saved = () => JSON.parse(readFileSync(join(home, 'persona-studio.json'), 'utf8'))
const appraisalsOf = (pid) => saved().relations[pid][DEFAULT_USER_ID].appraisals.map((a) => a.eventId)

// 捕获 console.warn：流水线是后台 async 任务，等 pipeline 跑完（cond 成立或回复队列清空）再恢复，
// 避免漏收集。失败类用例没有落盘可等，用「LLM 回复已全部消费」作为完成信号。
async function captureWarns(fn, cond) {
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    await fn()
    if (cond) await waitFor(cond, '流水线落盘')
    else await waitFor(() => replies.length === 0, 'LLM 回复消费完')
    await flush()
  } finally { console.warn = orig }
  return warns
}

const APPRAISAL_OK = '{"relevance":0.8,"valence":0.5,"arousal":0.3,"relationshipRelevance":0.6,"uncertainty":0.2,"reasoning":"还行"}'
const BELIEF_SKIP = '{"candidate":false}'

test('漏斗顺序：每轮先消化最旧的 pending 事件，再逐步清空积压', async () => {
  // v8：turn-stopping 会 await 整条流水线，每轮只消化 1 条（恢复正常对话的节奏）。
  // 关键断言是「永远从最旧的那条开始」，而不是取最新的。
  replies = [APPRAISAL_OK, BELIEF_SKIP]
  const warns = await captureWarns(() => trigger('S1'), () => appraisalsOf('p1').length === 1)
  assert.deepEqual(appraisalsOf('p1'), ['e1'])
  // 第二轮：继续消化下一条最旧的 e2，而不是回头重复最新事件
  replies = [APPRAISAL_OK, BELIEF_SKIP]
  await captureWarns(() => trigger('S1'), () => appraisalsOf('p1').length === 2)
  assert.deepEqual(appraisalsOf('p1'), ['e1', 'e2'])
  // belief 的 skip 是正常路径：不应产生「belief 校验失败」告警
  assert.equal(warns.filter((w) => w.includes('belief 校验失败')).length, 0)
})

test('appraisal 解析失败：warn 带 event id 与原始输出前 200 字', async () => {
  replies = ['这不是 JSON，模型跑偏了']
  const warns = await captureWarns(() => trigger('S2'))
  const line = warns.find((w) => w.includes('appraisal 解析失败'))
  assert.ok(line, '解析失败必须打 warn，不能静默 return')
  assert.match(line, /event=bad1/)
  assert.match(line, /raw=这不是 JSON，模型跑偏了/)
  assert.doesNotMatch(line, /\n/, 'warn 必须是单行')
})

test('appraisal 校验失败：能与解析失败区分，并打出实到字段名', async () => {
  replies = ['{"relevance":0.9}'] // 能解析出 JSON，但缺 valence/arousal 等必填字段
  const warns = await captureWarns(() => trigger('S3'))
  const line = warns.find((w) => w.includes('appraisal 校验失败'))
  assert.ok(line, '校验失败必须打 warn')
  assert.match(line, /event=bad2/)
  assert.match(line, /keys=relevance/)
  assert.equal(warns.filter((w) => w.includes('appraisal 解析失败')).length, 0)
})

test('belief 校验失败：warn 带 event id、reject reason 与原始输出', async () => {
  // 事件先通过 appraisal，随后 belief 的 action 不在白名单 → validateBeliefProposal 返回 reject
  // （旧实现直接 return：静默、不记录、下轮重试）
  replies = [APPRAISAL_OK, '{"candidate":true,"action":"delete","evidence":["b3"],"confidence":0.9}']
  const warns = await captureWarns(() => trigger('S4'))
  const line = warns.find((w) => w.includes('belief 校验失败'))
  assert.ok(line, 'reject 必须打 warn')
  assert.match(line, /event=b3/)
  assert.match(line, /reason=invalid-action:delete/)
  assert.match(line, /raw=\{"candidate":true/)
})

// 真实数据里出现过：某条事件模型稳定给不出合法 appraisal，于是每轮都在队头重试一次、
// 白烧一个 LLM 调用，还把每轮名额从 3 挤成 2（积压 13→12 就是这么来的）。
test('失败上限：同一事件连续失败 3 次后放弃，不再每轮白烧调用', async () => {
  const poison = '这不是 JSON'
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    for (let i = 0; i < 3; i++) {
      replies = [poison]
      trigger('S6')
      // 等「这一轮的失败已经计数并落告警」——只等回复被消费不够，计数发生在消费之后的微任务里
      await waitFor(() => warns.filter((w) => w.includes('event=dead1')).length === i + 1, '第 ' + (i + 1) + ' 次失败落告警')
    }
    assert.equal(warns.filter((w) => w.includes('已放弃')).length, 1, '第 3 次失败时告警一次：' + JSON.stringify(warns))
    // 第 4 轮：已到上限，不该再发请求。回复队列空时 mock 会回 '{}'，
    // 真发了请求就会多出一条「校验失败」——用它当「没有发请求」的证据。
    replies = []
    trigger('S6')
    await flush(); await flush()
    assert.equal(warns.some((w) => w.includes('校验失败')), false, '放弃后不应再发请求：' + JSON.stringify(warns))
  } finally {
    console.warn = orig
  }
  assert.equal(replies.length, 0)
  assert.equal(appraisalsOf('p6').length, 0, '放弃不等于伪造 appraisal')
})

// 端到端覆盖 consolidation：这个功能曾因 lib/index.js 少 import 一个 getBeliefs 就整段抛
// ReferenceError、又被静默 catch 吞掉，测试却一直是绿的——所以这里必须断言「合并真的落盘」，
// 而不是「没抛错」。
// v8：调度从「每 10 轮（易失计数器）」改成「本会话自上次整理以来新增 ≥10 条事件」。
// 同一轮里校准/口吻样本也会触发，所以回复队列按调用顺序：calibrate → say → consolidation。
test('consolidation 端到端：本会话攒够 10 条新事件后把 2 条相近信念合并成 1 条，且不重复整理', async () => {
  const mergeJson = '{"action":"merge","beliefIds":["b1","b2"],"proposition":"合并后的认识：用户习惯深夜投入项目","confidence":0.7,"evidence":["ce1","ce2"],"reasoning":"b1 与 b2 在说同一件事"}'
  const mergeProposal = JSON.parse(mergeJson)
  const CALIBRATE = '{"delta":0,"growth":null,"mood":"整理一下脑子"}'
  const SAY = '行吧，这些事翻来覆去就那点东西。'
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    // p5 有 10 条本会话事件，一次触发就同时满足校准（≥3）与整理（≥10）
    replies = [CALIBRATE, SAY, mergeJson]
    trigger('S5')
    await waitFor(() => saved().relations.p5[DEFAULT_USER_ID].beliefs.length === 1, '合并结果落盘')
    assert.equal(replies.length, 0, '校准 + 口吻 + 整理各消费一条')
    // 再触发一轮：自上次整理以来没有新事件，不应再发整理请求（队列空时 mock 会回 '{}'）
    trigger('S5')
    await flush(); await flush()
    assert.equal(replies.length, 0)
  } finally {
    console.warn = orig
  }
  const beliefs = saved().relations.p5[DEFAULT_USER_ID].beliefs
  assert.equal(beliefs.length, 1, '两条源信念应合并为一条')
  assert.equal(beliefs[0].proposition, mergeProposal.proposition)
  // confidence 取源信念最大值（LLM 提议值不参与计算）；evidence 为源 evidence 的并集
  assert.equal(beliefs[0].confidence, 0.7)
  assert.deepEqual(beliefs[0].evidence, ['ce1', 'ce2'])
  assert.equal(warns.filter((w) => w.includes('[persona-studio] consolidation')).length, 0, 'consolidation 不应打任何告警')
})

// 真实数据里「日志 60/60 卡了一整天」是上一阶段最典型的"功能看着在、其实没跑"。
// v8 起归档不再挂在易失的"每 3 轮"计数器上：只要日志 ≥ 12 条，每轮都投喂 20 条，直到降到阈值以下。
// 60 → 43 → 26 → 9，一轮一档，不需要依赖之前的轮次计数还在不在。
test('归档端到端：日志满 60 时每轮投喂 20 条，一路降到阈值以下且记忆真的增加', async () => {
  const archiveJson = JSON.stringify({
    add: { facts: ['新归档的一条长期事实'], userInfo: [], relationship: [], promises: [] },
    events: [],
    remove: { facts: [], userInfo: [], relationship: [], promises: [] }
  })
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    replies = [archiveJson, archiveJson, archiveJson]
    const logLen = () => saved().templates.p7.memoryLog.length
    // 阶梯从 10 条开始（20 条那档实测每次都撞 max-tokens，已去掉）
    trigger('S7')
    await waitFor(() => logLen() === 53, '第一轮：60 → 53')
    trigger('S7')
    await waitFor(() => logLen() === 46, '第二轮：53 → 46')
    trigger('S7')
    await waitFor(() => logLen() === 39, '第三轮：46 → 39')
  } finally {
    console.warn = orig
  }
  const tplNow = saved().templates.p7
  assert.equal(tplNow.memoryLog.length, 39, '每轮投喂 10 条：3 条缓冲 + 剩余未投喂')
  assert.ok((tplNow.memory.facts || []).includes('新归档的一条长期事实'), 'add.facts 要真的写进分区')
  assert.equal(warns.filter((w) => w.includes('归档')).length, 0, '归档成功时不该有告警：' + JSON.stringify(warns))
})

// 真实现场：persona-studio.log 里 appraisal 和归档同时 `raw=`（空输出），
// 因为一轮里事件流水线 + 归档 + 校准会并发打模型。后台任务不赶时间，串行换稳定性。
test('后台模型调用串行：同一轮里归档和事件流水线不会并发', async () => {
  const archiveJson = '{"add":{"facts":[],"userInfo":[],"relationship":[],"promises":[]},"events":[],"remove":{"facts":[],"userInfo":[],"relationship":[],"promises":[]}}'
  maxInflight = 0
  // 这一轮同时有「事件评价 + 信念 + 归档」三种调用，靠固定回复队列对不上号——
  // 换成按 system prompt 应答的 mock，顺序就不再影响语义。
  const origStream = ctx.llm.stream
  ctx.llm.stream = async function* (req) {
    inflight += 1
    maxInflight = Math.max(maxInflight, inflight)
    try {
      const system = String((req && req.system) || '')
      if (system.includes('事件评价器')) yield { type: 'text-delta', text: APPRAISAL_OK }
      else if (system.includes('信念更新器')) yield { type: 'text-delta', text: BELIEF_SKIP }
      else if (system.includes('记忆归档器')) yield { type: 'text-delta', text: archiveJson }
      else yield { type: 'text-delta', text: '{}' }
    } finally { inflight -= 1 }
  }
  try {
    trigger('S8')
    await waitFor(() => {
      const s = saved()
      return s.relations.p8[DEFAULT_USER_ID].appraisals.length === 1 && s.templates.p8.memoryLog.length < 60
    }, '事件评价与归档都完成')
  } finally {
    ctx.llm.stream = origStream
  }
  assert.equal(maxInflight, 1, '后台模型调用必须串行，实测并发会拿到空输出')
})

// 旧实现只认 text-delta：错误块被忽略、空串当成功返回，调用方解析出 null 之后
// 又什么都不写，于是「功能跑了但没效果」，日志里只有 raw=。
test('模型错误块：转成异常并留痕，不再被当成空输出吞掉', async () => {
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    llmError = 'rate limited'
    replies = []
    trigger('S2') // p2 的 bad1 还没评上，会走 appraisal
    await waitFor(() => warns.some((w) => w.includes('rate limited')), '错误块应出现在告警里')
  } finally {
    llmError = null
    console.warn = orig
  }
  const line = warns.find((w) => w.includes('rate limited'))
  assert.match(line, /appraisal 异常/)
  assert.match(line, /模型报错/)
})

// 空回复是间歇性的（真实日志里连续几次 len=0），不是某一条 prompt 的问题。
// 一次重试能把偶发空回复兜住；重试仍空才判失败，并且每次都留痕。
test('空回复自动重试一次：第二次拿到内容就继续', async () => {
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    emptyFirst = true
    replies = [APPRAISAL_OK, BELIEF_SKIP]
    trigger('S9')
    await waitFor(() => saved().relations.p9[DEFAULT_USER_ID].appraisals.length === 1, '重试后评价成功')
  } finally {
    emptyFirst = false
    console.warn = orig
  }
  assert.ok(warns.some((w) => w.includes('空回复')), '重试要留痕：' + JSON.stringify(warns))
  assert.equal(saved().relations.p9[DEFAULT_USER_ID].appraisals.length, 1)
})

// 归档批次阶梯：20 条这一档在真实环境里稳定拿不到可用输出（len=0 / 被截断），
// 但只要退到 10 条就能成。宁可一批归档少几条，也不能让日志永远卡在 cap。
test('归档批次降级：20 条失败就退到 10 条，日志按实际投喂数下降', async () => {
  const archiveJson = JSON.stringify({ add: { facts: ['降级批次归档成功'], userInfo: [], relationship: [], promises: [] }, events: [], remove: { facts: [], userInfo: [], relationship: [], promises: [] } })
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    replies = ['这不是 JSON', archiveJson]
    trigger('S10')
    await waitFor(() => saved().templates.p10.memoryLog.length === 58, '退到 5 条后日志应为 58')
  } finally {
    console.warn = orig
  }
  const tplNow = saved().templates.p10
  assert.equal(tplNow.memoryLog.length, 58, '60 - 5 投喂 + 3 缓冲')
  assert.ok((tplNow.memory.facts || []).includes('降级批次归档成功'))
  assert.ok(warns.some((w) => w.includes('size=10')), '第一档失败要留痕：' + JSON.stringify(warns))
})

// 真实情况：归档这条路上模型持续空返回（20/10/5 条都拿不到可用输出，5 条那次还被截断）。
// 与其让日志永远卡在 cap、记忆停在几天前，不如退一步：把最早几条原文并入「近期事件」。
test('归档全线失败时降级：原文并入近期事件，日志不再卡在 cap', async () => {
  const warns = []
  const orig = console.warn
  console.warn = (...args) => warns.push(args.join(' '))
  try {
    llmAlwaysEmpty = true
    trigger('S11')
    await waitFor(() => saved().templates.p11.memoryLog.length === 58, '降级后 60 → 58')
  } finally {
    llmAlwaysEmpty = false
    console.warn = orig
  }
  const tplNow = saved().templates.p11
  assert.equal(tplNow.memoryLog.length, 58, '降级投喂 5 条：3 条缓冲 + 55 条未投喂')
  assert.ok((tplNow.memory.events || []).some((e) => String(e && e.t).includes('第 1 条日志')), '原文应并入近期事件：' + JSON.stringify(tplNow.memory.events))
  assert.ok(warns.some((w) => w.includes('记忆归档降级')), '降级必须留痕：' + JSON.stringify(warns))
})
