# Agent 项目 README 调研与 Prism 改版 — 2026-11-15

本次直接读取 GitHub 仓库元数据和默认分支 README，选择八个超过 1,000 Stars 的 Agent／Agent 工作台项目。Stars 为当日 GitHub 公共 REST API 采样，会随时间变化。比较的是信息设计，不将 Star 数量当成文案效果的因果证明。

## 样本与具体借鉴

| 项目与 README | Stars | 当前状态 | 观察到的写法 | Prism 的对应处理 |
| --- | ---: | --- | --- | --- |
| [Browser Use](https://github.com/browser-use/browser-use#readme) | 121,078 | 活跃 | 品牌区、简短定位和任务演示靠前；不同使用入口分别说明 | 首屏说明 Agent + What-if，先展示实际画布，再给启动入口 |
| [GPT Researcher](https://github.com/assafelovic/gpt-researcher#readme) | 30,700 | 活跃 | 先解释研究用途与痛点，提供 Demo，再展开能力和安装方式 | 直接说明需求变化时如何沿用证据，展示可操作的变化与来源 |
| [Sim](https://github.com/simstudioai/sim#readme) | 30,139 | 活跃 | 一句话说明工作台用途，快速开始靠前；功能结合界面呈现 | 用短文案、真实截图与录屏展示能力，先让新用户完成第一次体验 |
| [OpenHands / Agent Canvas](https://github.com/OpenHands/OpenHands#readme) | 93,500 | 活跃 | 清楚定义产品，预览、功能价值、不同安装路径与文档入口分开组织 | 用户体验入口与开发、运行环境信息分开；细节进入配套指南 |
| [Dify](https://github.com/langgenius/dify#readme) | 161,187 | 活跃 | 语言切换、产品定位、快速启动和核心功能组织清晰 | 中英文结构对齐，集中给出能力与文档索引 |
| [Vane，原 Perplexica](https://github.com/ItzCrazyKns/Vane#readme) | 38,213 | 活跃 | 用首图和简明功能展示搜索体验，将架构放到单独文档 | 用自己的截图和来源能力说明产品，避免首页展开大量内部实现 |
| [Open Deep Research](https://github.com/langchain-ai/open_deep_research#readme) | 12,677 | 已归档 | 以具体配置、评测方法与结果支持研究能力描述 | 保留独立真实验证入口，区分受控回归、真实任务和有限样本 |
| [Flowise](https://github.com/FlowiseAI/Flowise#readme) | 55,572 | 已归档 | 简短视觉定位，快速启动、Docker、开发、配置、文档分别归类 | 使用分层说明，让首次体验与开发者说明各有入口 |

Flowise 和 Open Deep Research 的归档状态来自当日仓库元数据与仓库页面，不能当作当前活跃维护的推荐项目。Vane 和 OpenHands 使用当前仓库名与 README 内容，没有沿用历史介绍。

上述项目包含浏览器 Agent、研究 Agent 和可视化 Agent 工作台。Prism 借鉴不同类别的展示方式，保持自己的产品定位：**把研究、证据、条件推演和判断记录连接起来。**

## 信息层级的调整

新 README 使用以下顺序：

1. 品牌、一句话定位、语言与导航入口。
2. 实际画布首图，简短解释用户能解决的问题。
3. 两条启动命令，区分虚构演示与连接真实研究。
4. 五个具体能力：继续研究、条件推演、来源查看、条件自适配、判断记忆。
5. 实际操作动图，展示一条条件改变时的定向变化。
6. 可尝试的问题与有边界的真实验证结果。
7. 工作原理摘要、文档、开发与当前状态。

首次阅读不需要先理解内部模块、所有配置变量或历史审计过程。完整配置、排障、使用细节和工程验证仍保留，分别放入 [SETUP](../SETUP.md)、[WORKSPACE](../WORKSPACE.md)、[DEVELOPMENT](../DEVELOPMENT.md)。

## 素材与可复核性

原首图中的商品照片未加载完成。本次重新捕获 Prism 实际页面，在全部主图加载后再截图；新的 GIF 来自实际浏览器录屏。

- 使用六条有来源的公开房源采集记录，未生成房源照片。
- 三条展示分支为人工设置的假设，分别显示 4、3、1 个匹配结果；README 明确标注，没有将其称为额外检索结果或完全由 Agent 自动设计的分支。
- 录屏中预算从 2,500 → 2,000 → 3,000 元，匹配记录从 4 → 1 → 5 个变化；实际校验了数量、基线保留和原图加载。
- 没有下载或搬用参考项目的 Logo、演示截图、营销指标或产品文案。
- 没有添加虚构的用户数、Star 数、基准成绩、远程 CI 成功徽章、在线 Demo 或 npm 发布入口。
- 仓库当前没有配置 Git remote，因此启动说明采用下载／克隆当前仓库后在目录运行，不杜撰项目地址。

元数据、原始 README 阅读快照、素材录制与检查结果保存在被 Git 忽略的 `work/readme-research-2026-11-15/`。这份调研记录与中英文 README 是独立文档，产品首页无需携带竞争项目对比表。
