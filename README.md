# @persona-studio/dsh — 人格工坊

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：为 Agent 设计一套**人格档案**，并把它注入系统提示，让 AI 在对话中稳定地扮演某个角色。

> 性别、身高体重、生平经历、教育、情感创伤、兴趣爱好、成长史、说话风格、口头禅、语气温度、对你的称呼与态度…… 拆成碎控件逐项配置，也可以切"基础 / 丰富"两种粒度。

## 功能特性

- **人格档案**：基础 + 丰富双模式表单（性别切换、年龄/身高/体重/语气/态度滑块、标签 chips、文本域）
- **模板系统**：多套人格模板切换、新建、编辑、删除，自带三个示例人设
- **人格卡**：实时预览 + 一键复制为文本
- **开关与浓度**：`启用人格` 开关 + `人格浓度` 滑块（0–100%）
- **注入系统提示**：人格卡以结构化文本注入当前会话的 system prompt
- **不浪费 token**：子代理（subagent）不会被注入人格段
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

重启 DSH 后，任何会话的「设置 → Agent 人格」都会出现本插件。

## 使用

1. 打开左下角「设置」
2. 进入「**Agent 人格**」标签页
3. 顶部开关控制是否启用、人格浓度、亲密度爱心显示
4. 下方是模板卡片：**点击卡片切换当前人格**，移入卡片可见「编辑 / 删除」
5. 点「＋ 新建人格」或卡片上的「编辑」打开配置弹窗，逐项填写
6. 右侧实时预览「人格卡」，点「复制」可直接拿到文本

配置自动保存；关闭弹窗后直接跟 AI 对话，它就会以当前人格回应。

## 数据存储

数据保存在 `$DSH_HOME/persona-studio.json`（默认 `~/.dsh/persona-studio.json`），纯本地 JSON，可随时删除重建。

## 工作原理

本插件由两个半区组成，都是纯 JavaScript，**无需构建**：

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js` | 数据持久化、本地 API（`/persona-studio/api/load|save`）、`systemPrompt.section` 注入人格段（仅主会话，子代理跳过） |
| Client | `lib/client.js` | 设置页模板卡片 + 编辑弹窗（复用 DSH 官方 `Button`/`Input`/`Modal` 组件与设计 token），通过 `fetch` 调本地 API |

`package.json` 里的 `dsh.client` 声明让 DSH 的 web 插件表自动发现并加载 `lib/client.js`。

## 项目结构

```
persona-studio/
├── package.json      # dsh.client 声明、exports、peerDependencies
├── lib/
│   ├── index.js      # Host 半区
│   └── client.js     # Client 半区（__ModuleLoader__ bundle）
├── README.md
└── LICENSE
```

## Roadmap

- [x] Phase 1：人格档案表单 + 模板 + 开关/浓度 + 人格卡 + 注入
- [ ] Phase 2：右侧 AI 聊天（人格设计师 / 角色访谈，AI 直接改字段）
- [ ] Phase 3：亲密度养成（对话中自然变化、语气随阶段变化、防用户篡改）

## License

[MIT](./LICENSE)
