# 沟通页简历流程与实现说明

本文档记录「沟通页：先看在线简历 → 关键词/LLM 筛选 → 再请求附件简历 → 对方同意后下载 PDF」的流程与实现方式，便于后续维护和对接。

> **完整版简历 Canvas/WASM 破解方案**已由 Claude Code 分析并验证，**详见 [plan/cv_canvas_solution.md](cv_canvas_solution.md)**（含 fillText Hook、get_export_geek_detail_info、注入方式与后处理）。

---

## 1. 流程概览

| 步骤 | 说明 | 是否需对方同意 |
|------|------|----------------|
| 看在线简历 | 点「查看在线简历」，获取候选人简历内容用于筛选 | **否** |
| 关键词/LLM 筛选 | 用在线简历全文做关键词或 LLM 筛选，决定是否要附件 | 不涉及 |
| 请求附件简历 | 点「附件简历」→ 确认「确定向牛人索取简历吗」 | **是**（发出请求） |
| 对方同意后收 PDF | 对方同意后，PDF 会作为**新消息**发到聊天里（**异步**） | **是**（等对方） |
| 下载 PDF | 在消息里点「点击预览附件简历」→ 弹窗里点「下载 PDF」 | 不涉及 |

- **看在线简历**：无需对方同意，点开即可。
- **下载 PDF**：必须先生成「请求附件简历」，等对方同意后，PDF 在新消息里出现，再点预览→下载。

---

## 2. 在线简历数据来源：两套不同的东西

### 2.1 两套数据要分清

| 来源 | 内容 | 用途 |
|------|------|------|
| **聊天/API 的简单摘要** | `geek/info` 的 `zpData.data`、`historyMsg` 里 `body.resume`：只有简单工作单位、学校、职位名等**摘要**，无完整经历描述、技能等 | 聊天框展示、列表展示 |
| **完整版简历（图片里那种）** | **加密数据** → 前端接收 → **WASM 解密**（Rust `decrypt.rs`，含 Base64 + AES）→ **仅绘制到 Canvas**，无明文接口暴露 | #resume 页面里看到的完整简历内容 |

也就是说：**完整版**和 **geek/info / 聊天消息里的 resume 不是同一份数据**。完整版是「加密 → WASM 解密 → 直接画到 Canvas」，目前没有公开的明文 API 能拿到和图片里一模一样的全文。

### 2.2 完整版简历的链路（WASM）

- 沟通页点「查看在线简历」后，打开 `https://www.zhipin.com/web/frame/c-resume/?source=chat-resume-online`，页面只有 `<div id="resume"></div>`。
- 前端会拿到**加密的简历数据**（可能随 geek/info 或另一接口下发），传给 WASM（`wasm_canvas`，Rust 编译）。
- WASM 内 **`src/decrypt.rs`** 做 Base64 解码 + AES 解密，得到明文后再在 Canvas 上通过 **fillText** 等绘制（JS 胶水里有 `wasm_canvas_bg_js_wbg_fillText_*` 的 import）。
- WASM 导出 **`get_export_geek_detail_info()`**，可能用于把解密后的某部分数据回传给 JS，但具体返回什么需看反编译或运行时行为。
- 反编译结果在 **`examples/wasm_canvas_bg-1.0.2-5057.dcmp`**（体量很大）。当前已能确认的线索：
  - **`src/decrypt.rs`**、**"Decrypted data is empty"**、**"Base64 decode error"**、**"Encrypted data is empty"**：解密在 Rust 侧，含 Base64 解码与解密步骤。
  - 依赖 **aes-0.8.4**（Cargo 路径中出现）：解密算法为 AES。
  - **`wasm_canvas_bg_js_wbg_fillText_*`**：WASM 通过 JS import 调用 `fillText` 把解密后的文字画到 Canvas。
  - **`export function start(...)`**：入口，接收 container、content、**geek_info_encrypt_string**、geek_info_other_fields 等，即加密字符串由 JS 传入。
  - **`export function get_export_geek_detail_info():int`**：导出函数，返回类型为 int（可能为指针/句柄），需进一步看其实现或运行时行为才能判断是否可拿到解密后的全文或结构化数据。
  - 后续逆向可重点查：加密数据从哪个接口/字段来、key/iv 从哪来、解密后是否写入某全局或通过 callback 回传。

### 2.3 拿到完整版明文的几种方式（不必破解 AES，也不必非要 OCR）

**重要**：不需要「破解加密」也能拿到完整版明文。WASM 解密后要画字，会调用浏览器的 **`fillText(text, x, y)`**，此时 **`text` 在 JS 侧已经是明文**。我们 hook 的是「解密之后、画上去之前」的这一瞬，拿到的就是明文，不是密文。

| 方式 | 是否要破解/OCR | 说明 | 风险/成本 |
|------|----------------|------|------------|
| **Canvas hook（推荐优先试）** | 否 | 在页面注入前用 **`setupCanvasTextHook(page)`** 劫持 `fillText`，WASM 解密后调 `fillText(明文, x, y)` 即被记录，再用 **`getCapturedText(page)`** 取回。项目已实现，见 `resume-extractor.mjs`。 | 有被反爬检测的可能；可先小范围用，若账号无异常再放宽。 |
| **只用简单摘要** | 否 | 用 **geek/info**、**historyMsg body.resume** 的摘要做筛选。已实现。 | 无；但内容不是完整版，筛选粒度粗。 |
| **OCR** | 不破解，但需 OCR | 打开在线简历后对 **#resume** 或整页截图，用 Tesseract / 云 OCR 识别。不依赖 hook，不碰加解密。 | 需接截图+OCR 管线，识别率受字体/排版影响；不做解密。 |
| **逆向 WASM 在 Node 里解密** | 要逆向，不要 OCR | 在 .dcmp 里理清：加密数据从哪来、key/iv 从哪来，在 Node 里复现解密，得到明文。 | 工作量大，且 key/iv 被打散，作者暂未分析出如何恢复。 |
| **修改 WASM 从内存取明文（原作者思路）** | 不恢复 key/iv，改 WASM | WASM → WAT，找到「解出明文」的代码位置，加 `return` 提前返回；WAT → WASM。运行时把含加密简历的网络响应喂给修改后的 WASM，从内存里直接读解密结果。 | 需改 wasm 并维护；不依赖 key/iv 恢复。 |
| **get_export_geek_detail_info** | 否（若接口返回明文） | 若 BOSS 前端在简历加载完后通过该导出把解密结果暴露给 JS，可在 `page.evaluate` 里调 WASM 实例拿到。 | 需确认该导出是否真的返回可读字符串/对象，且能从我们脚本访问到。 |

**建议**：  
- 若需要**完整版**做关键词/LLM 筛选：**优先用 Canvas hook**（已实现，无需破解、无需 OCR）。若担心风控，可先小流量试，或只在本地/测试环境用。  
- 若不能接受任何 hook：用 **简单摘要** 做粗筛，或上 **OCR** 方案（截图 + Tesseract/云 OCR）。  
- **不必**「只能破解或只能 OCR」二选一；hook 是在解密后、绘制前截获明文，是当前最省事的完整版方案。

### 2.4 Canvas hook 实现细节（关键：iframe sandbox 限制）

在线简历 iframe 的 HTML 特征（2026-03-17 从实际保存页面分析）：

```html
<iframe
  sandbox="allow-popups allow-top-navigation-by-user-activation allow-scripts
           allow-modals allow-downloads allow-pointer-lock allow-presentation"
  src="/web/frame/c-resume/?source=chat-resume-online"
  ...
>
```

**注意 sandbox 没有 `allow-same-origin`**。根据 HTML 规范，不含 `allow-same-origin` 时即便 URL 与主页面同源，iframe 也被视为**跨域**（opaque origin）。因此从主页面访问 `iframeEl.contentWindow.CanvasRenderingContext2D.prototype` 会抛 `SecurityError`。

**错误方式**（历史实现，现已废弃）：  
主页面用 MutationObserver 监听 iframe 插入，再通过 `contentWindow` 注入 hook → 被 sandbox 拦截，hook 永远不生效，Canvas 始终 0 次。

**正确方式（当前实现）**：  
`evaluateOnNewDocument` 会在**每一个 frame（含 iframe）**中各执行一次，不受 sandbox 限制。实现策略：

- **在 iframe 上下文**：`evaluateOnNewDocument` 直接 hook 当前 `window.CanvasRenderingContext2D.prototype.fillText`；捕获到文字后，用 `setTimeout(0)` 批量缓冲，再通过 `window.top.postMessage({ __bossCanvasHook: items }, '*')` 发回主页面。`postMessage` 是标准跨域通信接口，sandbox 不阻断。
- **在主页面上下文**：`evaluateOnNewDocument` 设置 `window.__canvasCapturedText = []` 并注册 `message` 事件监听器，收到 `__bossCanvasHook` 数据后追加到数组。
- **`getCapturedText(page)`**：先等 150ms（确保 `setTimeout(0)` + postMessage 任务队列已处理），再用 `page.evaluate` 读取并清空 `window.__canvasCapturedText`。

**完整版取字调用顺序**：  
1. 在 `page.goto()` **之前** 调用 `setupCanvasTextHook(page)`（需 evaluateOnNewDocument 先注册）。  
2. 选中某条会话，`openOnlineResume(page)` 点开在线简历，等 iframe 出现。  
3. 轮询 `getCapturedText(page)` 直到返回非空数据（WASM 渲染是异步的，通常 1~3s），最长等 8s 后降级用 `geek/info` 摘要。

**调试**：`setupCanvasTextHook` 内部已用 `page.on('console', ...)` 把浏览器侧所有 `[canvasHook]` 日志转发到 Node.js 输出，无需单独在浏览器 DevTools 里看。

### 2.4 当前实现位置与用法（仅简单摘要）

- **拦截**：`resume-extractor.mjs` 的 **`setupNetworkInterceptor(page)`**，会拦截含 `geek/info`、`resume`、`geek/detail` 的 JSON。
- **解析**：**`parseGeekInfoFromIntercepted(interceptedMap)`** 从拦截结果里取 geek/info 的 `zpData.data`，拼成 **摘要级** 的 `text`（姓名、学校、单位、经历列表等），**不是**完整版简历全文。
- **沟通页**：**`getOnlineResumeDataFromApi(getInterceptedData)`** / **`getOnlineResumeText(page, { getInterceptedData })`** 返回的即是上述摘要，适合「用简单信息先筛一轮」；若需完整版，需采用 2.3 中 2～4 之一。

---

## 3. 候选人初步信息与筛选选项

### 3.1 点击 item card 后可获取的初步信息字段

点击左侧某条会话（`selectConversationById`）后，页面会触发 `geek/info` API 请求。通过 `setupNetworkInterceptor + parseGeekInfoFromIntercepted` 可拦截到以下字段（来自 `zpData.data`）：

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 姓名 | 张三 |
| `ageDesc` | 年龄描述 | 26岁 |
| `workYear` | 工作年限描述 | 3-5年 |
| `edu` | 最高学历 | 本科 |
| `positionStatus` | 求职状态 | 离职-随时到岗 |
| `school` | 毕业院校 | 北京大学 |
| `major` | 专业 | 计算机科学 |
| `city` | 所在城市 | 北京 |
| `salaryDesc` / `price` | 期望薪资描述 | 15-25K |
| `positionName` / `toPosition` | 期望职位 | 前端工程师 |
| `workExpList[]` | 工作经历列表（timeDesc, company, positionName） | 2021-2024 字节跳动 前端 |
| `eduExpList[]` | 教育经历列表（timeDesc, school, major, degree） | 2017-2021 北大 计算机 本科 |

**注意**：
- 这些字段在点击 item card（`selectConversationById`）后、点「查看在线简历」之前，由 `geek/info` API 响应带来，无需额外操作。
- `workYear`、`edu`、`salaryDesc` 等字段与推荐页候选人列表的同名字段含义相同，可复用 `candidate-processor.mjs` 中的 `parseWorkExpYears`、`parseSalaryRange` 做结构化解析。
- 目前 `parseConversationList` 只从 DOM 中拿 `geekName` + `jobTitle`（来自左侧 item card 的 `span.geek-name` / `span.source-job`），结构化字段需等点击后拦截 `geek/info` 才能得到。

### 3.2 两阶段筛选机制

沟通页有两个可做筛选的时机，代价从低到高：

| 阶段 | 数据来源 | 触发时机 | 代价 |
|------|---------|----------|------|
| **阶段一：初步信息筛选** | `geek/info` 结构化字段（`edu`、`workYear`、`salaryDesc`、`city` 等） | 点击 item card 后、打开在线简历**之前** | 低（无需打开简历页，只需点击 item） |
| **阶段二：简历全文筛选** | `geek/info` 全文摘要（API 拦截）或 Canvas 完整版（hook） | 点击「查看在线简历」后 | 高（需额外点击、等待页面加载） |

**建议**：先用阶段一做快速初筛（学历、工作年限、薪资、城市），不通过者直接跳过，减少需要打开在线简历的候选人数量，降低操作频次和风控风险。

### 3.3 初步信息筛选选项（`boss-recruiter.json` `chatPage.preFilter`）

对应推荐页的 `candidate-filter.json`，沟通页可在 `chatPage.preFilter` 中配置初步信息筛选条件：

```json
{
  "chatPage": {
    "preFilter": {
      "expectCityList": ["北京", "上海"],
      "expectEducationList": ["本科", "硕士", "博士"],
      "expectWorkExpRange": [1, 5],
      "expectSalaryRange": [15, 50],
      "expectSalaryWhenNegotiable": "exclude",
      "blockCandidateNameRegExpStr": "测试|内推"
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `expectCityList` | `string[]` | 期望城市白名单；空数组 = 不限 |
| `expectEducationList` | `string[]` | 期望学历白名单（如 `["本科","硕士","博士"]`）；空 = 不限 |
| `expectWorkExpRange` | `[number, number]` | 工作年限范围 [min, max]（年）；[0, 99] = 不限 |
| `expectSalaryRange` | `[number, number]` | 薪资范围 [min, max]（千/月 K）；[0, 0] = 不限；≥100 的值自动折算为 K（如 8000→8） |
| `expectSalaryWhenNegotiable` | `'exclude'\|'include'` | 薪资「面议」或无法解析时：`exclude`（默认）= 跳过，`include` = 通过 |
| `blockCandidateNameRegExpStr` | `string` | 姓名屏蔽正则，命中则跳过 |

**筛选逻辑与推荐页相同**，可直接复用 `candidate-processor.mjs` 的 `filterCandidates`：
- `city` → `expectCityList` 精确匹配
- `education` → `expectEducationList` 精确匹配
- `workExp` → `parseWorkExpYears()` 后与 `expectWorkExpRange` 比较
- `salary` → `parseSalaryRange()` 后与 `expectSalaryRange` 比较
- `name` → `blockCandidateNameRegExpStr` 正则匹配

### 3.4 在线简历全文筛选选项（`chatPage.filter`）

阶段二的全文筛选，通过 `chatPage.filter` 配置：

```json
{
  "chatPage": {
    "filter": {
      "mode": "keywords",
      "keywordList": ["Vue", "React", "TypeScript"],
      "llmRule": ""
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `mode` | `"keywords"`（默认）或 `"llm"` |
| `keywordList` | `mode="keywords"` 时：简历全文中至少命中一个关键词则通过；空数组 = 全通过 |
| `llmRule` | `mode="llm"` 时：传给 LLM 的筛选规则描述；LLM 出错时默认通过 |

**注意**：全文筛选优先使用 Canvas hook 抓取的**完整版简历文本**（WASM 解密后 fillText 调用序列重组）；Canvas 为空时自动降级为 `geek/info` 拼接的**摘要级文本**。Canvas hook 已实现，见 §2.4 及 `resume-extractor.mjs`。

---

## 4. 请求附件简历与下载 PDF（异步）

- **请求**：**`requestAttachmentResume(page)`** 点击「附件简历」并在确认弹窗中点击确认。此时只是发出请求，**不会立刻得到 PDF**。
- **等待**：对方同意后，PDF 会作为**新消息**出现在聊天区域（异步），消息内会有「点击预览附件简历」。
- **等待新消息**：**`waitForAttachmentResumeMessage(page, options)`** 轮询当前对话中的消息，直到某条消息内出现「点击预览附件简历」按钮。
- **下载**：**`openPreviewAndDownloadPdf(page, messageElement?, options)`** 在该条消息上点击「点击预览附件简历」，等预览弹窗出现后点击「下载 PDF」。下载目录可通过 Puppeteer 的 `Page.setDownloadBehavior` 等设置。

### 4.1 跳过下载开关（`chatPage.attachmentResume.skipDownload`）

BOSS 直聘支持在账号设置里配置「收到附件简历自动转发到邮箱」。若已开启该功能，则无需在 Puppeteer 里额外下载 PDF，可在 `boss-recruiter.json` 中添加：

```json
{
  "chatPage": {
    "attachmentResume": {
      "skipDownload": true
    }
  }
}
```

| 值 | 行为 |
|----|------|
| `false`（默认） | 检测到附件简历消息后，打开预览弹窗并点击「下载 PDF」 |
| `true` | 仅发出索取请求，检测到附件简历消息后**跳过下载**（系统仍继续处理后续候选人） |

**对 Webhook 的影响**：`skipDownload: true` 时系统不下载 PDF，因此 Webhook Payload 中的 `resumeFile` 字段将始终为空，与 `payloadOptions.includeResume` 的配置无关。详见 [plan/webhook_integration.md § 4](webhook_integration.md)。

---

## 5. 选择器与常量

- 沟通页相关选择器与 URL 常量均在 **`packages/boss-auto-browse-and-chat/constant.mjs`** 中，以 `CHAT_PAGE_*` 和 `CHAT_PAGE_ONLINE_RESUME_*` 为前缀。
- 在线简历内容容器：**`CHAT_PAGE_ONLINE_RESUME_CONTENT_SELECTOR = '#resume'`**；其**完整版**内容由加密数据经 WASM 解密后绘制到 Canvas，**不是** geek/info 的简单摘要。

### 5.1 沟通页 DOM 结构要点（2026-03-17 从实际页面分析）

- **页面整体**：沟通页主体 UI 在**顶层页面**，并非 iframe。只有两个 `srcdoc` iframe：① 推荐牛人子页（`name=recommendFrame`）；② Canvas 简历渲染器（含 `#resume canvas`）。
- **左侧会话列表**结构（虚拟滚动）：
  ```
  .user-container > .user-list.b-scroll-stable
    > div[role=group]          ← 虚拟滚动容器
      > div[role=listitem]     ← 每条会话的外层
        > div.geek-item-wrap
          > div.geek-item      ← 可点击行；id="_<geekId>-0"，data-id="<geekId>-0"
              span.geek-name   ← 候选人姓名
              span.source-job  ← 职位
              span.badge-count ← 未读数角标（无未读时不存在，非 display:none 而是不渲染）
  ```
- **encryptGeekId**：在 `.geek-item[data-id="<id>-0"]` 上，取 `data-id` 去掉末尾 `-0` 即为 ID。列表项内**没有 href**，不能从链接提取。
- **在线简历按钮**：`a.resume-btn-online`（无 href，Vue 点击事件）
- **在线简历弹窗**（点击按钮后出现）：
  ```
  div#boss-dynamic-dialog-<动态id>.dialog-wrap.active
    └─ div.boss-popup__wrapper.boss-dialog.boss-dialog__wrapper
          .resume-common-dialog.search-resume
          .new-chat-resume-dialog-main-ui.resume-container
         ├─ div.boss-popup__content
         │    └─ div.resume-recommend.resume-common-wrap
         │         └─ div.resume-detail.iframe-resume-detail
         │              └─ <iframe sandbox="allow-scripts ..." src="/web/frame/c-resume/...">
         └─ div.boss-popup__close     ← 关闭按钮（selector: .resume-common-dialog .boss-popup__close）
              └─ i.icon-close
  ```
  - 弹窗 ID（`#boss-dynamic-dialog-...`）是动态生成的，**不能**用 ID 匹配，应用类名：`.resume-common-dialog .boss-popup__close`。
  - 切换候选人时弹窗**不会自动关闭**，需在打开新候选人的在线简历之前先调用 `page.click(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR)` 并等待关闭按钮从 DOM 消失（`waitForSelector(closeSelector, { hidden: true })`）。
  - 等待「iframe 消失」来判断弹窗关闭是不稳定的；等「关闭按钮消失」更可靠。
- **附件简历按钮**：`.resume-btn-file`（div，未发起请求时带 `disabled` class；点击仍会触发确认弹窗）
- **消息列表**：`.chat-message-list .message-item`
- **对方发来的附件简历消息** HTML 特征：
  ```html
  <div class="item-friend">
    <div class="message-card-wrap boss-green">
      <div class="message-card-buttons">
        <span class="card-btn">点击预览附件简历</span>
      </div>
    </div>
  ```
  选择器：`div.message-card-buttons > span.card-btn`
- **页面加载时机**：`document.readyState='complete'` 之后，Vue 虚拟滚动列表仍需时间渲染，必须用 `waitForSelector(CHAT_PAGE_ITEM_SELECTOR)` 等待至少一条 `.geek-item` 出现后再解析，否则得到空列表。

---

## 6. 与简历图片的对应关系（产品/测试对照）

- **简历图片 / #resume 上看到的完整版**：对应「**加密数据 → WASM 解密 → Canvas 绘制**」这一条链路，**不是** geek/info 或 historyMsg 的 JSON。
- **聊天框/列表里的简单信息**：对应 **geek/info** 的 **`zpData.data`**、**historyMsg** 里 **`body.resume`**（仅简单工作单位、学校等摘要）。
- 若自动化需要「和图片一致的完整版」做筛选：**推荐用 Canvas hook**（解密后、fillText 时截获明文，无需破解、无需 OCR）；若不能接受 hook，再考虑 OCR 或逆向 WASM。

---

## 7. 文件与职责小结

| 文件 | 职责 |
|------|------|
| `plan/chat_page_resume_flow.md` | 本文档：流程与实现说明 |
| **`plan/cv_canvas_solution.md`** | **完整版简历 Canvas/WASM 破解方案（已验证）** |
| **`plan/recruiter_mouse_trajectory.md`** | **招聘端拟人鼠标轨迹（反人机），各 Phase 涉及点击/移动时必读** |
| `packages/boss-auto-browse-and-chat/constant.mjs` | 沟通页选择器、#resume、URL 常量 |
| `packages/boss-auto-browse-and-chat/resume-extractor.mjs` | 网络拦截、parseGeekInfoFromIntercepted、Canvas hook |
| `packages/boss-auto-browse-and-chat/chat-page-resume.mjs` | openOnlineResume、getOnlineResumeDataFromApi、getOnlineResumeText、requestAttachmentResume、waitForAttachmentResumeMessage、openPreviewAndDownloadPdf |
| `packages/boss-auto-browse-and-chat/chat-page-processor.mjs` | 沟通页主流程：parseConversationList、selectConversationById、screenCandidateWithLlm、startBossChatPageProcess；含阶段一初步信息筛选和阶段二全文筛选逻辑；读取 `chatPage.attachmentResume.skipDownload` 开关决定是否跳过 PDF 下载 |
| `packages/boss-auto-browse-and-chat/default-config-file/boss-recruiter.json` | 默认配置，含 `chatPage.attachmentResume.skipDownload`（默认 `false`） |
| `packages/boss-auto-browse-and-chat/candidate-processor.mjs` | 共用筛选工具：filterCandidates、parseWorkExpYears、parseSalaryRange；可复用于沟通页初步信息筛选（preFilter） |

---

## 8. 原作者建议（招聘端反检测）

> 作者说明：之前调研过招聘端；在职时太忙没推下去，现在失业也没有招聘权限。若有人要做，以下为个人想法。

> 简历解密相关方案（WASM/Canvas hook/get_export_geek_detail_info 等）已由 Claude Code 分析并验证，**详见 [plan/cv_canvas_solution.md](cv_canvas_solution.md)**。

### 8.1 鼠标轨迹（反人机）

- **现象**：BOSS 会对招聘端**鼠标移动轨迹**做埋点，可能是判断人机的特征之一。
- **建议**：尝试借助一些库生成**拟人的鼠标轨迹**（例如贝塞尔曲线、随机抖动、加速度等），让 Puppeteer 操作时不是「瞬移」而是沿轨迹移动，降低被识别为脚本的概率。

---

*文档维护：随实现变更时请同步更新本 plan。*
