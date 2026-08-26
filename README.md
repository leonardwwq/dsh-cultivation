# dsh-cultivation — 角色养成 (Character Cultivation)

> 一个面向 DeepSeek Harness (DSH) Web 的 AI 角色养成插件。
> 它不仅给 Agent 一个 Persona，还让角色在长期互动中形成关系状态、事件评价和对用户的长期认识，并在后续对话中使用这些状态。
>
> **让 AI 不只是「扮演一个角色」，而是逐渐形成「对你的认识」。**

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-cultivation"><img src="https://img.shields.io/npm/v/dsh-cultivation" alt="npm version"/></a>
  <a href="https://github.com/leonardwwq/dsh-cultivation"><img src="https://img.shields.io/github/stars/leonardwwq/dsh-cultivation?style=social" alt="stars"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"/></a>
</p>

---

## ✨ Features

- **会话级 Persona**：新建会话时选择角色，绑定后锁定（仅可开关）
- **自定义角色**：角色库支持新建、编辑、头像、设为默认，以及 JSON 导入/导出；内置 AI 设计助手辅助生成完整人设
- **角色记忆**：分区存储（长期事实 / 用户信息 / 关系状态 / 承诺 / 事件）+ 追加式日志自动归档，跨会话累积
- **关系 / Intimacy**：角色对用户的亲近程度（0~100）随对话自然变化，语气随关系阶段调整
- **Event Log**：每次对话的完整事件记录（用户说了什么 + 角色回了什么），作为一切状态更新的原始依据
- **Appraisal**：每个事件在角色视角下的评价——「这件事对这个角色意味着什么」，而非客观好坏
- **Belief**：角色对用户形成的带置信度的长期认识——「我认为你可能是怎样的人」
- **Belief Consolidation**：定期整理碎片化 / 冲突的信念，让长期认识更少、更稳定
- **角色成长**：角色在交互中真实长出新的特质，并真实影响后续判断与行为
- **情绪**：角色拥有完整情绪体验，「此刻心情」随互动更新并注入角色卡
- **口吻保持**：对抗长对话中的角色稀释，让角色干完技术活也不会漂回助手腔
- **本地存储**：所有角色状态仅保存在本地，插件不提供云端同步
- **子代理隔离**：角色段仅注入根会话，子代理不受影响、不浪费 token

---

## 🧠 Why is this different?

普通 Persona 插件的工作方式：

```text
Prompt
  ↓
每次对话都重新告诉模型「你是谁」
```

dsh-cultivation 的工作方式：

```text
Persona（角色自身设定）
  +
过去发生的事情（Event）
  +
角色对事情的评价（Appraisal）
  +
角色对用户的长期认识（Belief）
  +
关系状态（Intimacy）
  ↓
当前回复
```

这是一个「状态闭环」，而不是单纯的 Prompt 模板。用一个直白的问题串起来：

| 层 | 回答的问题 |
| --- | --- |
| **Event** | 「发生了什么？」 |
| **Appraisal** | 「这件事对这个角色意味着什么？」 |
| **Intimacy** | 「我和你的关系怎么样？」 |
| **Belief** | 「我认为你可能是怎样的人？」 |
| **Consolidation** | 「我以前形成的这些认识，要不要整理一下？」 |

> **Memory 让角色记得发生过什么，Belief 让角色形成对你的认识。**

---

## 🗺️ Core Architecture

```text
                         ┌──────────────┐
                         │   Persona    │
                         │  角色自身设定  │
                         └──────┬───────┘
                                │
                                ▼
用户 ──────── Conversation ───► Event
                                │
                                ▼
                            Appraisal
                           /         \
                          ▼           ▼
                     Intimacy       Belief
                                      │
                                      ▼
                              Consolidation
                                      │
                                      ▼
                              Relevant Beliefs
                                      │
                                      ▼
                               Response Prompt
                                      │
                                      ▼
                                   Response
                                      │
                                      └──────► 下一轮
```

### Event —「发生了什么？」

每次对话被记录为一个事件：用户说了什么、角色回了什么。这是后续一切状态更新的原始依据，与长期记忆分离（事件是流水，记忆是精选）。

### Appraisal —「这件事对我意味着什么？」

同一个事件，不同角色感受不同。例如用户说「我辞职了」——风险厌恶的角色会焦虑（负向评价），向往自由的角色会兴奋（正向评价）。Appraisal 就是为每个事件打上「对这个角色而言」的评价。

### Intimacy —「我和你的关系怎么样？」

角色对用户的亲近程度（0~100），由事件评价逐步推动，决定说话的语气（冷淡 → 客气 → 熟络 → 亲密 → 依赖）。它是角色自己的真实感受，不是客观评分。

### Belief —「我认为你可能是怎样的人？」

用户说：

> 「我最近总觉得工作和生活很难平衡。」

系统可能形成：

```text
Belief:
「用户可能比较重视工作生活平衡」

confidence: 0.82
```

以后用户再次讨论工作时，角色可以参考这个认识。

**但 Belief 不是事实。** 它是基于历史互动形成的、带置信度的**假设**。当前对话中的明确表达优先于历史 Belief。

### Consolidation —「这些认识要不要整理一下？」

长期积累后，角色可能同时持有：

```text
用户可能喜欢安静独处      0.62
用户可能不喜欢社交        0.65
用户可能喜欢户外活动      0.58
```

系统会定期回顾高置信度的 Beliefs，合并高度相近的表述、对明显冲突的信念做保守处理，最终得到：

```text
合并 / 冲突处理
      ↓
更少、更稳定的 Beliefs
```

明确说明：

- Consolidation **不是重新训练模型**
- 不会修改 Persona / Memory / Intimacy / Mood / Growth
- **LLM 只提出整理建议**（merge / conflict / none）
- **最终状态变化由代码验证 + 确定性规则执行**（置信度按规则计算、证据必须真实、冲突只降置信度不删除）

---

## 📦 Installation

需要可运行的 **DSH Web** 部署。

**1. 在 profile 目录安装依赖**（`pnpm` 示例）：

```bash
cd "$DSH_HOME/profiles/web"
pnpm add dsh-cultivation
# 本地开发可用符号链接：ln -s "$PWD" node_modules/dsh-cultivation
```

**2. 在 `cordis.patch.yml` 添加插入块**：

```yaml
- insert:
    - id: persona-studio
      name: 'dsh-cultivation'
```

**3. 重启 DSH**，「设置 → 角色养成」出现本插件。

> 建议使用最新版 DSH Web，以获得完整的插件与 UI 支持。

---

## 🚀 Usage

1. **新建会话**：在输入框工具行选择角色（或新建角色）
2. **对话**：以该角色身份进行；会话页右上角可开关角色
3. **管理角色**：设置 → 角色养成（设默认 / 编辑 / 导出 / 删除 / 导入）
4. **编辑角色**：表单 + AI 设计助手（设计师 / 访谈）+ 角色卡预览 + 头像
5. **其余全部自动**：Memory、Intimacy、Event、Appraisal、Belief 由系统自动维护，长期互动后系统自动整理 Beliefs——**无需手动操作**

---

## 🔒 Data & Privacy

- 数据文件：`$DSH_HOME/persona-studio.json`（默认 `~/.dsh/persona-studio.json`）
- 头像：同目录下 `persona-studio-avatar-<id>.<ext>`
- **角色状态数据由插件本地持久化；插件本身不提供云端状态同步**，也不会主动把角色状态上传到第三方服务器
- DSH 本身以及你配置的 LLM Provider 仍可能产生网络请求——这是 DSH 环境的一部分

---

## 🏗️ Architecture

```
lib/
├── core.js      # 纯函数 / 状态逻辑
├── index.js     # Host：DSH 集成、生命周期、持久化、编排、LLM 调用
└── client.js    # Web UI：角色库、编辑器、会话选择、头像、关系展示
```

| 文件 | 职责 |
| --- | --- |
| **core.js** | normalization、migration、relation state、event、appraisal、belief、consolidation、prompt construction——全部为可独立测试的纯函数，零依赖 |
| **index.js** | DSH 插件 Host：注册工具、注入角色卡（`systemPrompt.section`）、会话生命周期 hook、本地 API、原子持久化、所有 LLM 调用编排 |
| **client.js** | DSH Web 客户端：角色库、编辑弹窗、会话角色选择、头像、亲密度展示 |

技术要点：

- 纯 JavaScript，**零运行时依赖**（不引入数据库、向量库、Agent Framework）
- 单 JSON 文件本地持久化 + 原子写（临时文件 → rename）
- 数据版本自动迁移（v1 → v6）
- 所有状态更新遵循「LLM 提议 → 代码验证 → 确定性执行」，LLM 永远不能直接修改数据

---

## 🧪 Testing

```bash
npm test             # 全部单元测试
npm run check        # 发布前预检（语法 / 工具名 / 零外部 import / bundle id）
npm pack --dry-run   # 检查 npm tarball 内容
```

当前采用：

- Node.js 内置 test runner（`node --test`），**无新增测试依赖**
- core 层大量纯函数测试（normalize / migration / state transition）
- 状态迁移与幂等测试
- LLM 失败 fallback 测试（失败不影响对话）
- user / persona 隔离测试

> **131 tests passing**

---

## ⚠️ Limitations

诚实的已知限制：

1. 当前运行期 `userId` 默认为 `local`（多用户隔离的存储结构已就绪，真实用户体系尚未接入）
2. Belief 是「LLM 提议 + 确定性校验」的结果，**不代表真实用户画像**
3. Consolidation 的语义判断（哪些表述相近 / 哪些冲突）仍依赖 LLM
4. 当前没有完整的时间衰减机制（「多久忘掉一个信念」留待验证后决定）
5. 当前不做云端同步
6. 这是 **Beta**，不保证超长对话中始终保持完美的角色一致性

---

## 🗓️ Roadmap

### Completed

- Persona（角色设定与角色库）
- Memory（分区记忆 + 追加式日志自动归档）
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
