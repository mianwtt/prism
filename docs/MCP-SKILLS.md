# MCP 与按任务加载的 Skills

Prism 生产 provider 现在默认通过官方 TypeScript MCP SDK 接入公开资料工具；四类角色通过受信目录中的 Agent Skills 获得任务指导。原有字段证据规则、角色能力白名单、检查点与 What-if 计算继续生效。

```mermaid
flowchart LR
  Q[用户需求与角色任务] --> S[Skill 元数据发现与任务路由]
  S --> A[LangGraph 角色子图：加载选中正文]
  A --> P[角色能力白名单]
  P --> C[MCP Client：初始化 / tools/list / tools/call]
  C --> M[MCP Server：参数与结果协议]
  M --> T[tofu / Tavily、公开目录、详情与图片读取]
  T --> V[原文与字段证据校验]
  V --> D[确定性条件推演与模型取舍分析]
```

## 工具如何封装

业务逻辑仍在原有 provider 与公开页面读取器中；`src/mcp-research.mjs` 使用 `@modelcontextprotocol/sdk` 注册工具、生成参数 Schema 并返回结构化结果。应用内 Client 使用 SDK 的 memory transport 完成真实的初始化、工具发现与调用，不只是把原函数改名。

| MCP 工具 | 参数 | 返回的业务值 |
| --- | --- | --- |
| `search_public_sources` | 查询、可选 fresh | 搜索结果、原采集时间与缓存标记 |
| `read_public_source` | 来源 URL | 保存原文及页面附属信息 |
| `search_public_catalog` | 平台、关键词或城市及已有筛选参数 | 实际观察到的目录与链接 |
| `read_merchant_offer` | 商家详情 URL | 原有标价与配置读取结果；仅在 provider 支持时注册 |
| `read_source_images` | 最多六个来源 URL | 原页图片；仅在 provider 支持时注册 |

模型调用、任意文件读取、订单操作和决策修改没有注册为 MCP 工具。白名单仍限制角色能用哪些应用接口；工具标注的 read-only 是能力描述，不能单靠标注替代权限校验。搜索与读页原有的安全、缓存及事实规则继续由业务组件执行。

生产 provider 默认使用 `mcp-in-memory`，每次工具调用结束关闭本地 session，不额外监听网络端口。`PRISM_TOOL_TRANSPORT=direct` 是显式调试回退，MCP 失败不会偷偷降为 direct；注入的测试 provider 可以保留原接口，并在运行记录中标为 injected-adapter。

另提供外部标准客户端入口：

```text
node --env-file-if-exists=.env src/mcp-server.mjs
```

该入口只通过 stdio 提供工具，stdout 由 JSON-RPC 使用。它复用同一业务工具注册，外部调用仍需要操作者在服务端配置检索 provider。工具会读取公开网站，不保证某个平台永远可匿名访问。

## Skills 如何参与执行

技能包在 `src/skills/<name>/SKILL.md`，使用 Agent Skills 的 name/description frontmatter 与 Markdown 正文。`src/skills.mjs` 先发现名称、描述与内容指纹；角色接到任务后，只加载路由命中的正文。当前路由由角色与明确的任务关键词决定，**不是额外调用模型进行 Skill 选择**。

| Skill | 激活条件 |
| --- | --- |
| `decision-planning` | 协调角色的比较契约规划 |
| `offer-research` | 研究角色，明确的商品选购任务 |
| `rental-research` | 研究角色，明确的租房任务 |
| `evidence-review` | 独立证据审查角色 |
| `decision-analysis` | 当前分支简版取舍分析 |

Skills 正文在模型调用时注入 system context，运行元数据保存技能名与 SHA-256，原始正文不重复保存到 usage 中。未匹配领域的通用研究可以不加载领域技能。

加载器检查名称、目录范围、文件大小、元数据、符号链接与发现后内容变化。只加载随项目维护的受信文件，不安装用户上传的指令包，不执行技能附带脚本。技能文字不能新增工具权限、跳过审查或改变用户约束。

## 验证范围

`tests/mcp-skills.test.mjs` 验证 SDK 工具发现、真实调用、时间与筛选参数保留、非法参数前置拒绝、工具失败传播、角色任务选择、技能正文注入与指纹，以及外部 stdio Client 连接。离线测试里的搜索与页面读取使用受控业务函数，不代表本轮重新完成真实网站研究质量评测。

核心代码：`src/mcp-research.mjs`、`src/mcp-server.mjs`、`src/skills.mjs`、`src/agents/specialist.mjs`、`src/research-providers.mjs`。

本轮验证：**307 项单元／HTTP 测试、71 项 Microsoft Edge 浏览器测试通过**；8 个新增用例覆盖 MCP、Skills 及完整四角色的协议调用链。JavaScript 语法与项目文件检查通过，npm 依赖审计未发现漏洞。本轮使用受控研究数据，不重新宣称真实搜索成功率或模型效果提升。
