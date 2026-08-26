// Belief → Response Generation 测试：Relevant Beliefs 进入 Response Prompt
// 覆盖：注入/空值/数量限制/非事实标注/当前对话优先/无关不强用/用户隔离/Persona 隔离/只读/旧数据兼容/行为差异。
// 运行：node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBeliefContext, renderPersonaCard,
  getRelevantBeliefs, BELIEF_RELEVANT_LIMIT, DEFAULT_USER_ID
} from '../lib/core.js'

// ---- 辅助：构造一份完整的 data（templates + relations + settings）----
function makeData(relations) {
  return {
    version: 6,
    settings: { concentration: 80, showIntimacyBadge: true },
    templates: {
      pA: {
        id: 'pA', name: '角色A',
        fields: { name: '林晚', gender: 'female', age: 27, traitTags: ['高冷', '理性'], speechStyle: ['简洁'], userAddress: '小同学', currentGoal: '把杂志改版成业内第一' },
        memory: { facts: [], userInfo: [], relationship: [], promises: [], events: [] },
        memoryLog: [], growth: [], mood: null
      },
      pB: {
        id: 'pB', name: '角色B',
        fields: { name: '苏糖', gender: 'female', age: 19, traitTags: ['元气', '温柔'], speechStyle: ['口语'], userAddress: '学长', currentGoal: '开甜品店' },
        memory: { facts: [], userInfo: [], relationship: [], promises: [], events: [] },
        memoryLog: [], growth: [], mood: null
      }
    },
    relations: relations || {},
    sessions: {}
  }
}
function belief(id, proposition, confidence) {
  return { id, proposition, confidence, evidence: ['evt-1'], createdAt: 1, updatedAt: 1 }
}

// ============ Test 1：有 Belief 时进入 Response Prompt ============
test('Test 1：有 Belief 时进入 Response Prompt（最终角色卡包含该 Belief）', () => {
  const data = makeData({ pA: { local: { intimacy: 60, beliefs: [belief('b1', '用户可能很重视工作生活平衡', 0.82)] } } })
  const card = renderPersonaCard(data, 'pA') // 默认 userId = DEFAULT_USER_ID
  assert.ok(card.includes('用户可能很重视工作生活平衡'))
  assert.ok(card.includes('置信度：82%'))
  assert.ok(card.includes('【你对用户的一些长期认识】'))
})

// ============ Test 2：没有 Belief 时正常生成 ============
test('Test 2：没有 Belief 时正常生成（不报错、无空 section）', () => {
  const data = makeData({ pA: { local: { intimacy: 60 } } }) // 无 beliefs
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('【角色档案：角色A】'))
  assert.ok(!card.includes('【你对用户的一些长期认识】'))
  assert.ok(!card.includes('置信度：'))
  // buildBeliefContext 空输入返回空串
  assert.equal(buildBeliefContext([]), '')
  assert.equal(buildBeliefContext(null), '')
  assert.equal(buildBeliefContext([null, {}]), '')
})

// ============ Test 3：Belief 数量受限 ============
test('Test 3：Belief 数量受限（10 条只注入规定数量）', () => {
  const many = Array.from({ length: 10 }, (_, i) => belief('b' + i, '用户的认识' + i, 0.5 + i * 0.04))
  // 默认 limit（BELIEF_RELEVANT_LIMIT=5）
  const ctx = buildBeliefContext(many)
  assert.equal(ctx.split('\n- ').length - 1, BELIEF_RELEVANT_LIMIT)
  // 显式 limit 生效
  const ctx3 = buildBeliefContext(many, 3)
  assert.equal(ctx3.split('\n- ').length - 1, 3)
  // 完整角色卡同样受限
  const data = makeData({ pA: { local: { intimacy: 60, beliefs: many } } })
  const card = renderPersonaCard(data, 'pA')
  assert.ok((card.match(/- 用户的认识/g) || []).length <= BELIEF_RELEVANT_LIMIT)
})

// ============ Test 4：Belief 不是事实 ============
test('Test 4：Prompt 明确标注 Belief 是判断而非事实', () => {
  const data = makeData({ pA: { local: { intimacy: 60, beliefs: [belief('b1', '用户可能喜欢独处', 0.8)] } } })
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('不一定是事实'))
  assert.ok(card.includes('基于过去互动形成的判断'))
})

// ============ Test 5：当前对话优先 ============
test('Test 5：Prompt 明确当前用户明确表达 > 过去 Belief', () => {
  const data = makeData({ pA: { local: { intimacy: 60, beliefs: [belief('b1', '用户可能喜欢独处', 0.85)] } } })
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('当前对话中用户的明确表达优先于过去形成的认识'))
})

// ============ Test 6：无关 Belief 不强制使用 ============
test('Test 6：Prompt 明确只有相关时才使用 Belief（防机械复读）', () => {
  const data = makeData({ pA: { local: { intimacy: 60, beliefs: [belief('b1', '用户可能很重视工作生活平衡', 0.9)] } } })
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('只有当某条认识对理解当前用户表达、判断用户状态或决定回复方式有帮助时才使用它'))
  assert.ok(card.includes('否则忽略'))
  assert.ok(card.includes('不要强行套用'))
})

// ============ Test 7：不同用户隔离 ============
test('Test 7：不同用户隔离（User B 的 Prompt 不含 User A 的 Belief）', () => {
  const data = makeData({
    pA: {
      userA: { intimacy: 60, beliefs: [belief('b1', '用户喜欢猫', 0.9)] },
      userB: { intimacy: 60 } // 无 belief
    }
  })
  const cardA = renderPersonaCard(data, 'pA', 'userA')
  const cardB = renderPersonaCard(data, 'pA', 'userB')
  assert.ok(cardA.includes('用户喜欢猫'))
  assert.ok(!cardB.includes('用户喜欢猫'))
  assert.ok(!cardB.includes('【你对用户的一些长期认识】'))
  // 读取接口层面同样隔离
  assert.equal(getRelevantBeliefs(data.relations, 'pA', 'userA').length, 1)
  assert.equal(getRelevantBeliefs(data.relations, 'pA', 'userB').length, 0)
})

// ============ Test 8：不同 Persona 隔离 ============
test('Test 8：不同 Persona 隔离（同一 user，beliefs 不串）', () => {
  const data = makeData({
    pA: { local: { intimacy: 60, beliefs: [belief('bA', '用户可能喜欢安静', 0.8)] } },
    pB: { local: { intimacy: 60, beliefs: [belief('bB', '用户可能喜欢热闹', 0.8)] } }
  })
  const cardA = renderPersonaCard(data, 'pA')
  const cardB = renderPersonaCard(data, 'pB')
  assert.ok(cardA.includes('用户可能喜欢安静'))
  assert.ok(!cardA.includes('用户可能喜欢热闹'))
  assert.ok(cardB.includes('用户可能喜欢热闹'))
  assert.ok(!cardB.includes('用户可能喜欢安静'))
})

// ============ Test 9：Belief 不被 Response Generation 修改 ============
test('Test 9：Belief 不被 Response Generation 修改（渲染是只读的）', () => {
  const beliefs = [belief('b1', '用户可能很重视工作生活平衡', 0.82)]
  const data = makeData({ pA: { local: { intimacy: 60, beliefs } } })
  const before = JSON.stringify(beliefs)
  renderPersonaCard(data, 'pA')
  buildBeliefContext(beliefs)
  getRelevantBeliefs(data.relations, 'pA', DEFAULT_USER_ID)
  const after = JSON.stringify(beliefs)
  assert.equal(before, after)
})

// ============ Test 10：旧数据兼容 ============
test('Test 10：旧数据（无 relations/beliefs）正常生成回复', () => {
  // 完全没有 relations
  const data = makeData(undefined)
  const card = renderPersonaCard(data, 'pA')
  assert.ok(card.includes('【角色档案：角色A】'))
  assert.ok(!card.includes('【你对用户的一些长期认识】'))
  // relations 行存在但无 beliefs 键
  const data2 = makeData({ pA: { local: { intimacy: 30 } } })
  const card2 = renderPersonaCard(data2, 'pA')
  assert.ok(card2.includes('【亲密度 30/100'))
  assert.ok(!card2.includes('置信度：'))
  // 角色不存在时返回空串（不崩溃）
  assert.equal(renderPersonaCard(data, 'no-such-persona'), '')
})

// ============ 行为验证：有 Belief / 无 Belief 时 LLM 上下文确实不同 ============
test('行为验证：User A 获得 Belief Context，User B 没有（相同 Persona、相同输入）', () => {
  const personaId = 'pA'
  const userInput = '我最近又要周末加班了。'
  // User A：有高置信 belief；User B：没有
  const data = makeData({
    pA: {
      userA: { intimacy: 70, beliefs: [belief('b1', '用户可能很重视工作生活平衡', 0.9)] },
      userB: { intimacy: 70 } // 无 belief
    }
  })
  // 模拟 Response Generation 的上下文组装：persona-studio:persona section 文本 = renderPersonaCard 输出
  const systemA = renderPersonaCard(data, personaId, 'userA')
  const systemB = renderPersonaCard(data, personaId, 'userB')
  // 共同上下文一致：同一 Persona、同一亲密度（仅 belief 段不同）
  assert.ok(systemA.includes('【角色档案：角色A】') && systemB.includes('【角色档案：角色A】'))
  assert.ok(systemA.includes('【亲密度 70/100') && systemB.includes('【亲密度 70/100'))
  // 关键断言：A 的 LLM 输入（system prompt）包含该 Belief，B 的不包含
  assert.ok(systemA.includes('用户可能很重视工作生活平衡'))
  assert.ok(systemA.includes('置信度：90%'))
  assert.ok(!systemB.includes('用户可能很重视工作生活平衡'))
  assert.ok(!systemB.includes('置信度：'))
  // 对同一用户输入，A/B 的上下文确实不同（唯一差异 = Belief Context）
  assert.notEqual(systemA, systemB)
})
