# 沟通页 Tab 导航行为与「新招呼 + 未读」初始化设计

## 背景

本文档记录 **招聘端沟通页**（`/web/chat/index`）左侧会话列表的 Tab 结构、
正确的导航顺序、已知的 BOSS 前端刷新特性，以及对应的自动化实现设计。

相关代码：
- `packages/boss-auto-browse-and-chat/chat-page-processor.mjs` — `startBossChatPageProcess`
- `packages/boss-auto-browse-and-chat/constant.mjs` — 所有选择器

---

## 1. 沟通页左侧面板的 UI 层次

沟通页左侧面板存在**两套独立的过滤控件**，功能和 DOM 结构完全不同，容易混淆：

### 1-A. 会话类型 Tab（`.chat-label-item`）

位于左侧列表的顶部，按**消息来源类型**分类：

| Tab 名称 | DOM 选择器 | 选中态 class | 含义 |
|---------|-----------|------------|------|
| 全部 | `.chat-label-item[title="全部"]` | `selected` | 不限类型 |
| **新招呼** | `.chat-label-item[title="新招呼"]` | `selected` | 候选人主动发来的第一条招呼 |
| 沟通中 | `.chat-label-item[title="沟通中"]` | `selected` | 已有来回消息的会话 |
| 已获取简历 | `.chat-label-item[title="已获取简历"]` | `selected` | 简历已获取 |
| 已交换微信 | `.chat-label-item[title="已交换微信"]` | `selected` | 微信已交换 |

> **注意**：选中态 class 是 `selected`，不是 `active`。`switchToTab` 的默认 active
> 检测用的是 `active`，因此对 `.chat-label-item` tab 不要依赖 active 检测，
> 应使用 `force: true` 强制点击。

### 1-B. 已读/未读状态 Tab（`.chat-message-filter-left span`）

位于 1-A 之下，按**已读/未读状态**过滤当前类型内的会话：

| Tab 名称 | DOM 选择器 | 选中态 class | 含义 |
|---------|-----------|------------|------|
| 全部 | `.chat-message-filter-left span:nth-child(1)` | `active` | 不限已读/未读 |
| **未读** | `.chat-message-filter-left span:nth-child(2)` | `active` | 只显示未读会话 |

> 这里的"全部"与 1-A 的"全部"是**不同的控件**，选择器、class 名、语义均不同，
> 不要混淆。

---

## 2. 正确的手动操作顺序（同事记录的复现路径）

```
1. 点击「全部职位」（展开顶部职位下拉框）
2. 点击目标职位（如「实验室技术员」）→ 会话列表切换为该职位
3. 点击「新招呼」（1-A tab）→ 只显示候选人主动打招呼的会话
4. 点击「未读」（1-B tab）→ BOSS 刷新未读列表
5. 开始逐条处理
```

步骤 3（新招呼）和步骤 4（未读）缺一不可：

- **省略步骤 3** → 在「全部类型」下，工具会看到「沟通中」「已获取简历」等其他类型的候选人，
  处理范围远超预期（遍历全部职位的全部类型消息）。
- **省略步骤 4 或不强制点击** → BOSS 不刷新列表，上次已处理（已读）的候选人会继续出现，
  导致重复操作（详见第 3 节）。

---

## 3. BOSS 「未读」列表不自动刷新的特性

BOSS 直聘沟通页的**未读会话列表不会自动轮询刷新**。
以下两种操作能使其刷新：

1. **整页 reload**（`page.reload()` 或 F5）
2. **手动点击「未读」tab**

如果程序已在「未读」tab 停留，且直接解析 DOM，解析到的是**上次点击时的快照**，
而非当前真实未读状态。已处理（点击后已读）的会话不会从列表消失。

### 旧代码的 bug

`switchToTab` 的实现含有如下提前返回逻辑：

```js
if (isActive) {
  logDebug(`已在「${tabName}」tab`)
  return  // ← 跳过了点击，BOSS 不会刷新列表
}
```

如果上次运行结束时页面停留在「未读」tab，下次运行到达这段代码时，
`isActive === true`，点击被跳过 → 列表未刷新 → 已处理的候选人被重复遍历。

### 修复方案

在每次 `startBossChatPageProcess` 进入处理循环前，用 `force: true` 强制点击
「新招呼」和「未读」，绕过 active 检测：

```js
await switchToTab(CHAT_PAGE_TAB_NEW_GREET_SELECTOR, '新招呼', { force: true })
await sleepWithRandomDelay(300, 500)
await switchToTab(CHAT_PAGE_UNREAD_FILTER_SELECTOR, '未读', { force: true })
await sleepWithRandomDelay(400, 600)
```

`switchToTab` 签名改为：

```js
const switchToTab = async (selector, tabName, opts = {}) => {
  if (!opts.force) {
    // 检测 active class，已激活则跳过（用于非刷新场景）
  }
  // ... 拟人点击 ...
}
```

---

## 4. 职位下拉框（`.chat-top-job`）的切换逻辑

沟通页顶部有职位筛选下拉框，切换后左侧列表只显示该职位的会话。

| DOM 元素 | 常量名 | 说明 |
|---------|-------|------|
| 触发按钮 | `CHAT_PAGE_JOB_DROPDOWN_SELECTOR` | `.chat-top-job .ui-dropmenu-label` |
| 展开后列表项 | `CHAT_PAGE_JOB_ITEM_SELECTOR` | `.chat-top-job .ui-dropmenu-list li` |

切换函数：`switchChatPageJobId(page, jobId)`（同文件内部函数）。

- `jobId === '-1'` 或 `jobId == null` → 不切换（使用当前选中的全部职位）
- 切换后等待 400–700 ms 让列表刷新
- 若下拉列表中未找到目标 jobId，会打印 warning 并跳过（不抛异常）

> **调试提示**：如果切换职位后列表仍显示所有职位的消息，
> 先确认 `boss-jobs-config.json` 中的 `jobId` 字段值与 BOSS 页面
> 下拉框 `li[value]` 的值一致（通过 sync-boss-job-list IPC 同步可以保证这一点）。

---

## 5. 完整的 Tab 初始化序列（当前实现）

每次调用 `startBossChatPageProcess` 时，按以下顺序执行：

```
1. 确认当前在沟通页 URL（否则 goto）
2. setupNetworkInterceptor
3. waitForSelector(CHAT_PAGE_ITEM_SELECTOR, timeout=15s)
4. switchChatPageJobId（若 jobId 有效）
5. 【新招呼 force】switchToTab(CHAT_PAGE_TAB_NEW_GREET_SELECTOR, { force: true })
6. 【未读 force】switchToTab(CHAT_PAGE_UNREAD_FILTER_SELECTOR, { force: true })
7. [可选] retryCandidate：
     switchToTab(ALL_FILTER, '全部')       ← 找已读候选人
     processOneCandidateConversation(...)
     switchToTab(UNREAD_FILTER, '未读')    ← 切回（不 force，正常切换即可）
8. parseConversationList → process loop
```

步骤 5–6 的「强制点击」保证无论上次运行的终止状态如何，都能进入正确的筛选视图，
且触发 BOSS 的未读列表数据刷新。

---

## 6. 验证 Tab 初始化是否生效的方法

### 日志关键字

成功路径（`logLevel: 'info'` 或更详细）应出现：

```
[chat-page-processor] 切换到「新招呼」tab...
[chat-page-processor] 「新招呼」tab 切换后列表已刷新
[chat-page-processor] 切换到「未读」tab...
[chat-page-processor] 「未读」tab 切换后列表已刷新
```

失败路径（元素未找到）：

```
[chat-page-processor] 未找到「新招呼」tab 元素（selector: .chat-label-item[title="新招呼"]）
```

### 如果「新招呼」tab 找不到

可能原因：
1. **BOSS 更新了 DOM**：登录后手动打开沟通页，检查是否存在 `.chat-label-item[title="新招呼"]`
2. **账号下没有「新招呼」分类**：部分账号/状态下该 tab 不显示（如没有招聘职位），
   此时 `switchToTab` 会打印 warning 并继续，不影响后续流程（降级为当前 tab）
3. **中文 title 属性编码差异**：用浏览器控制台 `document.querySelector('.chat-label-item[title="新招呼"]')` 确认

### 如果处理后候选人仍然重复出现

检查步骤：
1. 确认日志中「未读」tab 的点击确实发生（不是 skip 返回）
2. 确认 `CHAT_PAGE_UNREAD_FILTER_SELECTOR` 指向的是 `span:nth-child(2)` 而不是第 1 个
3. 候选人可能已在数据库 `encryptGeekId` 记录中但未标记为 `contacted`，
   此时会被 `checkIfAlreadyContacted` 放过 → 检查数据库记录

---

## 7. retryCandidate 流程与 Tab 状态

`retryCandidate` 是验证中断恢复流程（被 BOSS 安全验证打断时），此阶段 Tab 状态：

| 步骤 | 1-A 类型 tab | 1-B 状态 tab | 说明 |
|------|------------|------------|------|
| 进入 retry 前 | 新招呼（force 切入） | 未读（force 切入） | 初始化阶段已设置 |
| retry 内切换 | 新招呼（保持） | **全部** | 候选人已读，需看全部 |
| retry 结束 | 新招呼（保持） | **未读** | 切回，准备正常扫描 |
| 正常扫描 | 新招呼 | 未读 | 初始化状态，直接 parseConversationList |

retry 结束时的 `switchToTab(UNREAD, '未读')` 不需要 `force: true`，
因为这只是从「全部」切回「未读」的正常操作，BOSS 会正常刷新列表。

---

## 8. 相关文件

| 文件 | 作用 |
|------|------|
| `packages/boss-auto-browse-and-chat/chat-page-processor.mjs` | `startBossChatPageProcess`、`switchChatPageJobId`、`switchToTab` |
| `packages/boss-auto-browse-and-chat/constant.mjs` | 所有 tab/选择器常量（`CHAT_PAGE_TAB_NEW_GREET_SELECTOR` 等） |
| `packages/ui/src/main/flow/BOSS_CHAT_PAGE_MAIN/index.ts` | Worker 入口，读取 `boss-jobs-config.json` 并按职位循环调用 `startBossChatPageProcess` |
| `plan/multi-job-switching.md` | 多职位配置文件结构、`sync-boss-job-list` IPC 实现 |
| `plan/boss_auto_browse_tabs.md` | 推荐牛人页与沟通页双 Tab 架构总览 |
