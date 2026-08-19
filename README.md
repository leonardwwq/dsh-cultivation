# @persona-studio/dsh — 角色养成

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：为 Agent 建立**会话级角色**，让 AI 在对话中稳定、自然地扮演某个角色——角色只影响"怎么说"（语气、态度、口癖），不影响"做不做"（该干活照干）。

> 性别、身高体重、生平经历、教育、情感创伤、兴趣爱好、成长史、说话风格、口头禅、语气温度、对你的称呼与态度…… 拆成碎控件逐项配置，可切"基础 / 丰富"两种粒度。

## 功能特性

- **会话级角色**：新建会话时选择一个角色（小弹窗里看信息、可新增）；开始对话后锁定，只能开关
- **角色库**：多套角色增删改、头像上传、设为默认、导出/导入 JSON 分享
- **全局默认配置**：默认角色 + 新会话默认启用 + 角色浓度（0-100% 真分级）
- **AI 设计助手**：角色设计师（按需求设计并回填表单）+ 角色访谈（编故事聊设定、自动回填）
- **角色扮演注入**：入戏提示词（绝不破功、口语化、可拒绝吐槽、做正事保持角色口吻）
- **亲密度养成**：随对话自然变化（模型自调 + 定期校准），五阶段语气（冷淡/客气/熟络/亲密/依赖），会话页爱心指示器
- **角色记忆**：模型自主补充符合人设的设定，写入角色私有记忆，跨会话累积
- **不浪费 token**：子代理（subagent）不会被注入角色段
- **纯本地**：数据只存本地文件，无任何上传

## 安装

需要一套可运行的 DSH 部署（`dsh` ≥ 0.1.0-rc.7）。两步：

**1. 把插件装进 dsh profile 的依赖**（使其可被 loader 解析）。以 `pnpm` 为例，在 profile 目录执行：

```bash
cd "$DSH_HOME/profiles/web"        # profile 根目录（含 package.json 与 cordis.patch.yml）
pnpm add @persona-studio/dsh
# 或本地开发用符号链接：
# ln -s "$PWD" node_modules/@persona-studio/dsh
```

**2. 在 profile 的 `cordis.patch.yml` 里加一行插入块**：

```yaml
- insert:
    - id: persona-studio
      name: '@persona-studio/dsh'
```

重启 DSH 后，任何会话的「设置 → 角色养成」都会出现本插件。

## 使用

1. **新建会话**：输入框工具行出现「选择角色」入口 → 弹窗选一个角色（或新建）
2. **开始对话**：角色以该角色回应；右上角显示角色 chip（点开可开关）
3. **设置 → 角色养成**：角色库管理（点卡片设默认 / 悬停编辑·导出·删除）、全局默认配置、导入角色
4. **编辑角色**：表单 + AI 设计助手（设计师/访谈）实时回填 + 角色卡预览 + 头像
5. **亲密度**：随对话自然变化，❤️ 显示在会话页右上角

## 数据存储

数据保存在 `$DSH_HOME/persona-studio.json`（默认 `~/.dsh/persona-studio.json`），头像以文件存在同目录，纯本地。

## 工作原理

本插件由两个半区组成，都是纯 JavaScript，**无需构建**：

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js` | 数据持久化（按 key 合并防并发覆盖）、本地 API（load/save/chat/session-set/template-delete/avatar*）、`systemPrompt.section` 按会话注入角色段（子代理跳过）、亲密度工具 + 定期校准、角色记忆工具 |
| Client | `lib/client.js` | 设置页角色库、新会话选择弹窗、编辑弹窗（表单 + AI 助手 + 预览 + 头像）、会话页角色 chip / 亲密度爱心 / 消息头像（复用 DSH 官方 `Button`/`Input`/`Modal` 组件与设计 token） |

`package.json` 里的 `dsh.client` 声明让 DSH 的 web 插件表自动发现并加载 `lib/client.js`。开发/交付前跑 `npm run check` 做预检（语法、工具名、零外部 import、bundle id 一致性）。

## 项目结构

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

## Roadmap

- [x] Phase 1：角色档案表单 + 角色库 + 开关/浓度 + 角色卡 + 注入
- [x] Phase 2：AI 设计助手（角色设计师 / 角色访谈，自动回填表单）
- [x] Phase 3：亲密度养成（对话中自然变化、语气随阶段、防用户篡改）
- [x] 会话级角色绑定、头像系统、角色记忆、导出/导入

## License

[MIT](./LICENSE)
