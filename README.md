# dsh-cultivation — 角色养成 (Character Cultivation)

> 一个面向 DeepSeek Harness (DSH) Web 的 AI 角色养成插件。
> 让 DSH 里的角色从一段固定 Prompt，变成一个会随着互动积累关系状态、形成对用户判断，并定期整理这些判断的长期角色。
>
> **让 AI 不只是「扮演一个角色」，而是逐渐形成「对你的认识」。**

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-cultivation"><img src="https://img.shields.io/npm/v/dsh-cultivation" alt="npm version"/></a>
  <a href="https://github.com/leonardwwq/dsh-cultivation"><img src="https://img.shields.io/github/stars/leonardwwq/dsh-cultivation?style=social" alt="stars"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"/></a>
</p>

---

## Status

> **Active development.**

当前实现包括：

- Persistent Persona（持久化角色设定）
- Event Log（事件日志）
- Role-specific Appraisal（角色视角的事件评价）
- Relationship / Intimacy State（关系状态）
- User Beliefs（对用户的长期认识）
- Belief-aware Response Generation（认识参与回复生成）
- Belief Consolidation（信念整理）
- Persistent local storage（本地持久化）

`131 tests passed / 0 failed`

> DSH 本身仍在快速迭代，插件兼容性可能随 DSH 版本变化。

---

## Why

传统 AI 角色主要依赖一段固定的 Persona Prompt：

```text
用户 → AI
「你是一个高冷角色，请这样说话。」
```

每次对话，模型都被重新告知"你是谁"，角色本身不拥有任何随互动积累的状态。

这个项目尝试让角色拥有自己的**内部状态**：

```text
用户 → Event → Appraisal → Relationship → Belief
        ↓
  Response Generation → Belief Consolidation → 下一轮继续理解用户
```

核心区别：不是让 AI 每次重新「假装自己是这个角色」，而是让角色拥有一些**随互动积累、跨会话保留、并在回复中实际使用**的状态。

> 这不是"一个更复杂的 Prompt"，而是一个**状态闭环**。

---

## What it does

一个 DSH Web 插件，为每个会话绑定一个可长期养成的 AI 角色：

- 角色拥有完整的人设与背景（Persona）
- 每次对话被记录为事件（Event）
- 每个事件在角色视角下被评价（Appraisal）
- 关系状态随互动变化（Intimacy）
- 角色对用户形成带置信度的长期判断（Belief）
- 这些判断进入后续回复的生成上下文（Response Generation）
- 系统定期整理这些判断（Belief Consolidation）

---

## 最简单的工作原理

```text
                    Persona
                       │
                       ▼
User ──────────────► Conversation
                       │
                       ▼
                     Event
                       │
                       ▼
                   Appraisal
                    /     \
                   /       \
                  ▼         ▼
             Intimacy     Belief
                             │
                             ▼
                    Belief Context
                             │
                             ▼
                    Response Generation
                             │
                             ▼
                     New Conversation
                             │
                             ▼
                    Belief Consolidation
                             │
                             └──────► Belief
```

- **Event** 是原始流水（发生了什么，不评价）
- **Appraisal** 是事件评价（这件事对我意味着什么）
- **Intimacy** 是关系状态（我和你的关系怎么样）
- **Belief** 是用户模型（我觉得你可能是怎样的人）
- **Response Generation** 读取 Belief（认识参与当前回复）
- **Consolidation** 整理 Belief（让认识更少、更稳定）
- **Memory** 是另一条独立的记忆系统，**不被 Consolidation 直接接管**

---

## Architecture

```
lib/
├── core.js      # 纯函数 / 状态逻辑（normalize、migration、event、appraisal、belief、consolidation、prompt 构造）
├── index.js     # Host：DSH 集成、会话生命周期、持久化、编排、LLM 调用
└── client.js    # Web UI：角色库、编辑器、会话选择、头像、关系展示
```

- 纯 JavaScript，**零运行时依赖**（不引入数据库、向量库、Agent Framework）
- 单 JSON 文件本地持久化 + 原子写
- 数据版本自动迁移（v1 → v6）
- 所有状态更新遵循「LLM 提议 → 代码验证 → 确定性执行」，**LLM 永远不能直接修改数据**

---

## Event / Appraisal / Intimacy / Memory / Belief / Consolidation

| 层 | 简单解释 |
| --- | --- |
| **Persona** | 「我是谁」——用户定义的角色人格、背景、性格、目标 |
| **Event** | 「刚才发生了什么」——一次完整互动（用户说了什么 + 角色回了什么），只记录、不评价 |
| **Appraisal** | 「这件事对我意味着什么」——角色视角下的事件评价，而非客观好坏 |
| **Intimacy** | 「我和你的关系现在怎么样」——0~100 的关系状态，随互动变化 |
| **Memory** | 「哪些事情值得我长期记住」——独立的记忆系统（分区 + 日志归档） |
| **Belief** | 「我觉得你可能是怎样的人」——带置信度的长期判断，**不是事实** |
| **Consolidation** | 「我回头整理一下我对你的认识」——定期整理碎片化 / 冲突的信念 |

### 关键区分：Belief ≠ Memory

```text
Memory（记住事实）：
「用户说过自己讨厌周末加班。」

Belief（形成判断）：
「我认为用户可能很重视自己的个人时间。」
```

前者是记住发生过什么，后者是基于发生过的事情形成判断。

---

## 一个完整的多轮对话例子

> 以下是一个机制演示。它说明系统的**设计目标**，不代表 LLM 每次都会产生这个精确结果。

### 第 1 轮

用户：

> 「我周末一般都待在家看书。」

系统形成：

```text
Event：用户说周末在家看书。
Appraisal：这个信息与角色了解用户有关。
Belief：「用户可能喜欢安静的生活。」confidence 0.62
```

### 第 3 轮

用户：

> 「我特别讨厌人多的地方。」

系统形成：

```text
Belief：「用户可能不喜欢高密度社交。」confidence 0.65
```

### 第 7 轮

用户：

> 「我最近每周末都去爬山，还认识了一群新朋友。」

系统**不会**简单认为"用户前面说喜欢安静，所以现在矛盾了"，而是允许新证据产生新的认识。随后 **Consolidation** 会发现：

- 高度相近的 Belief 可以合并（例如前两条都在描述"低密度生活偏好"）
- 明显冲突的 Belief 则降低置信度，而不是粗暴删除

角色最终可能形成：

> 「用户总体偏好低压力、低密度的生活，但并不排斥与熟悉的人建立社交。」

---

## Belief 如何影响回复

Belief 不是"数据库里的死数据"——它会实际进入角色生成回复时的系统提示（最多 5 条高置信度信念）。注入时明确告诉模型：

- Belief 是过去互动形成的判断，**不一定是事实**
- **当前对话中的明确表达优先**于历史 Belief
- 如果当前对话与某条 Belief 无关，**应忽略它**（不强行引用）

---

## Belief Consolidation

如果没有 Consolidation，长期积累的判断会变成这样：

```text
Belief 1：用户喜欢安静
Belief 2：用户不喜欢社交
Belief 3：用户喜欢户外
Belief 4：用户重视个人时间
Belief 5：用户不喜欢拥挤
…
```

问题：

- 相似判断重复存在
- 冲突判断没人整理
- 高置信度槽位被碎片占用
- 系统只是在「积累判断」，而不是「整理认识」

Consolidation 的作用就是：

> 定期回头看一眼已有 Beliefs，把相近的整理起来，对明显冲突的判断降低置信度。

当前实现（每 10 轮触发一次）：

- **merge**：合并高度相近的信念——confidence 取原信念最高值，evidence 取并集
- **conflict**：对同一维度明显冲突的两条信念，各自 confidence × 0.8——**保留两条、不删除、不武断决定谁正确**
- **none**：无需整理

明确说明：

- **LLM 只提出整理建议，最终状态变化由代码验证 + 确定性规则执行**
- 不允许 LLM 自由删除 Belief
- 不修改 Memory / Persona / Intimacy / Mood / Growth
- 失败不会影响正常对话
- 当前版本只做**最小的 Belief Consolidation**，不是完整的长期人格 / 用户画像系统

---

## Features

- 会话级 Persona 绑定（新建会话选择，绑定后锁定）
- 自定义角色：新建 / 编辑 / 头像 / 默认 / JSON 导入导出 / AI 设计助手
- 角色记忆：分区存储 + 追加式日志自动归档，跨会话累积
- 关系 / Intimacy：0~100，语气随关系阶段调整（冷淡 → 客气 → 熟络 → 亲密 → 依赖）
- Event Log：完整记录每次互动（cap 40）
- Appraisal：角色视角的事件评价（relevance / valence / arousal / relationshipRelevance / uncertainty）
- Belief：对用户的长期认识（cap 30，带 confidence 与 evidence）
- Belief → Response Generation：高置信度信念进入回复上下文（最多 5 条）
- Belief Consolidation：每 10 轮整理一次碎片化 / 冲突的信念
- 角色成长：交互中真实长出的新特质
- 情绪：完整情绪体验，「此刻心情」随互动更新
- 口吻保持：对抗长对话中的角色稀释
- 本地存储：所有状态仅保存在本地
- 子代理隔离：角色段仅注入根会话

---

## Installation

需要可运行的 **DSH Web** 部署。包名：`dsh-cultivation`。

```bash
# pnpm
cd "$DSH_HOME/profiles/web"
pnpm add dsh-cultivation

# 或 npm
npm install dsh-cultivation
```

安装最新开发版（beta）：

```bash
pnpm add dsh-cultivation@beta
```

然后在 `cordis.patch.yml` 添加：

```yaml
- insert:
    - id: persona-studio
      name: 'dsh-cultivation'
```

重启 DSH，「设置 → 角色养成」出现本插件。

> 建议使用最新版 DSH Web，以获得完整的插件与 UI 支持。

---

## Usage

1. **新建会话**：在输入框工具行选择角色（或新建角色）
2. **对话**：以该角色身份进行；会话页右上角可开关角色
3. **管理角色**：设置 → 角色养成（设默认 / 编辑 / 导出 / 删除 / 导入）
4. **编辑角色**：表单 + AI 设计助手 + 角色卡预览 + 头像
5. **其余全部自动**：Memory、Intimacy、Event、Appraisal、Belief 由系统自动维护，长期互动后系统自动整理 Beliefs——**无需手动操作**

---

## Data & Privacy

- 数据文件：`$DSH_HOME/persona-studio.json`（默认 `~/.dsh/persona-studio.json`）
- 头像：同目录下 `persona-studio-avatar-<id>.<ext>`
- **角色状态数据由插件本地持久化；插件本身不提供云端状态同步**，也不会主动把角色状态上传到第三方服务器
- DSH 本身以及你配置的 LLM Provider 仍可能产生网络请求——这是 DSH 环境的一部分

---

## Testing

```bash
npm test             # 全部单元测试（131 tests passed / 0 failed）
npm run check        # 发布前预检（语法 / 工具名 / 零外部 import / bundle id）
npm pack --dry-run   # 检查 npm tarball 内容
```

- Node.js 内置 test runner（`node --test`），**无新增测试依赖**
- Event / Appraisal / Belief / Response Generation / Belief Consolidation 均有对应测试
- 覆盖：数据流、状态转换、user / persona 隔离、幂等、异常处理（LLM 失败不影响对话）

> 测试验证的是**工程行为**（数据流、状态转换、隔离、幂等、异常处理），**不代表已经证明角色在主观体验上"更像真人"**。

---

## Limitations

诚实的已知限制：

1. 运行期 `userId` 默认为 `local`（多用户隔离的存储结构已就绪，真实用户体系尚未接入）
2. Belief 是「LLM 提议 + 确定性校验」的结果，**不代表真实用户画像**
3. Consolidation 的语义判断（哪些表述相近 / 哪些冲突）仍依赖 LLM
4. 当前没有完整的时间衰减机制
5. 当前不做云端同步
6. 这是 Beta：不保证超长对话中始终保持完美的角色一致性
7. 测试覆盖的是工程行为，不构成对角色"主观体验"的证明

---

## Roadmap

### Completed

- Persona（角色设定与角色库）
- Memory（分区记忆 + 追加式日志归档）
- Relationship / Intimacy
- Event（事件日志）
- Appraisal（事件评价）
- Belief（对用户的认识）
- Response Generation（Belief 进入回复生成）
- Belief Consolidation（信念整理）

### Next

> **Real-world validation**

下一阶段重点不是继续增加认知模块，而是通过长期真实对话验证：

- Belief 是否真的改善角色一致性
- Consolidation 是否减少碎片化认识
- 不同 Persona 是否形成不同判断
- 用户是否能够实际感知角色「越来越了解自己」

---

## License

[MIT](./LICENSE)
