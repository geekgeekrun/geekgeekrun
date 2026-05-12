# 推荐牛人页（Recommend Page）完整逻辑文档

> **定位**：供 AI Agent 快速理解推荐牛人页的完整运行逻辑、DOM 结构、选择器与各模块分工。
> 最后更新：2026-03-16

---

## 1. 入口与文件分工

| 文件 | 职责 |
|------|------|
| `packages/boss-auto-browse-and-chat/index.mjs` | 主入口 `startBossAutoBrowse(hooks, opts)`：浏览器启动、登录、主循环 |
| `packages/boss-auto-browse-and-chat/candidate-processor.mjs` | `parseCandidateList`、`filterCandidates`、`scrollAndLoadMore`、`navigateToNextPage` |
| `packages/boss-auto-browse-and-chat/chat-handler.mjs` | `viewCandidateDetail`、`startChatWithCandidate`、`processCandidate`、`checkDailyLimit` |
| `packages/boss-auto-browse-and-chat/resume-extractor.mjs` | 网络拦截 + Canvas iframe hook，提取 Canvas 简历文字 |
| `packages/boss-auto-browse-and-chat/constant.mjs` | 所有 CSS 选择器与 URL 常量 |
| `packages/boss-auto-browse-and-chat/humanMouse.mjs` | `createHumanCursor(page)` — ghost-cursor 人类鼠标轨迹 |

---

## 2. 页面架构：主页面 + iframe（关键）

推荐牛人页使用 **两层 iframe** 架构，这是候选人列表选择器长期失效的根本原因：

```
主页面（/web/chat/recommend）
  └── iframe[name="recommendFrame"]                    ← 候选人列表在此 iframe 内！
        src="/web/frame/recommend/?jobid=...&version=XXXX"
        └── div.recommend-list-wrap
              └── div#recommend-list.list-wrap.card-list-wrap
                    └── div.list-body
                          └── ul.card-list            ← CANDIDATE_LIST_SELECTOR
                                └── li.card-item      ← CANDIDATE_ITEM_SELECTOR
                                      └── div.candidate-card-wrap
                                            └── div.card-inner[data-geek][data-geekid]
                                                  ├── div.col-1
                                                  │     ├── div.avatar-wrap > img.avatar
                                                  │     └── div.salary-wrap > span       ← 薪资
                                                  ├── div.col-2
                                                  │     ├── div.row.name-wrap
                                                  │     │     └── span.name              ← 姓名
                                                  │     ├── div.row
                                                  │     │     └── div.join-text-wrap.base-info > span × N
                                                  │     │           └── 年龄 / 工作年限 / 学历 / 求职状态
                                                  │     └── div.row.row-flex.expect-wrap
                                                  │           └── span.content > div.join-text-wrap > span × N
                                                  │                 └── 期望城市 / 期望职位
                                                  └── div.operate-side
                                                        └── div.button-chat-wrap.button-chat
                                                              └── button.btn.btn-greet   ← 打招呼（CHAT_START_BUTTON_SELECTOR）
```

点击候选人卡片后，主页面弹出详情 dialog（不在 iframe 内）：

```
主页面 dialog（点击卡片后弹出）
  └── div.boss-popup__wrapper.dialog-lib-resume.recommendV2
        └── div.lib-resume-recommend.wasm-resume-layout
              ├── div.resume-detail-wrap
              │     └── iframe[src="/web/frame/c-resume/?source=recommend"]  ← 简历 Canvas 在此 iframe 内
              │           └── canvas#resume                                   ← WASM 解密后绘制
              └── div.resume-right-side                                       ← 右侧操作区（在主页面）
                    └── div.button-list-wrap > div.button-chat-wrap.resumeGreet
                          └── button.btn-v2.btn-sure-v2.btn-greet             ← 也可点此打招呼
```

**关键 data 属性：**
- `div.card-inner[data-geek]` — encryptGeekId（用于去重、写 DB）
- `div.base-info span` 含"年"字 → workExp；含学历关键词 → education

**操作对象分工：**
- **`recommendFrame`（iframe Frame 对象）**：parseCandidateList、scrollAndLoadMore、查找 btn-greet
- **主页面 `page`**：「知道了」弹窗、风控检测、CHAT_INPUT_SELECTOR、checkDailyLimit

---

## 3. 选择器常量（constant.mjs）

所有候选人列表选择器均在 **iframe Frame** 内使用，不在主页面：

```js
// 在 recommendFrame（iframe）内使用
CANDIDATE_LIST_SELECTOR      = 'ul.card-list'
CANDIDATE_ITEM_SELECTOR      = 'ul.card-list > li.card-item'
CANDIDATE_NAME_SELECTOR      = 'span.name'
CANDIDATE_DETAIL_SELECTOR    = ''                              // 无独立详情面板

CHAT_START_BUTTON_SELECTOR   = 'button.btn-greet'             // 在 li.card-item 内
CONTINUE_CHAT_BUTTON_SELECTOR = 'div.operate-side div.button-chat'

// 在主页面（page）使用
GREETING_SENT_KNOW_BTN_SELECTOR = 'div.dialog-wrap button.btn-sure-v2'
CHAT_INPUT_SELECTOR          = '#boss-chat-global-input'
RESUME_POPUP_CLOSE_SELECTOR = 'div.boss-popup__close'   // 简历详情弹窗关闭

// 在 recommendFrame（iframe）内使用，每条 card-item 内
NOT_INTERESTED_IN_ITEM_SELECTOR = 'div.tooltip-wrap.suitable'  // 不感兴趣（点击后弹出原因）
NOT_INTERESTED_REASON_POPUP_SELECTOR = 'div.card-reason-f1.show'  // 原因弹窗
NOT_INTERESTED_REASON_ITEMS_SELECTOR = 'div.card-reason-f1.show span.first-reason-item'  // 所有选项，按 NOT_INTERESTED_REASON_MAP 匹配
NOT_INTERESTED_REASON_MAP = { city:'牛人距离远', education:'不考虑本科', salary:'期望薪资偏高', workExp:'工作经历和制剂研发无关', viewed:'重复推荐', skills:'其他原因', blockName:'其他原因' }
NOT_INTERESTED_REASON_FALLBACK = '其他原因'

BOSS_RECOMMEND_PAGE_URL      = 'https://www.zhipin.com/web/chat/recommend'
BOSS_CHAT_INDEX_URL          = 'https://www.zhipin.com/web/chat/index'
```

---

## 4. 主循环流程（startBossAutoBrowse）

```
startBossAutoBrowse(hooks, { returnBrowser? })
  1. hooks.beforeBrowserLaunch
  2. puppeteer.launch({ headless, viewport: 1440×760 })
  3. page（单 Tab） → BOSS_RECOMMEND_PAGE_URL（注入 cookie + localStorage）
  4. 登录检测：URL 未在推荐页则等待用户手动登录（最长 5 分钟）→ storeStorage()
  5. page.waitForSelector('iframe[name="recommendFrame"]')  → recommendFrameHandle
  6. recommendFrameHandle.contentFrame()  → recommendFrame（iframe Frame 对象）
  7. recommendFrame.waitForSelector('ul.card-list > li.card-item', 30s)
  8. setupNetworkInterceptor(page)        // 拦截 resume/geek/info API（主页面）
  9. setupCanvasTextHook(page)            // MutationObserver 注入 c-resume iframe fillText hook
  10. 读取 boss-recruiter.json / candidate-filter.json
  11. hooks.onCandidateListLoaded（GUI 登录状态 fulfilled）

  主循环 while(true):
    a. parseCandidateList(recommendFrame)    → candidates[]   ← 在 iframe frame 内操作
       ├── 方式一：Vue __vue__ / __vueParentComponent 获取数据（自动解析所有字段）
       └── 方式二（兜底）：DOM 解析
             · encryptGeekId ← div.card-inner[data-geek]
             · geekName      ← span.name
             · salary        ← div.salary-wrap span
             · workExp       ← div.base-info span（匹配 /年|经验不限/）
             · education     ← div.base-info span（匹配学历关键词）
             · city          ← div.expect-wrap span.content div.join-text-wrap span[0]
             · jobTitle      ← div.expect-wrap span.content div.join-text-wrap span[1]

    b. filterCandidates(candidates, filterConfig) + hooks.onCandidateFiltered
       筛选条件：city / education / workExp / salary / skills / blockName

    c. for each matched candidate (index i):
         checkDailyLimit(page)            → 已达上限则 break mainLoop   ← 在主页面检测
         chatCount >= maxChatPerRun       → break mainLoop
         processCandidate(recommendFrame, candidate, config, hooks, { candidateIndex: i, mainPage: page })
           └── viewCandidateDetail(recommendFrame, candidate, { candidateIndex: i })
                 · 拟人 cursor 点击 li.card-item[i]（展开，在 iframe 内）
                 · 从 DOM / 网络拦截 / Canvas 提取简历文字
           └── startChatWithCandidate(recommendFrame, candidate, greetingMessage, { candidateIndex: i, mainPage: page })
                 · 在 recommendFrame 的 li.card-item[i] 内找 button.btn-greet → cursor.click()（iframe 内）
                 · mainPage.waitForSelector('div.dialog-wrap button.btn-sure-v2', 6s)（主页面等弹窗）
                 · cursor.click(knowBtn BoundingBox)（知道了，主页面弹窗）
                 · recommendFrame 内找 CONTINUE_CHAT_BUTTON_SELECTOR → click()（可选）
                 · mainPage 的 CHAT_INPUT_SELECTOR 输入 greetingMessage → Enter（可选）
           └── hooks.afterChatStarted(candidate, chatResult)
           └── sleepWithRandomDelay(delayBetweenChats)
         chatResult.success → chatCount++, hooks.onProgress({ phase:'recommend', current, max })
         chatResult.reason === DAILY_LIMIT_REACHED / RISK_CONTROL → break mainLoop

    d. scrollAndLoadMore(recommendFrame)   ← 在 iframe frame 内滚动
         · page.mouse.wheel 小步随机滚动（3 轮 × 4 步，每步 25-40px，间隔 80-160ms）
         · 检测页面文本 /没有更多|已经到底/ 或 Vue hasMore===false → return false
         · false → break mainLoop（已加载全部）

  10. hooks.onComplete
  11. returnBrowser ? return { browser, page } : browser.close()
```

---

## 5. 候选人简历弹窗（动态弹出的详情）

点击 `li.card-item` 后，页面弹出一个动态 dialog，内含 iframe 渲染的完整简历：

```html
<!-- 弹窗容器 -->
<div class="boss-popup__wrapper dialog-lib-resume recommendV2">
  <div class="lib-resume-recommend wasm-resume-layout">
    <!-- 简历内容区：通过 iframe 渲染 -->
    <iframe src="/web/frame/c-resume/?source=recommend" frameborder="0">
      <!-- iframe 内部：WASM 解密后渲染到 Canvas -->
      <canvas id="resume" width="1448" height="1478" style="width:724px;height:739px"></canvas>
    </iframe>
    <!-- 右侧操作区（非 iframe） -->
    <div class="resume-simple-box">
      <!-- 经历概览：仅包含摘要，非完整简历 -->
      <div class="resume-summary"> ... </div>
      <!-- 打招呼按钮（popup 内也有，与列表项内 btn-greet 同效） -->
      <button class="btn-v2 btn-sure-v2 btn-greet">打招呼</button>
    </div>
  </div>
</div>
```

**Canvas 简历提取（setupCanvasTextHook）：**

- WASM（Base64+AES-256 解密）在 iframe 内逐字调用 `fillText` 绘制到 `#resume`
- 主页面的 `evaluateOnNewDocument` 不影响 iframe，因此注入方式为：
  ```
  主页面注入 MutationObserver
    → 监听 iframe[src*="c-resume"] 创建
    → iframe.addEventListener('load', ...)
    → 在 iframe.contentWindow.CanvasRenderingContext2D.prototype 上用 Proxy 包装 fillText
    → 收集 { text, x, y } 到主页面 window.__canvasCapturedText
  ```
- 提取后用 `extractResumeText()` 按 y 坐标分行、x 排序拼字 → 返回 `string[]`
- 双层 Canvas 导致每字绘制两次，`extractResumeText` 通过 `Y_THRESHOLD=5px` 分组已自动处理

---

## 6. 打招呼完成弹窗

打招呼成功后，页面弹出"已向牛人发送招呼"：

```html
<div class="dialog-wrap active" data-type="boss-dialog">
  <div class="boss-popup__wrapper dialog-default-v2">
    <div class="boss-dialog__body">
      <div class="tip-title"><span class="title">已向牛人发送招呼</span></div>
      <div class="tip-con">你好，我们公司正在招聘研究员，请问考虑吗</div>
    </div>
    <div class="buttons">
      <label class="checkbox"><input type="checkbox" name="notip"> 不再显示</label>
      <button type="button" class="btn-v2 btn-sure-v2">知道了</button>  <!-- GREETING_SENT_KNOW_BTN_SELECTOR -->
    </div>
  </div>
</div>
```

`GREETING_SENT_KNOW_BTN_SELECTOR = 'div.dialog-wrap button.btn-sure-v2'`

---

## 6.5 不感兴趣与原因弹窗

对未通过筛选的候选人点击卡片上的"不感兴趣"（`div.tooltip-wrap.suitable`）后，**会先弹出原因选择弹窗**（在 iframe 内），须选一项后弹窗才关闭、该候选人才从列表移除。

**弹窗结构（iframe 内，与列表同属 recommendFrame）：**

```html
<div class="card-reason-f1 show" showcandidatecard="true">
  <div class="bg"></div>
  <div class="reason-group">
    <dl>
      <dt>选择不喜欢的原因，为您优化推荐</dt>
      <dd class="first-reason-list-warp">
        <span class="first-reason-item">牛人距离远</span>
        <span class="first-reason-item">不考虑本科</span>
        <span class="first-reason-item">期望薪资偏高</span>
        <!-- ... 更多选项 ... -->
        <span class="first-reason-item">其他原因</span>
      </dd>
    </dl>
  </div>
  <div class="close-icon">...</div>
</div>
```

**流程：**

1. 悬停到候选人卡片 → 点击"不感兴趣"（`NOT_INTERESTED_IN_ITEM_SELECTOR`）
2. 等待原因弹窗出现：`NOT_INTERESTED_REASON_POPUP_SELECTOR = 'div.card-reason-f1.show'`（iframe 内）
3. 按**筛选原因**在弹窗内选对应选项（见下表），以便 BOSS 优化推荐；未匹配时选"其他原因"
4. 弹窗关闭，该条从列表移除

**筛选原因 → 弹窗选项（constant.mjs `NOT_INTERESTED_REASON_MAP`）：**

| 筛选 reason（candidate-processor） | 弹窗选项文案 |
|-----------------------------------|--------------|
| `city`                            | 牛人距离远   |
| `education`                       | 不考虑本科   |
| `salary`                          | 期望薪资偏高 |
| `workExp`                         | 工作经历和制剂研发无关 |
| `viewed`                          | 重复推荐     |
| `skills` / `blockName`            | 优先选文案包含"与职位不符"的选项（如"期望（xxx）与职位不符"），否则"其他原因" |
| 其他/未知                         | 其他原因     |

**选择器与常量（constant.mjs）：**

- `NOT_INTERESTED_IN_ITEM_SELECTOR`：卡片内"不感兴趣"区域
- `NOT_INTERESTED_REASON_POPUP_SELECTOR`：原因弹窗容器
- `NOT_INTERESTED_REASON_ITEMS_SELECTOR`：弹窗内所有 `span.first-reason-item`，按文案匹配
- `NOT_INTERESTED_REASON_MAP`：reason → 弹窗文案
- `NOT_INTERESTED_REASON_POSITION_MISMATCH`：用于 skills/blockName 的包含匹配（"与职位不符"）
- `NOT_INTERESTED_REASON_FALLBACK`：无匹配时使用（"其他原因"）

**扩展（后续可做）：** 可将 `filterResult.reasonDetail` 或候选人信息交给 LLM，由 LLM 返回更贴切的弹窗选项文案，再在 `span.first-reason-item` 中做模糊匹配点击，进一步优化 BOSS 推荐效果。

---

## 7. 每日限额检测（checkDailyLimit）

通过 `document.body.innerText` 匹配文字特征判断，无独立 API：

```
/今日已沟通\s*(\d+)\s*\/\s*(\d+)/   → count/max 数字解析
/今日沟通人数已达上限|明天再来|今日.*已达上限/  → 直接判定 limitReached=true
```

风控检测（在 `startChatWithCandidate` 点击打招呼后立即检测）：

```
/风控|存在风险|请稍后再试|操作过于频繁/  → reason: RISK_CONTROL
```

---

## 8. 滚动加载（scrollAndLoadMore）

推荐牛人页为**无限滚动**，无分页按钮。滚动使用 `page.mouse.wheel()` 模拟人工：

```
maxScrolls = 3, stepsPerScroll = 4
每步：deltaY = 25~40px，间隔 80~160ms
```

到底判断：
1. `document.body.innerText` 含 `/没有更多|已经到底|加载完毕|暂无更多/`
2. Vue `el.__vue__?.hasMore === false`

两者均为"没有更多"时返回 `false`，主循环退出。

---

## 9. 反检测机制

- **puppeteer-extra-plugin-stealth** — 抹除 headless 特征
- **@geekgeekrun/puppeteer-extra-plugin-laodeng** — 自定义指纹混淆
- **puppeteer-extra-plugin-anonymize-ua** — 随机 UserAgent（`makeWindows: false`）
- **ghost-cursor** — `createHumanCursor(page)` 所有点击走人类轨迹，不用 `page.click()`
- **sleepWithRandomDelay** — 操作间随机延迟
- Canvas hook 用 **Proxy**（不直接替换 prototype），`fillText.toString()` 仍返回 `[native code]`

---

## 10. 配置文件

**boss-recruiter.json**（`~/.geekgeekrun/config/boss-recruiter.json`）：
```json
{
  "logLevel": "info",
  "targetJobId": "",
  "recommendPage": {
    "clickNotInterestedForFiltered": true,
    "skipViewedCandidates": false,
    "runOnceAfterComplete": false
  },
  "autoChat": {
    "greetingMessage": "你好，...",
    "maxChatPerRun": 50,
    "delayBetweenChats": [3000, 8000]
  }
}
```
- `logLevel`：日志级别 `"debug"` | `"info"` | `"warn"` | `"error"`；设为 `"debug"` 时每次自动操作（解析、悬停、点击不感兴趣、选原因等）都会打印日志，便于排查。
- `recommendPage.clickNotInterestedForFiltered`：对未通过筛选的候选人点击"不感兴趣"（卡片内 `div.tooltip-wrap.suitable`），并自动在原因弹窗中选择一项（默认"其他原因"）后关闭，避免重复扫描；设为 `false` 可关闭便于调试。
- `recommendPage.skipViewedCandidates`：是否跳过已读候选人（卡片带 `has-viewed` 的项）；与 candidate-filter 的 `skipViewedCandidates` 一致，以 boss-recruiter 为准。
- `recommendPage.runOnceAfterComplete`：单次运行结束后是否停止（不再次启动）；`true` 时 worker 只跑一轮后退出。
- `recommendPage.delayBetweenNotInterestedMs`：每次点击"不感兴趣"（含原因选择）之间的延迟 [min, max] 毫秒，在此区间随机，用于反检测；默认 `[800, 2500]`。
- `recommendPage.keepBrowserOpenAfterRun`：单轮结束后是否保持浏览器打开（仅招聘端推荐页，不影响应聘端；需同时开启 runOnceAfterComplete）；开启时关闭浏览器窗口后 worker 再退出。

**candidate-filter.json**（`~/.geekgeekrun/config/candidate-filter.json`）：
```json
{
  "expectCityList": ["北京", "上海"],
  "expectEducationList": ["本科", "硕士"],
  "expectWorkExpRange": [1, 5],
  "expectSalaryRange": [15, 50],
  "expectSalaryWhenNegotiable": "exclude",
  "expectSkillKeywords": ["Vue", "React"],
  "blockCandidateNameRegExpStr": "测试|内推",
  "skipViewedCandidates": false
}
```
筛选未通过时日志会打印原因，`reason` 可能为：`city` / `education` / `workExp` / `salary` / `skills` / `blockName` / `viewed`。

`expectSalaryRange` 单位：千/月（K）。配置可填 K 或元：若数值 ≥100 会按元自动折成 K（如 8000→8K）。薪资解析：`parseSalaryRange()` 支持 `3-5K`、`10-15K`、`20-30K`（万自动 ×10）。  
`expectSalaryWhenNegotiable`：候选人薪资为"面议"或无法解析时 — `exclude`（默认）= 不通过，`include` = 通过（不因薪资排除）。

---

## 11. Hooks（推荐页用到的）

| Hook | 参数 | 触发时机 |
|------|------|---------|
| `beforeBrowserLaunch` | — | 浏览器启动前 |
| `afterBrowserLaunch` | — | 浏览器启动后、导航前 |
| `beforeNavigateToRecommend` | — | Tab1/Tab2 导航前 |
| `onCandidateListLoaded` | — | 登录成功、列表可用时（触发 GUI progress fulfilled） |
| `onCandidateFiltered` | `(candidates, filterResult)` | 每轮筛选完成（waterfall，可修改结果） |
| `beforeStartChat` | `(candidate)` | 开始处理单个候选人前 |
| `afterChatStarted` | `(candidate, chatResult)` | 打招呼完成后（成功或失败） |
| `onProgress` | `{ phase:'recommend', current, max }` | 每次打招呼成功后 |
| `onError` | `(error)` | 主循环抛出异常 |
| `onComplete` | — | 主循环正常结束 |
