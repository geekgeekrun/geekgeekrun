# Webhook / 外部集成

本文档描述招聘端 Webhook 功能的设计、配置结构、数据流与扩展方式，适用于对接 Paperless-ngx、自定义 API 等外部系统。

---

## 1. 功能概述

每轮自动化任务（推荐牛人 + 沟通页）结束后，系统将本轮处理的所有候选人数据汇总成一条 JSON Payload，通过 HTTP 请求发送到用户配置的 URL。

支持：
- 开关控制（关闭后任务结束时跳过发送）
- 「保存并测试发送」（用 mock 数据验证接口通不通）
- 「手动触发」（用 mock 数据模拟一次 manual 发送）
- 自定义 Headers（用于 Token 认证等）
- Payload 内容裁剪（可关闭某些字段）
- 简历以本地路径或 Base64 附带

---

## 2. 相关文件

| 文件 | 说明 |
|------|------|
| `packages/ui/src/renderer/src/page/MainLayout/WebhookIntegration/index.vue` | 设置页 UI |
| `packages/ui/src/main/features/webhook/index.ts` | 发送逻辑、类型定义、mock 数据生成 |
| `packages/ui/src/main/flow/BOSS_AUTO_BROWSE_AND_CHAT_MAIN/index.ts` | 任务完成后自动触发（`afterChatStarted` 收集 + 轮次结束后发送） |
| `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts` | IPC handlers：fetch/save/test/trigger |
| `packages/ui/src/renderer/src/router/index.ts` | 路由注册 `WebhookIntegration` |
| `packages/ui/src/renderer/src/page/MainLayout/LeftNavBar/RecruiterPart.vue` | 左侧导航入口 |

配置文件路径：`~/.geekgeekrun/config/webhook.json`（通过 boss-auto-browse 的 `runtime-file-utils.mjs` 读写）

---

## 3. 配置结构（webhook.json）

```json
{
  "enabled": true,
  "url": "https://your-paperless.example.com/api/documents/post_document/",
  "method": "POST",
  "sendMode": "batch",
  "contentType": "application/json",
  "headers": {
    "Authorization": "Token YOUR_TOKEN",
    "X-Custom-Header": "value"
  },
  "payloadOptions": {
    "includeBasicInfo": true,
    "includeFilterReason": true,
    "includeLlmConclusion": true,
    "includeResume": "path"
  },
  "retryTimes": 3,
  "retryDelayMs": 1000,
  "queueFileOnFailure": false
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用自动触发 |
| `url` | string | 目标 URL（须以 http:// 或 https:// 开头） |
| `method` | `"POST"` \| `"PUT"` \| `"PATCH"` | HTTP 方法 |
| `sendMode` | `"batch"` \| `"realtime"` | 轮次结束汇总发送 / 每打招呼后立即发送一条 |
| `contentType` | `"application/json"` \| `"multipart/form-data"` | 请求体格式，multipart 时每条候选人一个请求（直传 Paperless 等） |
| `headers` | object | 自定义请求头 key-value 对 |
| `payloadOptions.includeBasicInfo` | boolean | 是否包含候选人基本信息 |
| `payloadOptions.includeFilterReason` | boolean | 是否包含筛选理由/评分 |
| `payloadOptions.includeLlmConclusion` | boolean | 是否包含 LLM 评估结论 |
| `payloadOptions.includeResume` | `"none"` \| `"path"` \| `"base64"` | 简历文件携带方式；**若沟通页开启了 `chatPage.attachmentResume.skipDownload`（见下），`resumeFile` 在 Payload 中将始终为空，与此选项无关** |
| `retryTimes` | number | 失败重试次数，0 不重试 |
| `retryDelayMs` | number | 首次重试延迟（毫秒），之后指数退避 |
| `queueFileOnFailure` | boolean | 最终失败时是否写入本地队列文件（webhook-failed-queue.jsonl） |

---

## 4. Payload 结构

```json
{
  "runId": "run-<runRecordId 或时间戳>",
  "timestamp": "2026-03-16T10:00:00.000Z",
  "summary": {
    "total": 10,
    "matched": 7,
    "skipped": 3
  },
  "candidates": [
    {
      "basicInfo": {
        "name": "张三",
        "education": "本科",
        "workExpYears": 3,
        "city": "北京",
        "salary": "15-25K",
        "skills": ["Vue", "React", "TypeScript"]
      },
      "filterReport": {
        "matched": true,
        "matchedRules": ["education", "workExp", "skills"],
        "score": 85
      },
      "llmConclusion": "候选人技能与岗位匹配度较高，建议优先沟通。",
      "resumeFile": {
        "path": "/Users/xxx/.geekgeekrun/storage/resumes/张三.pdf",
        "filename": "张三.pdf"
      }
    }
  ]
}
```

- `resumeFile.base64` 仅在 `includeResume = "base64"` 时出现
- 若某字段对应的 `payloadOptions` 为 false，则该字段在所有候选人对象中省略
- **`chatPage.attachmentResume.skipDownload` 的影响**：若 BOSS 直聘已配置「接收附件简历自动发到邮箱」，可在 `boss-recruiter.json` 中将 `chatPage.attachmentResume.skipDownload` 设为 `true`。此时系统仅发出索取请求、不下载 PDF，`resumeFile` 字段在 Payload 中将始终缺失（无论 `payloadOptions.includeResume` 取何值）。若下游系统依赖 `resumeFile`，请保持 `skipDownload: false`（默认值）。

---

## 5. 数据流

```
afterChatStarted hook（每次打招呼后）
  ↓
BOSS_AUTO_BROWSE_AND_CHAT_MAIN/index.ts
  收集到 sessionCandidates[]（candidate.info / matchedRules / score / llmConclusion / resumeFilePath）
  ↓
startBossAutoBrowse + startBossChatPageProcess 均完成
  ↓
读取 webhook.json
  ├── enabled=false → 跳过，sessionCandidates.length = 0
  └── enabled=true, url 非空
        ↓
      features/webhook/index.ts: sendWebhook(config, payload)
        ├── 按 payloadOptions 过滤字段
        ├── includeResume="base64" → fs.readFileSync(path).toString('base64')
        └── fetch(url, { method, headers, body: JSON.stringify(payload) })
              ↓
            返回 { status, body }，记录日志
  ↓
sessionCandidates.length = 0，等待下轮
```

---

## 6. IPC 接口

| Channel | 说明 |
|---------|------|
| `fetch-webhook-config` | 读取 webhook.json，不存在时返回 null |
| `save-webhook-config` | payload 为 JSON 字符串，与 existing 合并后写入 |
| `test-webhook` | 用 `buildMockPayload()` 发送到已配置 URL，返回 `{ status, body }` |
| `trigger-webhook-manually` | 同上，runId 前缀为 `manual-` |

---

## 7. UI 页面说明

**入口：** 「招聘BOSS」左侧导航 → Webhook / 外部集成

**布局：**
1. **基础设置卡片** — 启用开关 / URL 输入 / 请求方法选择
2. **请求头卡片** — 动态 key/value 列表 + 「Authorization Token」「X-API-Key」快速模板按钮
3. **Payload 选项卡片** — 基本信息/筛选报告/LLM 结论 checkbox + 简历携带方式 radio
4. **操作栏** — 仅保存 / 保存并测试发送 / 手动触发
5. **测试结果卡片** — 显示 HTTP 状态码（带颜色 tag）+ 格式化响应体

---

## 8. 与 Paperless-ngx 对接示例

Paperless-ngx 的文档上传 API：`POST /api/documents/post_document/`

配置示例：
```json
{
  "enabled": true,
  "url": "http://paperless.local/api/documents/post_document/",
  "method": "POST",
  "headers": {
    "Authorization": "Token <your-paperless-token>"
  },
  "payloadOptions": {
    "includeBasicInfo": true,
    "includeFilterReason": true,
    "includeLlmConclusion": true,
    "includeResume": "base64"
  }
}
```

> **注意：** Paperless 上传 API 期望 `multipart/form-data` 格式，而当前实现发送的是 JSON。若需直接上传到 Paperless，建议在外部用一个中间服务（如 n8n、自定义脚本）接收本 webhook JSON，再转发给 Paperless。这也是「允许调用自定义 API」的典型用法。

---

## 9. 扩展方向（已实现）

- **逐条实时触发**：配置项 `sendMode: 'realtime'`，在 `afterChatStarted` hook 中每打招呼后立即调用 `sendWebhook` 发送单条候选人；`sendMode: 'batch'` 保持轮次结束汇总发送。
- **支持 multipart/form-data**：配置项 `contentType: 'multipart/form-data'` 时，每条候选人单独一个请求，FormData 含 runId、timestamp、summary、candidate（JSON）、document（简历文件），支持直传 Paperless 等。
- **重试机制**：配置项 `retryTimes`、`retryDelayMs`，失败时指数退避重试；`queueFileOnFailure: true` 时最终失败写入 `~/.geekgeekrun/storage/webhook-failed-queue.jsonl`。
- **手动触发使用真实数据**：`trigger-webhook-manually` 支持第二参数 `useRealData`；为 true 时从 SQLite `CandidateContactLog` + `CandidateInfo` 查最近 50 条联系人组装 payload，无数据时回退为 Mock。
