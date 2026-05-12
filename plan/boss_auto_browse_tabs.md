# 招聘端自动浏览：沟通 / 推荐牛人 双 Tab 逻辑

本文档描述招聘端自动化（boss-auto-browse-and-chat）中 **「沟通」与「推荐牛人」分两个浏览器 Tab** 的设计、URL、选择器及主流程，便于后续维护与排查。

---

## 1. 为什么分成两个 Tab

- **沟通**（`/web/chat/index`）：左侧会话列表、聊天窗口、查看在线简历/附件简历等，入口多为「沟通」。
- **推荐牛人**（`/web/chat/recommend`）：候选人列表、打招呼、继续沟通等，入口为「推荐牛人」。

若在同一个 Tab 内通过侧栏切换，容易出现：

- 登录后默认落在「沟通」页，列表选择器针对的是推荐页 DOM，解析到 0 人；
- 同一页面来回切换容易与 BOSS 前端状态/路由耦合，增加超时与不稳定。

因此采用 **两个独立 Tab**：Tab1 固定为沟通页，Tab2 固定为推荐牛人页；主循环（解析列表、筛选、打招呼）**只操作推荐牛人 Tab**，沟通 Tab 仅作展示或后续扩展（如从沟通页拉会话列表）。

---

## 2. Tab 与 URL 对应关系

| Tab | 用途 | URL | 常量名 |
|-----|------|-----|--------|
| **Tab1（首个页面）** | 沟通 | `https://www.zhipin.com/web/chat/index` | `BOSS_CHAT_INDEX_URL` / `BOSS_CHAT_PAGE_URL` |
| **Tab2（新建页面）** | 推荐牛人 | `https://www.zhipin.com/web/chat/recommend` | `BOSS_RECOMMEND_PAGE_URL` |

- 代码中：`pageChat` = Tab1，`page`（推荐牛人） = Tab2。
- Cookie / localStorage 在浏览器上下文中共享，两个 Tab 都会带上登录态；为保险起见，当前实现会在两个 Tab 加载前对首个页面注入 Cookie，再对推荐牛人 Tab 单独注入一次后 `goto` 推荐页。

---

## 3. 主流程顺序（index.mjs 简版）

1. **Launch 浏览器**，得到 `pageChat = browser.pages()[0]`。
2. **Tab1 沟通**：`pageChat.goto(BOSS_CHAT_INDEX_URL)`，注入 Cookie + `setDomainLocalStorage`。
3. **Tab2 推荐牛人**：`page = await browser.newPage()`，注入 Cookie，`page.goto(BOSS_RECOMMEND_PAGE_URL)`，`page.bringToFront()`。
4. **登录检测**：在 `page`（推荐牛人 Tab）上根据 URL 判断是否在推荐页且未跳转登录；若需登录则等待用户在该 Tab 内登录，再 `storeStorage`。
5. **网络/Canvas 拦截**：仅对 `page` 设置 `setupNetworkInterceptor`、`setupCanvasTextHook`。
6. **主循环**：解析列表、筛选、打招呼、滚动加载等 **全部在 `page`（推荐牛人 Tab）上执行**；`pageChat` 不参与主循环。

---

## 4. 推荐牛人页选择器（主循环用）

主循环依赖的列表与操作均在 **推荐牛人 Tab** 上，选择器见 `packages/boss-auto-browse-and-chat/constant.mjs`：

| 常量 | 说明 |
|------|------|
| `CANDIDATE_LIST_SELECTOR` | 候选人列表容器 |
| `CANDIDATE_ITEM_SELECTOR` | 单条候选人条目 |
| `CANDIDATE_NAME_SELECTOR` | 条目内姓名 |
| `CHAT_START_BUTTON_SELECTOR` | 打招呼按钮 |
| `GREETING_SENT_KNOW_BTN_SELECTOR` | 弹窗「知道了」 |
| `CONTINUE_CHAT_BUTTON_SELECTOR` | 继续沟通 |
| `CHAT_INPUT_SELECTOR` | 聊天输入框（如 `#boss-chat-global-input`） |

---

## 5. 沟通页选择器（沟通 Tab / 后续扩展）

沟通 Tab 当前主要用于展示；若后续做「沟通页会话列表遍历、要简历」等，会用到以下选择器（同上 constant.mjs）：

| 常量 | 说明 |
|------|------|
| `CHAT_PAGE_USER_LIST_SELECTOR` | 左侧会话列表容器 |
| `CHAT_PAGE_ITEM_SELECTOR` | 单条会话 item |
| `CHAT_PAGE_NAME_SELECTOR` / `CHAT_PAGE_JOB_SELECTOR` | 会话项内姓名、职位 |
| `CHAT_PAGE_UNREAD_FILTER_SELECTOR` | 未读筛选按钮 |
| `CHAT_PAGE_ONLINE_RESUME_SELECTOR` 等 | 在线简历、附件简历、下载 PDF 等 |

沟通页列表结构也可参考 `examples/沟通-列表.md`。

---

## 6. 侧栏「推荐牛人」入口（仅作备用）

若将来不再使用双 Tab，而改回单 Tab 内切换，可使用：

- **选择器**：`RECOMMEND_MENU_BUTTON_SELECTOR` = `#wrap > div.side-wrap.side-wrap-v2 > div > dl.menu-recommend > dt > a`
- 当前主流程 **已不再使用** 该选择器，推荐牛人逻辑仅在 Tab2 的 `BOSS_RECOMMEND_PAGE_URL` 上执行。

---

## 7. 相关文件

- 主流程：`packages/boss-auto-browse-and-chat/index.mjs`（双 Tab 创建、推荐牛人 Tab 主循环）
- 选择器与 URL：`packages/boss-auto-browse-and-chat/constant.mjs`
- 沟通页简历流程：`plan/chat_page_resume_flow.md`
