# dsh-cultivation — 角色养成 (Character Cultivation)

> A DeepSeek Harness (DSH) plugin that gives each session a persistent, in-character AI role — personalities that talk like real people, still get work done, grow closer (or colder) over time, and remember what they add to themselves.
>
> 一个 DeepSeek Harness 插件：为每个会话绑定一个可长期养成的 AI 角色——角色扮演 + 情感陪伴，入戏且自然，该干活照干，亲密度随对话成长，角色还会自己补充并记住设定。

---

## 功能特性 / Features

- **会话级角色 / Session-bound roles**：新建会话选一个角色，开始对话后锁定（只能开关）
- **角色库 / Role library**：增删改、头像、设为默认、导出/导入 JSON
- **全局默认配置 / Global defaults**：默认角色 + 新会话默认启用 + 角色浓度（真分级 0-100%）
- **AI 设计助手 / AI design assistant**：角色设计师 / 角色访谈，自动回填表单
- **入戏扮演 / In-character roleplay**：绝不破功、口语化、可拒绝吐槽、做正事保持角色口吻
- **亲密度养成 / Intimacy growth**：随对话自然变化（自调 + 定期校准），五阶段语气 + 会话页爱心
- **角色记忆 / Role memory**：模型自主补充符合人设的设定，跨会话累积
- **不浪费 token / No token waste**：子代理不会被注入角色段
- **纯本地 / Local-only**：数据只存本地，不上传

---

## 安装 / Installation

需要可运行的 DSH 部署（`dsh` ≥ 0.1.0-rc.7）。

**1. 装进 dsh profile 的依赖**（`pnpm` 示例，在 profile 目录）：

```bash
cd "$DSH_HOME/profiles/web"
pnpm add dsh-cultivation
# 本地开发可用符号链接：ln -s "$PWD" node_modules/dsh-cultivation
```

**2. 在 `cordis.patch.yml` 加插入块**：

```yaml
- insert:
    - id: persona-studio
      name: 'dsh-cultivation'
```

重启 DSH 后，「设置 → 角色养成」出现本插件。

---

## 使用 / Usage

1. **新建会话**：输入框工具行「选择角色」→ 弹窗选一个（或新建）
2. **对话**：角色以该角色回应；右上角角色 chip（点开可开关）
3. **设置 → 角色养成**：角色库管理（点卡片设默认 / 悬停编辑·导出·删除）、全局默认、导入
4. **编辑角色**：表单 + AI 设计助手（设计师/访谈回填）+ 角色卡预览 + 头像
5. **亲密度**：随对话自然变化，❤️ 显示在会话页右上角

---

## 数据存储 / Data

- 数据：`$DSH_HOME/persona-studio.json`（默认 `~/.dsh/persona-studio.json`）
- 头像：同目录下的 `persona-studio-avatar-<id>.<ext>` 文件
- 全部本地，可随时删除重建

---

## 工作原理 / How it works

纯 JavaScript，**无需构建**：

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js` | 数据持久化（按 key 合并防并发覆盖）、本地 API（load/save/chat/session-set/template-delete/avatar*）、按会话注入角色段（子代理跳过）、亲密度工具 + 定期校准、角色记忆工具 |
| Client | `lib/client.js` | 角色库、新会话选择弹窗、编辑弹窗（表单 + AI 助手 + 预览 + 头像）、会话页角色 chip / 亲密度爱心 / 消息头像（复用 DSH 官方组件与设计 token） |

`package.json` 的 `dsh.client` 声明让 DSH web 插件表自动发现 `lib/client.js`。交付前跑 `npm run check` 预检（语法、工具名、零外部 import、bundle id 一致性）。

---

## 项目结构 / Structure

```
persona-studio/
├── package.json      # dsh.client 声明、exports、peerDependencies、check 脚本
├── lib/
│   ├── index.js      # Host 半区
│   └── client.js     # Client 半区（__ModuleLoader__ bundle）
├── scripts/check.cjs # 预检脚本
├── README.md
└── LICENSE
```

---

## Roadmap

- [x] Phase 1：角色档案表单 + 角色库 + 开关/浓度 + 角色卡 + 注入
- [x] Phase 2：AI 设计助手（设计师 / 访谈，自动回填表单）
- [x] Phase 3：亲密度养成（对话中自然变化、语气随阶段、防用户篡改）
- [x] 会话级角色绑定、头像系统、角色记忆、导出/导入

## License

[MIT](./LICENSE)
