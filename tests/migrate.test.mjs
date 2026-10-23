// 数据迁移测试：v1 → v6，重点 v5 → v6（intimacy 归属迁移）
// 运行：node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrate, DEFAULT_USER_ID, intimacyOf } from '../lib/core.js'

function makeTpl(over = {}) {
  return Object.assign({
    id: 'p1', name: '角色A',
    intimacy: 73,
    fields: { name: '林晚', age: 27, traitTags: ['高冷'], speechStyle: ['简洁'] },
    memory: { facts: ['出身书香门第'], userInfo: ['用户喜欢咖啡'], relationship: ['越来越熟'], promises: ['2024-08-26：约好请我吃烧烤'], events: [{ d: '2024-08-18', t: '一起看了夜场电影' }] },
    memoryLog: [{ d: '2024-08-19', t: '约好下周吃烧烤' }],
    growth: [{ trait: '信任', since: '2024-08-01', note: '长期被真诚对待' }],
    mood: { text: '今天心情不错', since: '2024-08-19' }
  }, over)
}

// Test 3：旧 v5 数据 tpl.intimacy=73 → relations[personaId][defaultUserId].intimacy === 73
test('Test 3：v5 → v6 迁移 intimacy 数值完整保留', () => {
  const data = {
    version: 5,
    defaultPersonaId: 'p1',
    defaultEnabled: true,
    settings: { concentration: 80, showIntimacyBadge: true },
    templates: { p1: makeTpl() },
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(out.version, 7)
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 73)
  assert.deepEqual(out.relations.p1[DEFAULT_USER_ID], { intimacy: 73 })
})

test('migration 幂等：同一数据迁移两次结果一致', () => {
  const data = {
    version: 5,
    templates: { p1: makeTpl({ intimacy: 66 }) },
    sessions: {}
  }
  const once = migrate(data)
  const twice = migrate(migrate(data))
  assert.equal(once.version, 7)
  assert.equal(twice.version, 7)
  assert.equal(intimacyOf(once.relations, 'p1', DEFAULT_USER_ID), 66)
  assert.equal(intimacyOf(twice.relations, 'p1', DEFAULT_USER_ID), 66)
  assert.equal(JSON.stringify(once), JSON.stringify(twice))
})

test('Test 6：旧 memory / mood / growth / memoryLog 数据不丢', () => {
  const data = {
    version: 5,
    templates: { p1: makeTpl() },
    sessions: {}
  }
  const out = migrate(data)
  const tpl = out.templates.p1
  assert.deepEqual(tpl.memory.facts, ['出身书香门第'])
  assert.deepEqual(tpl.memory.userInfo, ['用户喜欢咖啡'])
  assert.deepEqual(tpl.memory.relationship, ['越来越熟'])
  assert.deepEqual(tpl.memory.promises, ['2024-08-26：约好请我吃烧烤'])
  assert.deepEqual(tpl.memory.events, [{ d: '2024-08-18', t: '一起看了夜场电影' }])
  assert.deepEqual(tpl.memoryLog, [{ d: '2024-08-19', t: '约好下周吃烧烤' }])
  assert.deepEqual(tpl.growth, [{ trait: '信任', since: '2024-08-01', note: '长期被真诚对待' }])
  assert.deepEqual(tpl.mood, { text: '今天心情不错', since: '2024-08-19' })
})

test('回滚安全：迁移后 tpl.intimacy 旧字段保留不删', () => {
  const data = { version: 5, templates: { p1: makeTpl({ intimacy: 88 }) }, sessions: {} }
  const out = migrate(data)
  assert.equal(out.templates.p1.intimacy, 88) // 旧字段仍在，回滚不丢
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 88)
})

test('幂等保护：relations 已有合法 intimacy 时不覆盖（保护已迁移/手工修正值）', () => {
  const data = {
    version: 6,
    templates: { p1: makeTpl({ intimacy: 30 }) }, // 旧字段 30 是死数据
    relations: { p1: { [DEFAULT_USER_ID]: { intimacy: 95 } } }, // 已迁移/修正为 95
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 95)
})

test('多角色迁移：每个角色独立迁移，互不串扰', () => {
  const data = {
    version: 5,
    templates: { p1: makeTpl({ intimacy: 80 }), p2: makeTpl({ id: 'p2', intimacy: 20 }) },
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 80)
  assert.equal(intimacyOf(out.relations, 'p2', DEFAULT_USER_ID), 20)
})

test('migration 不丢角色数据：模板数量与 fields 完整', () => {
  const data = { version: 5, templates: { p1: makeTpl() }, sessions: {} }
  const out = migrate(data)
  assert.equal(Object.keys(out.templates).length, 1)
  assert.deepEqual(out.templates.p1.fields, { name: '林晚', age: 27, traitTags: ['高冷'], speechStyle: ['简洁'] })
})

// ============ 老版本数据 ============
test('v1 数据：迁移到 v6，不崩溃、模板保留', () => {
  const data = {
    activeTemplateId: 'p1',
    settings: { enabled: true, concentration: 60 },
    templates: { p1: makeTpl() }
  }
  const out = migrate(data)
  assert.equal(out.version, 7)
  assert.equal(out.defaultPersonaId, 'p1')
  assert.equal(out.defaultEnabled, true)
  assert.equal(out.settings.concentration, 60)
  assert.ok(out.templates.p1)
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 73)
})

test('v2 数据（memory 为整段字符串）：迁移到 v6 拆进长期事实', () => {
  const data = {
    version: 2,
    defaultPersonaId: 'p1',
    defaultEnabled: true,
    settings: { concentration: 80, showIntimacyBadge: true },
    templates: { p1: makeTpl({ memory: '第一行\n第二行', memoryLog: [], growth: [], mood: null }) },
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(out.version, 7)
  assert.deepEqual(out.templates.p1.memory.facts, ['第一行', '第二行'])
})

test('v3 数据（无 intimacy/relations）：迁移到 v6 不崩溃、relations 初始化为空', () => {
  const data = {
    version: 3,
    templates: { p1: makeTpl({ intimacy: undefined }) },
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(out.version, 7)
  assert.deepEqual(out.relations, {})
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 0)
})

// ============ 异常数据防御 ============
test('migrate：null / 空对象 / 无 templates 直接返回不崩溃', () => {
  assert.equal(migrate(null), null)
  assert.deepEqual(migrate({}), {})
  assert.equal(migrate(undefined), undefined)
  assert.equal(migrate('str'), 'str')
})

test('migrate：templates 含非法条目时防御性跳过', () => {
  const data = {
    version: 5,
    templates: { good: makeTpl(), bad: null, bad2: 'string', bad3: { name: '无fields' } },
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(out.version, 7)
  assert.ok(out.templates.good)
  assert.equal(intimacyOf(out.relations, 'good', DEFAULT_USER_ID), 73)
  // 非法模板保持原样（不崩溃）
  assert.equal(out.templates.bad, null)
  assert.equal(out.templates.bad2, 'string')
})

test('migrate：intimacy 非法值（字符串/NaN）不写入 relations', () => {
  const data = {
    version: 5,
    templates: { p1: makeTpl({ intimacy: 'high' }) },
    sessions: {}
  }
  const out = migrate(data)
  assert.equal(intimacyOf(out.relations, 'p1', DEFAULT_USER_ID), 0)
})
