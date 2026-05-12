# 招聘端调试工具

> **定位**：用于在沟通页手动调试简历相关操作（在线简历、附件简历、下载 PDF 等），以及 LLM 简历筛选（Rubric 评估、Rubric 生成）。与正式运行的 `bossChatPageMain` 使用完全一致的技术栈（Puppeteer + ghost-cursor + Canvas hook）。
> 最后更新：2026-03-18

---

## 1. 概述

招聘端调试工具是一套**独立于自动化主流程**的调试环境，可单独启动浏览器到 BOSS 沟通页，然后通过 GUI 按钮逐条执行调试命令，验证：

- 在线简历的打开、关闭、Canvas hook 提取
- 附件简历的请求、同意、预览与下载
- 各类弹窗的关闭（意向沟通、在线简历等）

**与正式运行的一致性**：所有页面操作均通过 `createHumanCursor`（ghost-cursor）拟人轨迹点击，与 `chat-page-processor.mjs` / `chat-page-resume.mjs` 的实现完全一致，便于在无自动化干扰下排查 DOM 选择器、时序问题。

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer: BossDebugTool/index.vue                                   │
│  - 启动浏览器 / 关闭浏览器 按钮                                       │
│  - Tab A「简历操作」：9 个调试命令按钮（获取姓名、在线简历、附件简历等）  │
│  - Tab B「LLM 筛选」：提取简历文本 / 运行 Rubric / 生成 Rubric 按钮    │
│  - 统一操作日志区域                                                    │
└─────────────────────────────────────────────────────────────────────┘
         │ IPC: open-boss-chat-debug / boss-debug-command / close-boss-chat-debug
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Main: ipc/index.ts                                                  │
│  - 管理 bossChatDebugProcess（子进程）                                │
│  - 通过 stdio fd3/fd4 与 worker 通信（JSON 行协议）                     │
└─────────────────────────────────────────────────────────────────────┘
         │ spawn(..., --mode=bossChatDebugMain, stdio[3,4]=pipe)
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Worker: flow/BOSS_CHAT_DEBUG_MAIN/index.ts                           │
│  - Electron 子进程（app.dock?.hide()）                                │
│  - initPuppeteer + launch 非无头浏览器                                │
│  - 注入 Cookie + localStorage，打开 BOSS_CHAT_PAGE_URL                │
│  - 监听 fd3 读取命令，执行后通过 fd4 写回响应                          │
└─────────────────────────────────────────────────────────────────────┘
```

**进程路由**：`src/main/index.ts` 根据 `--mode=bossChatDebugMain` 加载 `flow/BOSS_CHAT_DEBUG_MAIN/index.ts`，调用 `waitForProcessHandShakeAndRunDebug()`。

---

## 3. 通信协议

### 3.1 进程间 stdio

主进程 spawn 时 `stdio: ['inherit','inherit','inherit','pipe','pipe']`：

| fd | 方向 | 用途 |
|----|------|------|
| fd3 | 主进程 → 子进程 | 主进程写入命令 |
| fd4 | 子进程 → 主进程 | 子进程写入 READY/响应 |

每条消息为 **一行 JSON**，以 `\n` 结尾。

### 3.2 命令格式（主 → 子）

```json
{ "type": "ping", "id": "abc123" }
{ "type": "open-online-resume", "id": "xyz789" }
```

- `type`（必填）：命令类型
- `id`（必填）：由主进程生成，用于匹配响应

### 3.3 响应格式（子 → 主）

**就绪通知**（子进程启动完成后发一次）：

```json
{ "type": "READY", "ok": true }
{ "type": "READY", "ok": false, "error": "NO_BROWSER" }
```

**命令响应**：

```json
{ "id": "abc123", "ok": true, "result": { "name": "张三" } }
{ "id": "xyz789", "ok": false, "error": "未找到在线简历按钮" }
```

### 3.4 命令超时

主进程发命令后，若 30 秒内未收到响应，视为超时，返回 `{ ok: false, error: 'timeout' }`。

---

## 4. 支持的调试命令

### 4.1 Tab A — 简历操作命令

| type | 说明 | 成功时 result |
|------|------|---------------|
| `ping` | 探活 | `'pong'` |
| `get-panel-name` | 获取右侧面板当前候选人姓名 | `{ name: string }` |
| `dismiss-intent-dialog` | 关闭「意向沟通」弹窗 | `{ found: boolean }` |
| `close-online-resume` | 关闭在线简历弹窗 | `{ found: boolean }` |
| `open-online-resume` | 打开当前会话的在线简历 | `{ opened: boolean }` |
| `check-attach-resume` | 检查当前会话是否有「点击预览附件简历」按钮 | `{ hasAttachment: boolean }` |
| `request-attach-resume` | 请求附件简历（点击按钮 + 确认弹窗） | `{ requested: boolean, ... }` |
| `download-attach-resume` | 预览并下载当前会话已有的附件简历 | `{ clickedDownload: boolean, ... }` |
| `accept-incoming-attach-resume` | 同意对方发来的附件简历请求（仅当出现「是否同意」弹窗时） | `{ found: boolean, accepted: boolean }` |

**附件简历流程说明**（与 `plan/chat_page_resume_flow.md` 一致）：

- **看在线简历**：`open-online-resume`，无需对方同意，点开即可。
- **下载 PDF**：需先 `request-attach-resume` → 对方同意 → PDF 作为新消息出现在聊天里 → `download-attach-resume`。
- **同意请求**：若对方先发起附件简历请求，会出现「对方想发送附件简历给您，您是否同意」弹窗，用 `accept-incoming-attach-resume` 同意。

### 4.2 Tab B — LLM 筛选命令

| type | 说明 | payload | 成功时 result |
|------|------|---------|---------------|
| `extract-resume-text` | 打开当前会话的在线简历并用 Canvas hook 提取纯文本 | 无 | `{ resumeText: string, charCount: number }` |
| `llm-screen-resume` | 对指定简历文本运行 Rubric 评估（使用当前职位的 `resumeLlmConfig`） | `{ resumeText: string, jobId?: string }` | `{ isPassed: boolean, totalScore: number, reason: string, rawResponse: string }` |
| `llm-generate-rubric` | 根据 JD 文本生成 Rubric 结构（不依赖浏览器，仅调 LLM API） | `{ sourceJd: string }` | `{ rubric: { knockouts: string[], dimensions: [...] } }` |

**命令使用说明：**

- `extract-resume-text`：在子进程（Worker）侧执行，需要浏览器已就绪且已手动选中一条会话。内部调用 `openOnlineResume` + Canvas hook 提取文本，提取完后**关闭简历弹窗**，将文本返回给主进程。
- `llm-screen-resume`：在**主进程**侧执行（不经过子进程），直接调用 `evaluateResumeByRubric`。`jobId` 用于从 `boss-jobs-config.json` 载入对应的 `resumeLlmConfig`；若不传 `jobId`，则 UI 侧提供手动填写 Rubric JSON 的区域，将其序列化为 payload 传入。
- `llm-generate-rubric`：同样在**主进程**侧执行，调用 `generateRubricFromJd`，读取 `boss-llm.json` 中 `rubric_generation` 用途的模型（未配置时会回退到默认/第一个启用模型）。

---

## 5. 文件与入口

| 路径 | 说明 |
|------|------|
| `packages/ui/src/main/flow/BOSS_CHAT_DEBUG_MAIN/index.ts` | Worker 入口，启动浏览器并监听 stdio 命令 |
| `packages/ui/src/renderer/src/page/MainLayout/BossDebugTool/index.vue` | GUI 页面（含 Tab A 简历操作、Tab B LLM 筛选） |
| `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts` | IPC 处理器：`open-boss-chat-debug`、`boss-debug-command`、`close-boss-chat-debug` |
| `packages/ui/src/renderer/src/router/index.ts` | 路由 `BossDebugTool` |
| `packages/ui/src/renderer/src/page/MainLayout/LeftNavBar/RecruiterPart.vue` | 左侧导航「招聘端调试工具」入口 |

**依赖的核心包**（与 `bossChatPageMain` 相同）：

- `@geekgeekrun/boss-auto-browse-and-chat/index.mjs`：`initPuppeteer`
- `@geekgeekrun/boss-auto-browse-and-chat/chat-page-resume.mjs`：`openOnlineResume`、`requestAttachmentResume`、`acceptIncomingAttachResume`、`openPreviewAndDownloadPdf` 等
- `@geekgeekrun/boss-auto-browse-and-chat/resume-extractor.mjs`：`setupCanvasTextHook`
- `@geekgeekrun/boss-auto-browse-and-chat/constant.mjs`：选择器常量
- `@geekgeekrun/boss-auto-browse-and-chat/humanMouse.mjs`：`createHumanCursor`
- `@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs`：`readStorageFile`、`ensureStorageFileExist`
- `@geekgeekrun/boss-auto-browse-and-chat/llm-rubric.mjs`：`evaluateResumeByRubric`、`generateRubricFromJd`（Tab B LLM 命令，**主进程侧调用**）

**存储**：与正式流程共用 `~/.geekgeekrun/storage/boss-cookies.json`、`boss-local-storage.json`。

---

## 6. 使用流程

### 6.1 Tab A — 简历操作

1. 打开设置窗口 → 左侧导航选择「招聘端调试工具」
2. 点击「启动浏览器」→ 主进程 spawn `bossChatDebugMain` 子进程，子进程启动 Puppeteer、注入 Cookie/localStorage、打开沟通页、发 READY
3. 在 BOSS 沟通页**手动选择一条会话**（左侧会话列表点击，右侧展示该候选人）
4. 点击调试按钮执行命令，如「打开在线简历」「检查附件简历」等
5. 查看操作日志和命令返回值
6. 测试完成后点击「关闭浏览器」，主进程 kill 子进程

**注意事项**：

- 启动前需已配置浏览器路径（与推荐页/沟通页一致，若未配置会弹窗引导）
- 子进程退出（用户关闭浏览器）时，主进程会发送 `boss-chat-debug-exited` 到 Renderer，GUI 自动将状态置为「未就绪」

### 6.2 Tab B — LLM 筛选调试

Tab B 分为三个子功能区域：

**区域 1：提取简历文本**

> 依赖浏览器已就绪，且已在 BOSS 沟通页手动选中一条会话。

1. 确认浏览器已就绪，沟通页已选中目标会话
2. 点击「📄 提取当前简历文本」
3. 主进程发送 `extract-resume-text` 命令到子进程，子进程打开在线简历 → Canvas hook 提取 → 关闭弹窗 → 返回文本
4. 提取到的文本显示在下方只读 Textarea（可手动选中复制）
5. 文本自动填入「区域 2」的输入框供后续 LLM 评估使用

**区域 2：运行 Rubric 评估**

> 不依赖浏览器，直接在主进程调用 LLM API。

- **职位选择器**：下拉选择 `boss-jobs-config.json` 中已启用 `resumeLlmEnabled` 的职位，用于自动加载其 `resumeLlmConfig`
- **或**：展开「手动填写 Rubric JSON」折叠区，直接粘贴 rubric 对象（`{ knockouts, dimensions, passThreshold }`）
- **简历文本输入框**（来自区域 1 自动填充或手动粘贴）
- 点击「🤖 运行 LLM 评估」→ 主进程调用 `llm-screen-resume` → 返回结果展示：
  - **通过 / 未通过** 状态标签
  - 总分（如 `78 / 100`）
  - 判断理由
  - 展开「原始 LLM 响应」折叠区查看 raw JSON

**区域 3：生成 Rubric**

> 不依赖浏览器，直接在主进程调用 LLM API。需已配置 `boss-llm.json`。

- **JD 输入框**（`el-input` textarea）：粘贴岗位描述
- 点击「✨ 生成 Rubric」→ 主进程调用 `llm-generate-rubric` → 将生成的 Rubric JSON 格式化展示在只读文本框
- 提供「📋 复制 JSON」按钮，方便直接粘贴到 `boss-jobs-config.json` 或 BossJobConfig UI

---

## 7. 与 recruiter_architecture 的关系

招聘端调试工具**不参与** daemon/worker 调度，是主进程直接 spawn 的独立子进程，用于本地开发与问题排查。架构总览（`recruiter_architecture.md`）中未单独列出，可在此文档中查阅其设计与用法。
