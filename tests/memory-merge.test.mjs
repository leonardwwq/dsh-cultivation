// 记忆归档增量合并测试：去重、精确删除、事件日期、cap、异常输入
// 运行：node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeMemorySections, memoryLogAfterArchive, normalizeMemory, normalizeMemoryLog, MEMORY_CAPS, MEMORY_LOG_CAP, MEMORY_MERGE_KEEP } from '../lib/core.js'

test('mergeMemorySections：add 增量合并 + 去重', () => {
  const mem = normalizeMemory({ facts: ['已有事实A'] })
  const j = {
    add: { facts: ['已有事实A', '新事实B', '  新事实C  '], userInfo: ['用户喜欢茶'], relationship: [], promises: [] }
  }
  const out = mergeMemorySections(mem, j)
  // 已有事实A 去重不重复追加
  assert.deepEqual(out.facts, ['已有事实A', '新事实B', '新事实C'])
  assert.deepEqual(out.userInfo, ['用户喜欢茶'])
})

test('mergeMemorySections：remove 精确匹配删除过时条目', () => {
  const mem = normalizeMemory({ facts: ['过时条目', '保留条目'], relationship: ['旧关系', '新关系'] })
  const j = { remove: { facts: ['过时条目'], relationship: ['旧关系'] } }
  const out = mergeMemorySections(mem, j)
  assert.deepEqual(out.facts, ['保留条目'])
  assert.deepEqual(out.relationship, ['新关系'])
})

test('mergeMemorySections：remove 需逐字一致（trim 后比较），不完全一致不误删', () => {
  const mem = normalizeMemory({ facts: ['完全一致'], userInfo: ['  带空格  '] })
  const j = { remove: { facts: ['完全一致 '], userInfo: ['带空格'] } }
  const out = mergeMemorySections(mem, j)
  // '完全一致 ' trim 后与 '完全一致' 匹配 → 删除
  assert.deepEqual(out.facts, [])
  // '带空格' 与 '  带空格  ' trim 后匹配 → 删除
  assert.deepEqual(out.userInfo, [])
})

test('mergeMemorySections：events 带日期/相对日期兜底今天', () => {
  const mem = normalizeMemory({})
  const j = { events: ['2024-08-26：约好去吃烧烤', '下周去看展', '2024-08-26：约好去吃烧烤（重复）'] }
  const out = mergeMemorySections(mem, j)
  // 事件按内容去重（t 相同不重复）
  const texts = out.events.map((e) => e.t)
  assert.equal(new Set(texts).size, texts.length)
  assert.ok(out.events.some((e) => e.d === '2024-08-26' && e.t === '约好去吃烧烤'))
  // 相对日期被今天兜底
  assert.ok(out.events.some((e) => e.t === '下周去看展'))
})

test('mergeMemorySections：cap 限制（add 超出上限被截断）', () => {
  const mem = normalizeMemory({})
  const j = { add: { facts: Array.from({ length: 50 }, (_, i) => 'f' + i) } }
  const out = mergeMemorySections(mem, j)
  assert.equal(out.facts.length, MEMORY_CAPS.facts)
})

test('mergeMemorySections：异常输入不崩溃、不改动', () => {
  const mem = normalizeMemory({ facts: ['A'] })
  assert.deepEqual(mergeMemorySections(mem, null).facts, ['A'])
  assert.deepEqual(mergeMemorySections(mem, {}).facts, ['A'])
  assert.deepEqual(mergeMemorySections(mem, { add: 'bad', remove: 'bad', events: 'bad' }).facts, ['A'])
  assert.deepEqual(mergeMemorySections(mem, { add: { facts: 'bad' } }).facts, ['A'])
  // events 数组里 null 被过滤；数字被 parseDated 按原行为转成文本（沿用旧逻辑，非新增）
  const ev = mergeMemorySections(mem, { events: [null, 42] }).events
  assert.equal(ev.length, 1)
  assert.equal(ev[0].t, '42')
})

test('mergeMemorySections：不修改入参（返回新对象）', () => {
  const mem = normalizeMemory({ facts: ['A'] })
  const snapshot = JSON.stringify(mem)
  mergeMemorySections(mem, { add: { facts: ['B'] } })
  assert.equal(JSON.stringify(mem), snapshot)
})

test('mergeMemorySections：先删后增语义', () => {
  const mem = normalizeMemory({ facts: ['被取代的旧条目'] })
  const j = { remove: { facts: ['被取代的旧条目'] }, add: { facts: ['取代它的新条目'] } }
  const out = mergeMemorySections(mem, j)
  assert.deepEqual(out.facts, ['取代它的新条目'])
})

// ---- memoryLogAfterArchive：归档成功后的日志回写（缓冲 + 未投喂的更旧条目） ----
const mkLog = (n) => Array.from({ length: n }, (_, i) => ({ d: '2026-10-01', t: '记录' + i }))

test('memoryLogAfterArchive：正常批量（fed < len，保留最近 keep 条缓冲 + 未投喂的更旧条目）', () => {
  const log = mkLog(10)
  const out = memoryLogAfterArchive(log, 4)
  // 最新 3 条留作缓冲；log[3] 已投喂被移除；log[4..9] 原样跟上，顺序不变
  assert.equal(out.length, 9)
  assert.deepEqual(out.slice(0, 3).map((e) => e.t), ['记录0', '记录1', '记录2'])
  assert.deepEqual(out.slice(3).map((e) => e.t), ['记录4', '记录5', '记录6', '记录7', '记录8', '记录9'])
})

test('memoryLogAfterArchive：一次投喂到底（fed >= len）等价于只留 keep 条', () => {
  const log = mkLog(5)
  assert.deepEqual(memoryLogAfterArchive(log, 5).map((e) => e.t), ['记录0', '记录1', '记录2'])
  assert.equal(memoryLogAfterArchive(log, 5).length, MEMORY_MERGE_KEEP)
  // fed 超过长度同样只留 keep 条
  assert.deepEqual(memoryLogAfterArchive(log, 99).map((e) => e.t), ['记录0', '记录1', '记录2'])
})

test('memoryLogAfterArchive：fedCount 非法（0 / 负数 / 非数字）原样归一化返回', () => {
  const log = mkLog(5)
  const expect = normalizeMemoryLog(log)
  for (const bad of [0, -3, NaN, '3', null, undefined, {}]) {
    assert.deepEqual(memoryLogAfterArchive(log, bad), expect)
  }
})

test('memoryLogAfterArchive：keep 与 fedCount 交叠不产生重复条目', () => {
  const log = mkLog(10)
  // fed=2 < keep=3：缓冲 [0,1,2] 与未投喂 [2..9] 在「记录2」处交叠
  const out = memoryLogAfterArchive(log, 2, 3)
  assert.equal(out.length, 10)
  assert.deepEqual(out.map((e) => e.t), log.map((e) => e.t))
  // 按「日期 + 文本」去重：同一条不会出现两次
  const keys = out.map((e) => e.d + '|' + e.t)
  assert.equal(new Set(keys).size, keys.length)
})

test('memoryLogAfterArchive：keep=0 时只留未投喂条目', () => {
  const log = mkLog(5)
  assert.deepEqual(memoryLogAfterArchive(log, 2, 0).map((e) => e.t), ['记录2', '记录3', '记录4'])
})

test('memoryLogAfterArchive：结果经 normalize 收敛（过滤非法条目、按 cap 截断）', () => {
  const log = [{ d: '2026-10-01', t: '有效' }, null, { t: '' }, 'bad', ...mkLog(70)]
  const out = memoryLogAfterArchive(log, 1)
  assert.equal(out.length, MEMORY_LOG_CAP)
  assert.ok(out.every((e) => e && typeof e.d === 'string' && typeof e.t === 'string' && e.t))
})

test('memoryLogAfterArchive：不修改入参，返回新数组', () => {
  const log = mkLog(6)
  const snap = JSON.stringify(log)
  const out = memoryLogAfterArchive(log, 4)
  assert.equal(JSON.stringify(log), snap)
  assert.notEqual(out, log)
  assert.notEqual(out[0], log[0])
})
