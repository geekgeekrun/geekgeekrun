# 招聘端（Recruiter/BOSS）架构总览

> **定位**：供 AI Agent 快速理解招聘端全貌，用于协作开发时减少 token 消耗。
> 最后更新：2026-03-26

---

## 1. 整体架构一览

```
UI 层 (Electron Renderer)
  └── 四个配置/启动页面
        ├── BossAutoBrowseAndChat  →  推荐牛人：配置 + 启动
        ├── BossChatPage           →  沟通页：配置 + 启动
        ├── BossAutoSequence       →  顺序执行（无独立配置，复用上两者）
        └── WebhookIntegration     →  Webhook / 外部集成（配置 + 测试发送）

IPC 层 (Electron Main)
  └── ipc/index.ts  →  run / stop / save / fetch-config 处理器

Worker 层 (独立 Electron 子进程，通过 daemon 管理)
  ├── bossRecommendMain      →  flow/BOSS_RECOMMEND_MAIN/index.ts
  ├── bossChatPageMain       →  flow/BOSS_CHAT_PAGE_MAIN/index.ts
  └── bossAutoBrowseAndChatMain → flow/BOSS_AUTO_BROWSE_AND_CHAT_MAIN/index.ts（串联上两者）

自动化核心 (packages/boss-auto-browse-and-chat/)
  ├── index.mjs                →  startBossAutoBrowse（推荐牛人主入口）
  ├── chat-page-processor.mjs  →  startBossChatPageProcess（沟通页主入口）
  ├── candidate-processor.mjs  →  解析列表、筛选候选人、滚动加载
  ├── chat-handler.mjs         →  点击打招呼、发送招呼语、检查日限
  ├── resume-extractor.mjs     →  网络拦截 + Canvas hook 提取简历文本
  ├── chat-page-resume.mjs     →  在线简历、附件简历、下载 PDF
  ├── data-manager.mjs         →  查重、保存候选人信息、写联系日志
  ├── humanMouse.mjs           →  ghost-cursor 人类鼠标模拟
  ├── constant.mjs             →  URL 常量、DOM 选择器
  └── runtime-file-utils.mjs  →  读写 config / storage 文件工具

持久化 (@geekgeekrun/sqlite-plugin)
  └── SQLite: ~/.geekgeekrun/storage/public.db
        ├── CandidateInfo          →  候选人基础信息
        └── CandidateContactLog    →  联系记录日志

外部集成 (packages/ui/src/main/features/webhook/)
  └── index.ts  →  sendWebhook / buildMockPayload
        配置文件：~/.geekgeekrun/config/webhook.json（boss-auto-browse 路径）
```

---

## 2. 三个 Worker 说明

| Worker ID | Flow 文件 | 调用的核心函数 | 对应页面 |
|-----------|-----------|--------------|--------|
| `bossRecommendMain` | `BOSS_RECOMMEND_MAIN/index.ts` | `startBossAutoBrowse(hooks)` | BossAutoBrowseAndChat |
| `bossChatPageMain` | `BOSS_CHAT_PAGE_MAIN/index.ts` | `startBossChatPageProcess(hooks)` | BossChatPage |
| `bossAutoBrowseAndChatMain` | `BOSS_AUTO_BROWSE_AND_CHAT_MAIN/index.ts` | 两者串联，先推荐后沟通，browser 在两阶段间复用 | BossAutoSequence |

**Worker 生命周期（通用模式）：**
1. `initPuppeteer()` 注册 stealth/laodeng/anonymize-ua 插件
2. 构建 `hooks` 对象（AsyncSeriesHook / AsyncSeriesWaterfallHook）
3. `new SqlitePlugin(dbPath).apply(hooks)` 挂载 DB 操作
4. 无限循环：执行主函数 → 出错则等待 `rerunInterval`（默认 3000ms）重试
5. 特定错误（LOGIN_STATUS_INVALID / ERR_INTERNET_DISCONNECTED 等）直接 `process.exit(exitCode)`
6. 通过 `sendToDaemon()` 向 GUI 发送进度消息

---

## 3. 推荐牛人（Recommend Page）主循环

```
startBossAutoBrowse(hooks, { returnBrowser? })
  1. hooks.beforeBrowserLaunch
  2. 启动 Puppeteer 浏览器
  3. Tab1 (pageChat) → BOSS_CHAT_INDEX_URL（沟通页，当前仅作展示）
  4. Tab2 (page)     → BOSS_RECOMMEND_PAGE_URL（推荐牛人，主循环在此）
  5. 注入 Cookie + localStorage（boss-cookies.json / boss-local-storage.json）
  6. 登录检测：URL 未在推荐页则等待用户手动登录后持久化存储
  7. hooks.onCandidateListLoaded（触发 GUI 登录状态 fulfilled）
  8. 主循环：
     while (hasMore) {
       candidates = parseCandidateList(page)          // DOM/Vue 解析
       filtered   = filterCandidates(candidates, cfg) // 城市/学历/工作年限/薪资/技能/屏蔽名
       hooks.onCandidateFiltered(filtered)
       for each matched:
         checkDailyLimit(page)                        // 今日已达上限则 break
         if count >= maxChatPerRun: break
         processCandidate(page, candidate, ...)        // 含打招呼延迟
         hooks.onProgress({ phase:'recommend', current, max })
       hasMore = scrollAndLoadMore(page)
     }
  9. returnBrowser ? return { browser, page } : browser.close()
```

---

## 4. 沟通页（Chat Page）主流程

```
startBossChatPageProcess(hooks, { browser?, page? })
  1. 若有传入 browser/page 则复用（来自顺序执行），否则自行启动
  2. 导航到 BOSS_CHAT_PAGE_URL
  3. 解析左侧会话列表，筛选 unread === true 的会话
  4. 每条会话（最多 maxProcessPerRun）：
     a. checkIfAlreadyContacted(hooks) → 已接触则 skip
     b. 点击会话（human cursor）
     c. 若存在附件简历消息 → openPreviewAndDownloadPdf()
     d. 否则若候选人已发招呼 →
          openOnlineResume() → getOnlineResumeText()（Canvas hook）
          mode=keywords: 关键词 substring 匹配
          mode=llm:      screenCandidateWithLlm(text, rule) → JSON { pass, reason }
          pass → requestAttachmentResume()
     e. saveCandidateInfo() + logContact()
     f. hooks.onProgress({ phase:'chatPage', current, max })
```

---

## 5. 配置文件结构

**路径：** `~/.geekgeekrun/config/`

### webhook.json（boss-auto-browse 配置路径）

```json
{
  "enabled": true,
  "url": "https://your-paperless.example.com/api/documents/post_document/",
  "method": "POST",
  "headers": {
    "Authorization": "Token YOUR_TOKEN"
  },
  "payloadOptions": {
    "includeBasicInfo": true,
    "includeFilterReason": true,
    "includeLlmConclusion": true,
    "includeResume": "path"
  }
}
```

`includeResume` 取值：`"none"` | `"path"` | `"base64"`

**Payload 结构（发出的 JSON）：**
```json
{
  "runId": "run-<runRecordId>",
  "timestamp": "ISO8601",
  "summary": { "total": 10, "matched": 7, "skipped": 3 },
  "candidates": [
    {
      "basicInfo": { "name": "...", "education": "...", "workExpYears": 3, "city": "...", "salary": "...", "skills": [] },
      "filterReport": { "matched": true, "matchedRules": [], "score": 85 },
      "llmConclusion": "...",
      "resumeFile": { "path": "/abs/path/to/resume.pdf", "filename": "张三.pdf" }
    }
  ]
}
```

**自动触发时机：** `bossAutoBrowseAndChatMain` worker 中每轮（推荐页 + 沟通页）执行完毕后，读取 webhook.json，若 `enabled=true` 则发送汇总报告；失败不影响主流程，清空 `sessionCandidates` 后等待下轮。

**候选人数据来源：** `afterChatStarted` hook（每次打招呼后触发），收集 `candidate` 对象中的 `info`、`matchedRules`、`score`、`llmConclusion`、`resumeFilePath`、`resumeFileName` 字段。

---

### boss-recruiter.json
```json
{
  "targetJobId": "",
  "autoChat": {
    "greetingMessage": "你好，...",
    "maxChatPerRun": 50,
    "delayBetweenChats": [3000, 8000]
  },
  "chatPage": {
    "maxProcessPerRun": 20,
    "filter": {
      "mode": "keywords",
      "keywordList": ["Python", "机器学习"],
      "llmRule": ""
    }
  }
}
```

### candidate-filter.json
```json
{
  "expectCityList": ["北京", "上海"],
  "expectEducationList": ["本科", "硕士"],
  "expectWorkExpRange": [1, 5],
  "expectSalaryRange": [15, 50],
  "expectSkillKeywords": ["Vue", "React"],
  "blockCandidateNameRegExpStr": "测试|内推"
}
```

**路径：** `~/.geekgeekrun/storage/`

- `boss-cookies.json` — 招聘端 Cookie
- `boss-local-storage.json` — 域名 localStorage
- `public.db` — SQLite 数据库

---

## 6. 关键常量（constant.mjs）

> 以下为主要常量摘录，完整列表以源文件为准。BOSS 站点改版时常量可能失效，参见 §14.5 排查流程。

```js
// URL
BOSS_RECOMMEND_PAGE_URL = 'https://www.zhipin.com/web/chat/recommend'
BOSS_CHAT_INDEX_URL     = 'https://www.zhipin.com/web/chat/index'
BOSS_CHAT_PAGE_URL      = 'https://www.zhipin.com/web/chat/index'

// 推荐牛人页选择器
CANDIDATE_LIST_SELECTOR         = 'ul.card-list'
CANDIDATE_ITEM_SELECTOR         = 'ul.card-list > li.card-item'
CANDIDATE_NAME_SELECTOR         = 'span.name'
CHAT_START_BUTTON_SELECTOR      = 'button.btn-greet'
GREETING_SENT_KNOW_BTN_SELECTOR = 'div.dialog-wrap button.btn-sure-v2'
CONTINUE_CHAT_BUTTON_SELECTOR   = 'div.operate-side div.button-chat'
CHAT_INPUT_SELECTOR             = '#boss-chat-global-input'

// 沟通页选择器（CHAT_PAGE_* 前缀）
CHAT_PAGE_ITEM_SELECTOR                   = '.user-container .geek-item'
CHAT_PAGE_NAME_SELECTOR                   = 'span.geek-name'
CHAT_PAGE_JOB_SELECTOR                    = 'span.source-job'
CHAT_PAGE_ONLINE_RESUME_SELECTOR          = 'a.resume-btn-online'
CHAT_PAGE_ATTACH_RESUME_BTN_SELECTOR      = 'div.resume-btn-content .resume-btn-file'
CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR = 'div.ask-for-resume-confirm > div.content > button.boss-btn-primary'
CHAT_PAGE_MESSAGE_ITEM_SELECTOR           = '.chat-message-list .message-item'
CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR     = 'div.message-card-buttons > span.card-btn:only-child'
CHAT_PAGE_DOWNLOAD_PDF_BTN_SELECTOR       = '.resume-common-dialog .attachment-resume-btns > .popover:nth-child(3)'
CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR = '.op-btn.rightbar-item div.dialog-container div.button span'

// 治理公告弹窗（登录后必现，§14.1 详述）
GOVERNANCE_NOTICE_DIALOG_SELECTOR             = '.dialog-uninstall-extension'
GOVERNANCE_NOTICE_DIALOG_CONFIRM_BTN_SELECTOR = '.dialog-uninstall-extension .confirm-btn'
```

---

## 7. IPC 通信接口（main ↔ renderer）

### 招聘端专用 IPC

| Channel | 方向 | 说明 |
|---------|------|------|
| `run-boss-recommend` | invoke | 启动推荐牛人 worker，返回 `{ runRecordId }` |
| `stop-boss-recommend` | invoke | 停止推荐牛人 worker（等待退出） |
| `run-boss-chat-page` | invoke | 启动沟通页 worker，返回 `{ runRecordId }` |
| `stop-boss-chat-page` | invoke | 停止沟通页 worker |
| `run-boss-auto-browse-and-chat` | invoke | 启动顺序执行 worker，返回 `{ runRecordId }` |
| `stop-boss-auto-browse-and-chat` | invoke | 停止顺序执行 worker |
| `save-boss-recruiter-config` | invoke | 保存招聘端配置（JSON 字符串），同时写 boss-recruiter.json 和 candidate-filter.json |
| `fetch-boss-recruiter-config-file-content` | invoke | 读取配置，返回 `{ config: { 'boss-recruiter.json': {}, 'candidate-filter.json': {} } }` |
| `check-boss-recruiter-cookie-file` | invoke | 检查 Cookie 格式是否合法 |
| `fetch-webhook-config` | invoke | 读取 webhook.json，返回配置对象或 null |
| `save-webhook-config` | invoke | 写入 webhook.json（接收 JSON 字符串） |
| `test-webhook` | invoke | 发送 mock payload 到已配置的 URL，返回 `{ status, body }` |
| `trigger-webhook-manually` | invoke | 用 mock payload（标记为 manual）手动触发一次，返回 `{ status, body }` |

### Worker → GUI 消息（通过 daemon）

消息类型（`data.type` 字段）：

| type | 说明 |
|------|------|
| `worker-log` | 普通日志文本 |
| `prerequisite-step-by-step-checkstep-by-step-check` | 前置步骤状态更新，含 `{ step: { id, status } }` |
| `boss-auto-browse-progress` | 进度更新，含 `{ phase, current, max }` |
| `worker-exited` | Worker 进程退出 |

---

## 8. 前置步骤（RunningOverlay 进度条）

```
getBossAutoBrowseSteps() → [
  { id: 'worker-launch',           describe: '启动子进程' },
  { id: 'puppeteer-executable-check', describe: 'Puppeteer 可执行程序检查' },
  { id: 'login-status-check',      describe: '登录状态检查（若浏览器弹出请以招聘者身份登录）' }
]
```

步骤状态：`'todo' | 'pending' | 'fulfilled' | 'rejected'`

---

## 9. Hooks 体系

所有 worker 都构造相同结构的 hooks 传给核心模块，SqlitePlugin 在上面挂载 DB 操作：

```ts
const hooks = {
  beforeBrowserLaunch:       AsyncSeriesHook,
  afterBrowserLaunch:        AsyncSeriesHook,
  beforeNavigateToRecommend: AsyncSeriesHook,
  onCandidateListLoaded:     AsyncSeriesHook,
  onCandidateFiltered:       AsyncSeriesWaterfallHook,  // ['candidates', 'filterResult']
  beforeStartChat:           AsyncSeriesHook,           // ['candidate']
  afterChatStarted:          AsyncSeriesHook,           // ['candidate', 'result']
  onError:                   AsyncSeriesHook,           // ['error']
  onComplete:                AsyncSeriesHook,
  onProgress:                AsyncSeriesHook,           // ['payload']
  // SqlitePlugin 额外挂载：
  createOrUpdateCandidateInfo:  AsyncSeriesHook
  insertCandidateContactLog:    AsyncSeriesHook
  queryCandidateByEncryptId:    AsyncSeriesWaterfallHook
}
```

---

## 10. 反检测机制

- **puppeteer-extra-plugin-stealth** — 抹除 headless 特征
- **@geekgeekrun/puppeteer-extra-plugin-laodeng** — 自定义反检测
- **puppeteer-extra-plugin-anonymize-ua** — 随机 UserAgent（`makeWindows: false`）
- **ghost-cursor** — `createHumanCursor(page)` 模拟人类鼠标轨迹，所有点击走 cursor 而非 `page.click()`
- **sleepWithRandomDelay(base, range)** — 操作间随机延迟
- 滚动：`page.mouse.wheel({ deltaY })` 分步骤随机延迟

---

## 11. 路由与导航

| 路由 Name | 路径 | 页面组件 |
|----------|------|--------|
| `BossAutoBrowseAndChat` | `/main-layout/BossAutoBrowseAndChat` | 推荐牛人 - 自动开聊 |
| `BossChatPage` | `/main-layout/BossChatPage` | 沟通页 |
| `BossAutoSequence` | `/main-layout/BossAutoSequence` | 自动顺序执行 |
| `WebhookIntegration` | `/main-layout/WebhookIntegration` | Webhook / 外部集成 |

切换到招聘端身份时默认重定向到 `BossAutoBrowseAndChat`。

`RECRUITER_ROUTES = ['BossAutoBrowseAndChat', 'BossChatPage', 'BossAutoSequence']` 用于判断当前身份模式。
> 注：`WebhookIntegration` 是纯配置页，无需加入 `RECRUITER_ROUTES`（无 RunningOverlay）。

---

## 12. 如何新增招聘端页面

1. **新建页面组件**
   ```
   packages/ui/src/renderer/src/page/MainLayout/Boss<NewPage>/index.vue
   ```
   - 若需要启动任务：参考 `BossAutoBrowseAndChat/index.vue` 或 `BossChatPage/index.vue`
   - 使用 `RunningOverlay` 组件显示进度：
     ```vue
     <RunningOverlay worker-id="<workerId>" :run-record-id="runRecordId" :get-steps="getBossAutoBrowseSteps" />
     ```

2. **注册路由** — 在 `packages/ui/src/renderer/src/router/index.ts` 的 `/main-layout` children 中添加：
   ```ts
   { name: 'Boss<NewPage>', path: 'Boss<NewPage>', component: () => import(...), meta: { title: '...' } }
   ```

3. **更新 RECRUITER_ROUTES** — 在 `packages/ui/src/renderer/src/page/MainLayout/index.vue` 中：
   ```ts
   const RECRUITER_ROUTES = ['BossAutoBrowseAndChat', 'BossChatPage', 'BossAutoSequence', 'Boss<NewPage>']
   ```

4. **添加导航入口** — 在 `packages/ui/src/renderer/src/page/MainLayout/LeftNavBar/RecruiterPart.vue`：
   ```vue
   <RouterLink :to="{ name: 'Boss<NewPage>' }">页面名称</RouterLink>
   ```

5. **（如需新 Worker）新建 flow 文件**
   ```
   packages/ui/src/main/flow/BOSS_<NEW>_MAIN/index.ts
   ```
   - 复制 `BOSS_RECOMMEND_MAIN/index.ts` 为模板
   - 修改 `workerId`、调用的核心函数、日志前缀

6. **注册新 mode** — 在 `packages/ui/src/main/index.ts` 的 switch 中：
   ```ts
   case 'boss<New>Main': {
     const { waitForProcessHandShakeAndRunAutoChat } = await import('./flow/BOSS_<NEW>_MAIN/index')
     waitForProcessHandShakeAndRunAutoChat()
     break
   }
   ```

7. **添加 IPC 处理器** — 在 `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`：
   ```ts
   ipcMain.handle('run-boss-<new>', async () => {
     const mode = 'boss<New>Main'
     const { runRecordId } = await runCommon({ mode })
     daemonEE.on('message', function handler(message) {
       if (message.workerId !== mode) return
       if (message.type === 'worker-exited') mainWindow?.webContents.send('worker-exited', message)
     })
     return { runRecordId }
   })
   ipcMain.handle('stop-boss-<new>', async () => {
     // 参考 stop-boss-recommend 的模式
   })
   ```

8. **（如需新配置字段）更新 save-boss-recruiter-config 处理器**（同文件）

---

## 13. 如何在核心模块新增功能

### 新增候选人筛选条件
- 在 `candidate-processor.mjs` 的 `filterCandidates()` 添加判断逻辑
- 在 `candidate-filter.json` 对应结构增加字段
- 在 `BossAutoBrowseAndChat/index.vue` 增加 UI 表单项
- 在 IPC `save-boss-recruiter-config` 中处理新字段的保存/读取

### 新增 Hook 钩子点
- 在 worker flow 文件的 `hooks` 对象中添加 `new AsyncSeriesHook(['...'])`
- 在核心 .mjs 文件对应位置调用 `await hooks.newHook?.promise?.(payload)`

### 新增联系日志类型
- 在 `data-manager.mjs` 的 `logContact()` 调用时传入新的 `contactType` 字符串
- SQLite Plugin 会自动持久化

---

## 14. 已知弹窗及自动处理清单

BOSS直聘在各页面会弹出各类提示/公告弹窗，均需自动点击关闭，否则会遮挡操作区域或导致自动化卡死。以下列出所有已纳入代码处理的弹窗。

---

### 14.1 治理公告弹窗（dialog-uninstall-extension）

**何时出现：** 每次登录后（包含首次加载、cookie 失效重新登录），浏览器导航到 BOSS 站点后必现。BOSS 借此告知平台禁止使用第三方自动化工具。

**外观：** 全屏遮罩，正中宽 580px 卡片，含平台公告文字；底部有一枚背景图模拟的「我已知晓」按钮（`div.confirm-btn`，非 `<button>`，以图片代替文字）。

**HTML 骨架（来自 `examples/BOSS直聘-治理公告 (2026_3_26 15：41：51).html`）：**
```html
<!-- 挂载在 #boss-dynamic-dialog-<id>，id 随机 -->
<div class="boss-popup__wrapper boss-dialog boss-dialog__wrapper dialog-uninstall-extension"
     style="animation-duration:0s; width:580px; z-index:2002">
  <div class="boss-popup__content">
    <div class="boss-dialog__body">
      <div data-v-4a24c2ed class="uninstall-extension">
        <div data-v-4a24c2ed class="top"></div>        <!-- 顶部装饰图 -->
        <div data-v-4a24c2ed class="content">
          <div data-v-4a24c2ed class="notice">...公告标题...</div>
          <div data-v-4a24c2ed class="tips mb-24">...禁止使用第三方工具说明...</div>
          <div data-v-4a24c2ed class="confirm-btn"></div>  <!-- 「我已知晓」按钮（背景图） -->
        </div>
      </div>
    </div>
  </div>
  <div ka class="boss-popup__close"><i class="icon-close"></i></div>
</div>
```

**关键选择器（在 `constant.mjs` 中定义）：**

| 常量 | 选择器 | 用途 |
|------|--------|------|
| `GOVERNANCE_NOTICE_DIALOG_SELECTOR` | `.dialog-uninstall-extension` | 检测弹窗是否存在 |
| `GOVERNANCE_NOTICE_DIALOG_CONFIRM_BTN_SELECTOR` | `.dialog-uninstall-extension .confirm-btn` | 点击「我已知晓」 |

> **注意：** `confirm-btn` 是 `<div>` 而非 `<button>`，文字由背景图渲染，`page.$eval(selector, el => el.textContent)` 返回空字符串。

**处理函数：** `dismissGovernanceNoticeDialog(page)` — 在 `boss-auto-browse-and-chat/index.mjs` 中定义。

**调用位置：**
- `launchBrowserAndNavigateToChat()` — 导航到沟通页并等待 `readyState=complete` 之后
- `startBossAutoBrowse()` — 登录检查/等待登录块结束之后、切换职位之前

**Debug 提示：**
- 若弹窗出现但 `confirm-btn` 不可点击（`boundingBox()` 返回 null），说明容器被 `overflow:hidden` 裁剪或弹窗尚未完成动画，应先等待 500ms 再重试。
- 弹窗 `z-index:2002`，会遮挡推荐牛人 iframe；若候选人列表未能渲染，优先排查此弹窗是否已关闭。
- 若选择器失效（BOSS 改了 class），打开 `examples/` 文件夹中最新保存的治理公告 HTML 快照，搜索 `confirm-btn` 或 `dialog-uninstall-extension` 重新确认。

---

### 14.2 意向沟通提示弹窗（dialog-container）

**何时出现：** 沟通页，每次新浏览器会话切到某个会话时，BOSS 视为新用户会弹出此提示（遮挡右侧附件简历等操作按钮）。

**关键选择器：**

| 常量 | 选择器 |
|------|--------|
| `CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR` | `.op-btn.rightbar-item div.dialog-container div.button span` |
| `CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR` | `.op-btn.rightbar-item div.dialog-container div.iboss-close.close` |

**处理位置：** `chat-page-processor.mjs`，每次切换会话后（点击左侧会话项、等待右侧面板更新之后）立即检测并关闭。

---

### 14.3 已向牛人发送招呼弹窗

**何时出现：** 推荐牛人页，点击「打招呼」后弹出确认。

**关键选择器：** `GREETING_SENT_KNOW_BTN_SELECTOR = 'div.dialog-wrap button.btn-sure-v2'`

**处理位置：** `chat-handler.mjs` — `processCandidate()` 内打招呼流程。

---

### 14.4 「不感兴趣」原因弹窗

**何时出现：** 推荐牛人页 iframe 内，点击「不感兴趣」后弹出原因选择框。

**关键选择器：**

| 常量 | 选择器 |
|------|--------|
| `NOT_INTERESTED_REASON_POPUP_SELECTOR` | `div.card-reason-f1.show` |
| `NOT_INTERESTED_REASON_POPUP_CLOSE_SELECTOR` | `div.card-reason-f1.show div.close-icon` |

**处理位置：** `chat-handler.mjs` — `clickNotInterested()` 内。

---

### 14.5 维护历史 & 选择器失效排查流程

1. 在 Chrome DevTools 中打开对应 BOSS 页面，手动触发弹窗。
2. 右键元素 → Copy → Copy selector，与 `constant.mjs` 中对应常量对比。
3. 更新 `constant.mjs` 中的常量值。
4. 在 `examples/` 目录下保存最新 HTML 快照（文件名含日期），以备后续对比。
5. 若弹窗结构变化较大，同步更新本文档对应小节的「HTML 骨架」。

---

## 15. 相关文档

- [boss_auto_browse_tabs.md](boss_auto_browse_tabs.md) — 双 Tab 设计（沟通 vs 推荐牛人）
- [chat_page_resume_flow.md](chat_page_resume_flow.md) — 沟通页简历流程详述
- [cv_canvas_solution.md](cv_canvas_solution.md) — Canvas/WASM 简历解密方案
- [recruiter_mouse_trajectory.md](recruiter_mouse_trajectory.md) — 反检测鼠标轨迹方案
- [webhook_integration.md](webhook_integration.md) — Webhook / 外部集成详述（Paperless-ngx 对接）
