// 角色养成 · 状态体检（开发用，不随 npm 包发布——package.json 的 files 不含 dev/）
// 用法：node dev/report.mjs
// 只打印聚合指标与结构，不打印完整对话原文（记忆/事件只显示前 24 字，便于定位）。
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  renderPersonaCard, getBeliefs, getEventLog, getAppraisals, getBeliefUpdates,
  getBeliefConsolidations, intimacyOf, normalizeMemory, normalizeMemoryLog,
  normalizeGrowth, MEMORY_CAPS, BELIEF_CAP
} from '../lib/core.js'

const home = process.env.DSH_HOME || homedir() + '/.dsh'
const file = home + '/persona-studio.json'
let data
try {
  data = JSON.parse(await readFile(file, 'utf8'))
} catch (e) {
  console.error('读不到 ' + file + '：' + (e && e.message))
  process.exit(1)
}

const short = (s, n = 24) => {
  const t = String(s || '').replace(/\s+/g, ' ')
  return t.length > n ? t.slice(0, n) + '…' : t
}
const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '-')
const day = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '-')

console.log('数据文件: ' + file + '（version ' + data.version + '）')
console.log('角色 ' + Object.keys(data.templates || {}).length + ' 个 / 会话 ' + Object.keys(data.sessions || {}).length + ' 个\n')

for (const pid of Object.keys(data.relations || {})) {
  for (const uid of Object.keys(data.relations[pid] || {})) {
    const row = data.relations[pid][uid] || {}
    const events = getEventLog(data.relations, pid, uid)
    if (!events.length) continue
    const appraisals = getAppraisals(data.relations, pid, uid)
    const beliefs = getBeliefs(data.relations, pid, uid)
    const updates = getBeliefUpdates(data.relations, pid, uid)
    const acts = {}
    for (const u of updates) acts[u.action] = (acts[u.action] || 0) + 1
    const tpl = data.templates[pid]

    console.log('=== ' + pid + ' / ' + uid + ' ===')
    console.log('  亲密度 ' + intimacyOf(data.relations, pid, uid) + '/100')
    console.log('  事件 ' + events.length + '（最新 ' + day(events[events.length - 1].timestamp) + '）')
    console.log('  Appraisal ' + appraisals.length + ' → 覆盖率 ' + pct(appraisals.length, events.length) +
      '（最新 ' + day(appraisals.length ? appraisals[appraisals.length - 1].timestamp : 0) + '）')
    console.log('  Belief ' + beliefs.length + '/' + BELIEF_CAP + ' · updates ' + JSON.stringify(acts) +
      ' · consolidation ' + getBeliefConsolidations(data.relations, pid, uid).length)
    for (const b of beliefs) console.log('    - [' + b.confidence + '] ' + short(b.proposition, 40) + '（证据 ' + (b.evidence || []).length + ' 条）')

    // 未消化的积压：有事件但没 appraisal
    const done = new Set(appraisals.map((a) => a && a.eventId))
    const backlog = events.filter((e) => e && e.id && !done.has(e.id))
    if (backlog.length) {
      console.log('  ⚠ 未评价积压 ' + backlog.length + ' 条，最早可追溯到 ' + day(backlog[0].timestamp))
      console.log('    例：' + short(backlog[0].userInput, 40))
    }

    if (tpl) {
      const mem = normalizeMemory(tpl.memory)
      const log = normalizeMemoryLog(tpl.memoryLog)
      console.log('  记忆 ' + Object.keys(MEMORY_CAPS).map((k) => k + ' ' + mem[k].length + '/' + MEMORY_CAPS[k]).join(' · '))
      console.log('  日志 ' + log.length + '/60（最新 ' + day(log.length ? log[0].d : 0) + '）· 成长 ' + normalizeGrowth(tpl.growth).length)
      const card = renderPersonaCard(data, pid, uid, { sessionId: Object.keys(data.sessions || {})[0], today: day(Date.now()) })
      const blocks = card.split('\n\n').map((b) => ({ len: b.length, head: (b.match(/^【[^】]{0,20}/) || [b.slice(0, 20)])[0] }))
      blocks.sort((a, b) => b.len - a.len)
      console.log('  角色卡 ' + card.length + ' 字符，最大的三块：')
      for (const b of blocks.slice(0, 3)) console.log('    ' + String(b.len).padStart(5) + '  ' + b.head)
    }
    console.log('')
  }
}

const empty = Object.keys(data.relations || {}).every((p) =>
  Object.keys(data.relations[p] || {}).every((u) => !(data.relations[p][u] || {}).eventLog?.length))
if (empty) console.log('（还没有任何事件：先在绑定了角色的会话里聊几轮）')

// 后台告警尾巴：插件把 [persona-studio] 告警同时写进 DSH_HOME/persona-studio.log，
// 这样体检脚本能直接看到"最近失败过什么"，不用去翻启动 DSH 的那个终端。
try {
  const logFile = home + '/persona-studio.log'
  const text = await readFile(logFile, 'utf8')
  const lines = text.split('\n').filter(Boolean)
  if (lines.length) {
    console.log('\n=== 最近告警（' + logFile + '，共 ' + lines.length + ' 行）===')
    for (const line of lines.slice(-5)) console.log('  ' + line)
  }
} catch (e) { /* 没有告警文件就是没告警 */ }
