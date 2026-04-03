# 多职位切换功能实现计划

## Context

当前招聘端自动化只支持单一全局配置（`boss-recruiter.json`），对所有职位使用相同的候选人筛选规则、招呼语和执行策略。用户需要：

1. **同步职位列表** — 从浏览器获取当前账号下的职位列表
2. **分职位独立配置** — 每个职位独立保存筛选规则、招呼语等配置（无全局 fallback，必须每职位单独配置；允许从其他职位拷贝后修改）
3. **自动顺序执行支持多职位** — 可选择哪几个职位执行，以及每个职位各执行推荐还是沟通（或两者）

---

## 配置文件结构设计

所有多职位相关配置合并到 **单个文件** `~/.geekgeekrun/config/boss-jobs-config.json`。

### 新文件: `~/.geekgeekrun/config/boss-jobs-config.json`

```json
{
  "lastSyncAt": "2026-03-18T00:00:00Z",
  "jobs": [
    {
      "jobId": "297790627",
      "jobName": "研究员 _ 杭州 12-18K",
      "sequence": {
        "enabled": true,
        "runRecommend": true,
        "runChat": true
      },
      "filter": {
        "expectCityEnabled": true,
        "expectCityList": ["杭州"],
        "expectEducationEnabled": false,
        "expectEducationRegExpStr": "",
        "expectWorkExpMinEnabled": false,
        "expectWorkExpMaxEnabled": false,
        "expectWorkExpRange": [0, 99],
        "expectSalaryMinEnabled": false,
        "expectSalaryMaxEnabled": false,
        "expectSalaryRange": [0, 0],
        "expectSalaryWhenNegotiable": "exclude",
        "resumeKeywordsEnabled": false,
        "resumeKeywords": [],
        "resumeRegExpEnabled": false,
        "resumeRegExpStr": "",
        "resumeLlmEnabled": false,
        "resumeLlmRule": ""
      }
    }
  ]
}
```

**设计说明：**
- 每个 `filter` 字段都有对应的 `*Enabled` 布尔值，UI 中每行均有 checkbox 控制是否启用
- **无全局 fallback** — 每个职位必须独立配置，不再读取或合并全局 `candidate-filter.json`
- `filter` 统一包含推荐牛人页、沟通页的所有筛选字段（字段按适用页面有标注）
- `sequence` 控制该职位在自动顺序执行中的角色

**字段适用页面：**
- `expectCityEnabled/expectCityList` — 推荐牛人页 + 沟通页
- `expectEducationEnabled/expectEducationRegExpStr` — 推荐牛人页 + 沟通页
- `expectWorkExpMinEnabled/expectWorkExpMaxEnabled/expectWorkExpRange` — 推荐牛人页 + 沟通页（上下限各自独立开关）
- `expectSalaryMinEnabled/expectSalaryMaxEnabled/expectSalaryRange/expectSalaryWhenNegotiable` — 推荐牛人页 + 沟通页（上下限各自独立开关）
- `resumeKeywordsEnabled/resumeKeywords` — 仅沟通页
- `resumeRegExpEnabled/resumeRegExpStr` — 仅沟通页
- `resumeLlmEnabled/resumeLlmRule` — 仅沟通页

**已移除字段（不在 filter 中）：**
- 招呼语（`greetingEnabled/greetingMessage`）— 保留在「推荐牛人」页全局配置
- 每次最多开聊人数（`maxChatPerRunEnabled/maxChatPerRun`）— 保留在「推荐牛人」页全局配置
- 技能关键词（`expectSkillEnabled/expectSkillKeywordsStr`）— brief 页无技能字段，暂不实现
- 屏蔽姓名（`blockNameEnabled/blockCandidateNameRegExpStr`）— 同上，暂不实现

---

## 实现概述

### 新增页面：职位配置（BossJobConfig）

- **路由名：** `BossJobConfig`，路径 `BossJobConfig`
- **文件：** `packages/ui/src/renderer/src/page/MainLayout/BossJobConfig/index.vue`
- **导航：** 在 `RecruiterPart.vue` 中位于招聘BOSS分组最顶部
- **功能：**
  - 顶部操作栏：「同步职位列表」按钮（触发 `sync-boss-job-list`）
  - 职位列表使用 `el-collapse`，每个职位展开显示完整筛选表单
  - 表单每个字段左侧有 checkbox 控制 `*Enabled`，未启用时输入控件 disabled
  - 字段分为两组：`推荐牛人页 + 沟通页`（default）、`仅沟通页`（success）
  - 简历筛选为多选 checkbox，支持同时启用：关键词匹配、正则表达式匹配、大模型筛选；全不勾选即不筛选
  - 工作经验和薪资范围的上下限各自独立 checkbox 控制
  - 「从其他职位拷贝配置」：点击后打开对话框，选择源职位，将其 filter 拷贝到当前职位并允许修改
  - 每个职位有独立的「保存」按钮，调用 `save-boss-jobs-config`（合并写入）

### 修改：推荐牛人 - 自动开聊（BossAutoBrowseAndChat）

- **文件：** `packages/ui/src/renderer/src/page/MainLayout/BossAutoBrowseAndChat/index.vue`
- **变更：** 移除所有筛选条件字段（城市、学历、工作年限、薪资、技能、屏蔽姓名）
- **保留：** 招呼语（全局默认）、每次最多开聊人数（全局默认）、两次开聊间隔、推荐页运行策略（单轮停止、不感兴趣、跳过已读、间隔、保持浏览器）
- **新增提示：** `el-alert` 引导用户到「职位配置」页面配置筛选条件

### 修改：沟通（BossChatPage）

- **文件：** `packages/ui/src/renderer/src/page/MainLayout/BossChatPage/index.vue`
- **变更：** 移除所有筛选条件字段（preFilter + resumeFilter）
- **保留：** 每次最多处理未读会话数、单轮运行完成后停止、保持浏览器打开、两轮之间的等待间隔
- **新增提示：** `el-alert` 引导用户到「职位配置」页面配置筛选条件

### 修改：自动顺序执行（BossAutoSequence）

- **文件：** `packages/ui/src/renderer/src/page/MainLayout/BossAutoSequence/index.vue`
- **新增职位执行队列 section（在原有执行策略配置上方）：**
  - `onMounted` 调用 `fetch-boss-jobs-config` 获取职位列表
  - `el-table` 展示职位列表，每行包含：职位名称、「纳入执行」checkbox（`sequence.enabled`）、「执行推荐牛人」checkbox（`sequence.runRecommend`，enabled 为 false 时 disabled）、「执行沟通页」checkbox（`sequence.runChat`，enabled 为 false 时 disabled）
  - 若 jobs 为空：`el-alert` 提示先到「职位配置」页面同步职位列表
  - 「保存队列配置」按钮 → `save-boss-jobs-config`

---

## IPC Handlers（`packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`）

### `fetch-boss-jobs-config`
读取 `~/.geekgeekrun/config/boss-jobs-config.json`，返回整个配置对象（含 jobs 数组）。

### `save-boss-jobs-config`
- 参数：部分 jobs 配置的 JSON 字符串（可只含单个 job 的更新）
- 读取现有文件 → 深度合并（按 jobId 匹配） → 写回文件

### `sync-boss-job-list`
1. 启动临时 Puppeteer 浏览器（复用 initPuppeteer + cookie/localStorage 注入）
2. 导航到 `https://www.zhipin.com/web/chat/index`（沟通页）
3. **点击 `.chat-top-job`** 展开职位下拉菜单
4. 等待 `.ui-dropmenu-list:not(.sf-hidden) li` 出现（timeout 10s）
5. 提取各 `li` 的 `value`（jobId）和文本（jobName），过滤掉 value="-1"（全部）
6. 与 `boss-jobs-config.json` 现有 jobs 合并（新职位添加默认结构，旧职位保留现有 filter 配置）
7. 关闭浏览器
8. 返回 `{ jobs: mergedJobs }`

**注意 CSS 选择器（已从实际 HTML 验证）：**
- 沟通页职位选择器：`.chat-top-job` → 点击展开 → `.ui-dropmenu-list:not(.sf-hidden) li`
- 新同步职位的默认结构：`{ jobId, jobName, sequence: { enabled: true, runRecommend: true, runChat: true }, candidateFilter: {}, autoChat: {}, chatPage: {} }`

---

## runtime-file-utils 扩展（`packages/boss-auto-browse-and-chat/runtime-file-utils.mjs`）

新增/修改工具函数：
- `readBossJobsConfig()` — 读取 `boss-jobs-config.json`，不存在返回 `{ jobs: [] }`
- `writeBossJobsConfig(config)` — 写入 `boss-jobs-config.json`
- `getMergedJobConfig(jobId)` — 按 `j.jobId || j.id`（兼容旧数据）查找 job 条目，返回合并后的运行时配置

**向后兼容：** `getMergedJobConfig` 和 sync handler 的 `existingMap` 均使用 `j.jobId ?? j.id` 兼容旧版本数据中 `id` 字段名。

---

## 导航 & 路由变更

### `packages/ui/src/renderer/src/router/index.ts`
在 `children` 数组中，`BossAutoBrowseAndChat` 之前新增：
```typescript
{
  name: 'BossJobConfig',
  path: 'BossJobConfig',
  component: () => import('@renderer/page/MainLayout/BossJobConfig/index.vue'),
  meta: { title: '职位配置' }
}
```

### `packages/ui/src/renderer/src/page/MainLayout/index.vue`
在 `RECRUITER_ROUTES` 数组中新增 `'BossJobConfig'`。

### `packages/ui/src/renderer/src/page/MainLayout/LeftNavBar/RecruiterPart.vue`
在招聘BOSS分组最顶部新增：
```vue
<RouterLink :to="{ name: 'BossJobConfig' }">职位配置</RouterLink>
```

---

## 关键文件清单

| 文件 | 变更类型 |
|------|----------|
| `packages/ui/src/renderer/src/page/MainLayout/BossJobConfig/index.vue` | **新建** — 职位配置专用页面 |
| `packages/ui/src/renderer/src/page/MainLayout/BossAutoBrowseAndChat/index.vue` | 修改 — 移除筛选字段，保留策略配置 |
| `packages/ui/src/renderer/src/page/MainLayout/BossChatPage/index.vue` | 修改 — 移除筛选字段，保留策略配置 |
| `packages/ui/src/renderer/src/page/MainLayout/BossAutoSequence/index.vue` | 修改 — 新增职位执行队列 section |
| `packages/ui/src/renderer/src/page/MainLayout/LeftNavBar/RecruiterPart.vue` | 修改 — 新增「职位配置」导航链接 |
| `packages/ui/src/renderer/src/page/MainLayout/index.vue` | 修改 — RECRUITER_ROUTES 新增 BossJobConfig |
| `packages/ui/src/renderer/src/router/index.ts` | 修改 — 新增 BossJobConfig 路由 |
| `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts` | 修改 — 新增/修复 3 个 IPC handlers |
| `packages/boss-auto-browse-and-chat/runtime-file-utils.mjs` | 修改 — getMergedJobConfig 兼容 jobId/id |

---

## 可复用的现有代码

- `packages/boss-auto-browse-and-chat/runtime-file-utils.mjs` — `readConfigFile`, `writeConfigFile`（直接复用）
- `packages/boss-auto-browse-and-chat/index.mjs` — `initPuppeteer()`, cookie/localStorage 注入逻辑（复用于 sync-boss-job-list 启动浏览器）
- `packages/ui/src/main/flow/BOSS_RECOMMEND_MAIN/index.ts` — `initPlugins()` 和浏览器初始化模式
- `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts` — `save-boss-recruiter-config` 的 read/merge/write 模式

---

## 待实现部分（核心自动化层）— 已实现 ✓

以下功能已实现：

### 推荐页自动化支持 targetJobId ✓
**文件:** `packages/boss-auto-browse-and-chat/index.mjs`

`startBossAutoBrowse(hooks, opts)` 支持 `opts.jobId`，并新增 `opts.browser`/`opts.page` 复用已有实例：
- 导航到推荐页后，若 `jobId` 存在且非 `-1`/`0`，自动 `switchRecommendJobId`
- 选择器：`#headerWrap .ui-dropmenu-label` + `#headerWrap ul.job-list li.job-item[value="{jobId}"]`

### 沟通页自动化支持 targetJobId ✓
**文件:** `packages/boss-auto-browse-and-chat/chat-page-processor.mjs`

`startBossChatPageProcess(hooks, opts)` 支持 `opts.jobId`：
- 导航到沟通页后，点击 `.chat-top-job .ui-dropmenu-label` 展开，选中 `li[value="{jobId}"]`

### Worker 入口读取 per-job 配置 ✓
**文件:** `packages/ui/src/main/flow/BOSS_RECOMMEND_MAIN/index.ts`、`BOSS_AUTO_BROWSE_AND_CHAT_MAIN/index.ts`
- `--job-id` 命令行参数（BOSS_RECOMMEND_MAIN 已有）
- `getMergedJobConfig(jobId)` 将 boss-jobs-config 的 `filter` 转为 candidateFilter / chatPage 格式并覆盖配置

### 自动顺序执行多职位队列循环 ✓
**文件:** `packages/ui/src/main/flow/BOSS_AUTO_BROWSE_AND_CHAT_MAIN/index.ts`
- 读取 `boss-jobs-config.json` 中 `sequence.enabled === true` 的 jobs
- 依次对每个 job 执行 runRecommend 和/或 runChat，共用一个浏览器实例
- 仅沟通页场景：`launchBrowserAndNavigateToChat()` 启动浏览器并导航到沟通页

---

## 验证方案

1. **职位同步**: 点击「同步职位列表」后，检查 `~/.geekgeekrun/config/boss-jobs-config.json` 是否生成，职位名称是否正确
2. **per-job 配置保存**: 在「职位配置」页编辑某职位配置保存后，检查 `boss-jobs-config.json` 对应 job 的 filter 字段
3. **推荐页职位切换**: 在 BOSS_RECOMMEND_MAIN 添加日志，确认切换至目标职位后候选人列表刷新
4. **多职位队列执行**: 在 BossAutoSequence 配置 2 个职位的不同任务组合，启动后观察日志依次切换职位
5. **拷贝配置**: 从职位 A 拷贝配置到职位 B 后，确认 filter 字段正确复制（sequence 字段保持职位 B 原有值）
