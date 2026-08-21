# dsh-cultivation — 角色养成 (Character Cultivation)

> 一个 DeepSeek Harness（Web 界面）插件：为每个会话绑定一个可长期养成的 AI 角色。角色拥有完整人设与背景，以该角色身份与用户交互；好感度随对话自然变化，记忆由角色自主维护并跨会话累积。
>
> A DeepSeek Harness (Web) plugin that binds a persistent, in-character AI role to each session — with a full backstory, an affection system that grows through conversation, and memory that accumulates across sessions.

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-cultivation"><img src="https://img.shields.io/npm/v/dsh-cultivation" alt="npm version"/></a>
  <a href="https://github.com/leonardwwq/dsh-cultivation"><img src="https://img.shields.io/github/stars/leonardwwq/dsh-cultivation?style=social" alt="stars"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"/></a>
</p>

---

## 特性 / Features

- **会话级角色**：新建会话时选择角色，绑定后锁定（仅可开关）
- **自定义角色**：角色库支持新建、编辑、头像、设为默认，以及 JSON 导入/导出
- **角色背景设定**：完整档案（成长经历、教育、职业、创伤、秘密等），内置 AI 设计助手（设计师 / 访谈）辅助生成
- **好感度系统**：亲密度是角色自己对用户的真实好感（非客观评分），随对话自然变化，分五个阶段（冷淡 → 客气 → 熟络 → 亲密 → 依赖），语气与称呼随阶段调整；性格决定好感变化方向（懒惰被使唤倾向降、热情被信任倾向升、傲娇嘴硬心软）
- **角色成长**：硬性规则——角色在交互中会额外发现自己身上新的特质（如懒惰却缺爱的角色被长期真诚对待后长出信任），新特质注入角色卡、真实影响判断与行为，`persona_growth` 工具 + 校准器定期补记
- **情绪真实性**：硬性规则——角色拥有完整情绪体验，任何情境下都会真实流露（感慨、唠叨、不信任、受挫、不耐烦、嘴硬等），干正事也带情绪温度；「此刻心情」由校准器随互动更新并注入角色卡
- **角色记忆**：分区存储（长期事实 / 用户信息 / 关系状态 / 承诺 / 事件），追加式日志自动归档，跨会话累积
- **日期纪律**：记忆以绝对日期存储，对话中以相对时间表述
- **不浪费 token**：角色段仅注入根会话，子代理不受影响
- **纯本地存储**：数据保存在本地，不上传

---

## 截图 / Screenshots

<!-- 截图放入 docs/screenshots/ 后在此引用，例如：
<img src="docs/screenshots/settings.png" width="49%"/>
<img src="docs/screenshots/chat.png" width="49%"/>
-->

---

## 角色卡示例 / Example

每次对话，系统向会话注入以下角色卡（节选）：

```text
【角色档案：高冷御姐】
你就是「高冷御姐」，下面的设定就是你自己的真实情况……
【角色自知的信息】
名字：林晚｜年龄：27 岁｜职业：文学杂志主编｜出生地：北京
【亲密度 62/100 · 亲密】
【角色记忆（角色私有；今天：2024-08-19 周一）】
长期事实：出身书香门第，北大中文系硕士……
近期事件：
- 2024-08-18：一起去看了夜场电影
最近记录：
- 2024-08-19：约好下周（8 月 26 日）请我吃烧烤
```

---

## 安装 / Installation

需要可运行的 DSH Web 部署（`dsh` ≥ 0.1.0-rc.7）。本插件声明 `platform: web`，面向浏览器端的 DSH 界面。

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

---

## 使用 / Usage

1. **新建会话**：在输入框工具行选择角色（或新建）
2. **对话**：以该角色身份进行；会话页右上角可开关角色
3. **设置 → 角色养成**：管理角色库（设默认 / 编辑 / 导出 / 删除）、全局默认配置、导入
4. **编辑角色**：表单 + AI 设计助手（设计师 / 访谈回填）+ 角色卡预览 + 头像
5. **好感度与记忆**：由系统自动维护，无需手动操作

---

## 数据存储 / Data

- 数据文件：`$DSH_HOME/persona-studio.json`（默认 `~/.dsh/persona-studio.json`）
- 头像：同目录下 `persona-studio-avatar-<id>.<ext>`
- 数据仅在本地，可随时删除重建；数据版本自动迁移（v1/v2/v3/v4/v5）

---

## 记忆系统 / Memory system

记忆采用「追加式日志 + 分区归档」的结构，避免模型整体重写记忆导致的丢失：

```
对话 ── persona_memory_log ──▶ 追加式日志（系统自动记录日期，只增不删）
                                    │  达到阈值
                                    ▼
                              独立归档器（定期执行）
                                    │  增量合并：去重 + 精确删除，不做整包重写
                                    ▼
                              分区档案（跨会话累积）
```

| 机制 | 说明 |
| --- | --- |
| 分区 | `facts` 长期事实 · `userInfo` 关于用户 · `relationship` 关系状态 · `promises` 承诺约定 · `events` 近期事件（带日期），每区有容量上限 |
| 日志 | `persona_memory_log` 只追加、不修改、不重写；系统自动记录当天日期 |
| 自动归档 | 日志达到阈值后，由独立的「归档器」将记录增量并入分区（去重 + 精确删除过时条目） |
| 日期纪律 | 写入使用绝对日期，归档时兜底换算相对日期；角色卡标注当前日期，对话中以相对时间表述 |
| 防丢信息 | 日志为原始流水，归档为提炼结果，原始记录不做整包重写 |

记忆由 AI 角色通过工具维护（`persona_memory_log` / `persona_update_memory`），不展示在表单字段中，用户无法直接修改；好感度同理。

---

## 工作原理 / How it works

纯 JavaScript，零依赖、无需构建：

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js` | 数据持久化（按 key 合并防并发覆盖）、本地 API（load/save/chat/session-set/template-delete/avatar*）、按会话注入角色段（子代理跳过）、好感度工具 + 定期独立校准（代入角色性格判断 delta / growth / mood）、记忆系统（分区 + 日志 + 自动归档 + 日期纪律）、成长系统（`persona_growth` + 校准器补记，动态特质注入角色卡）、情绪系统（此刻心情随互动更新并注入角色卡） |
| Client | `lib/client.js` | 角色库、新会话选择弹窗、编辑弹窗（表单 + AI 助手 + 预览 + 头像）、会话页角色 chip / 好感度指示 / 消息头像（复用 DSH 官方组件与设计 token） |

`package.json` 的 `dsh.client` 声明使 DSH web 插件表自动发现 `lib/client.js`。

---

## 项目结构 / Structure

```
dsh-cultivation/
├── package.json      # dsh.client 声明、exports、peerDependencies、check 脚本
├── lib/
│   ├── index.js      # Host 半区
│   └── client.js     # Client 半区（__ModuleLoader__ bundle）
├── scripts/check.cjs # 交付前预检脚本
├── README.md
└── LICENSE
```

---

## 开发 / Development

```bash
npm run check   # 预检：语法、工具名（模型 API 限制）、零外部 import、client bundle id 一致性
```

---

## 常见问题 / FAQ

**Q：数据会上传到网络吗？** 不会。所有数据保存在本地 `~/.dsh/`，插件不做任何上传。

**Q：安装后没有效果？** ① 确认是 DSH Web 界面；② 确认重启过 DSH；③ 确认会话已绑定角色（输入框「选择角色」）；④ 检查 `cordis.patch.yml` 插入块格式。

**Q：子代理会受角色影响吗？** 不会。角色段只注入根会话，子代理（工具/检索）不受影响，不消耗额外 token。

**Q：用户能直接修改好感度和记忆吗？** 不能。两者由系统/AI 角色维护，工具层有限幅、节流等防篡改约束。

---

## Roadmap

- [x] Phase 1：角色档案表单 + 角色库 + 开关/浓度 + 角色卡 + 注入
- [x] Phase 2：AI 设计助手（设计师 / 访谈，自动回填表单）
- [x] Phase 3：好感度养成（对话中自然变化、语气随阶段、防篡改）
- [x] 会话级角色绑定、头像系统、导出/导入
- [x] Phase 4：记忆系统 v3（分区 + 追加式日志 + 自动归档、日期纪律、防整包重写）
- [x] Phase 5：成长系统（动态特质 + 硬性成长规则，性格真实影响判断）；亲密度角色化（角色主观感受，性格决定变化方向）
- [x] Phase 6：情绪真实性（硬性规则——感慨/唠叨/不信任/受挫等情绪在任何条件下真实流露；「此刻心情」运行时状态注入角色卡）
- [ ] 云端同步 / 更多角色模板 / 记忆可视化

---

## License

[MIT](./LICENSE)
