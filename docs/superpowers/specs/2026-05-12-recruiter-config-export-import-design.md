# 招聘端配置导出/导入功能设计

**日期：** 2026-05-12  
**状态：** 待实现

## 背景

用户需要将招聘端的完整配置交接给同事，现有系统只有 per-rubric 的 JSON 导入，没有全局配置导出/导入能力。

## 目标

在左导航"集成与工具"下新增"配置管理"入口，支持将所有招聘端配置导出为单个 JSON 文件，并支持选择性原子导入。

---

## Bundle 文件格式

文件扩展名：`.json`，默认命名 `geekgeekrun-config-YYYYMMDD.json`

```json
{
  "version": 1,
  "exportedAt": "2026-05-12T08:30:00.000Z",
  "sections": {
    "recruiter": {
      "bossRecruiter": { },
      "candidateFilter": { }
    },
    "jobs": { },
    "llm": { },
    "webhook": { },
    "session": {
      "cookies": [],
      "localStorage": {}
    }
  }
}
```

- `session` 仅在用户勾选时写入 bundle
- `llm.providers[*].apiKey` 在用户不勾选"包含 API Key"时替换为字符串 `"__REDACTED__"`
- 导入时跳过值为 `"__REDACTED__"` 的字段，保留本地现有值

---

## UI 设计

### 导航入口

`RecruiterPart.vue` 的"集成与工具"分组下新增条目 **"配置管理"**，路由到 `BossConfigManager` 页面。

### 导出区

标题：**导出招聘端配置**

勾选项（默认全选，除"登录会话"外）：

| 勾选项 | 默认 | 说明 |
|---|---|---|
| 基础配置（招聘策略 + 候选人筛选） | ✅ | boss-recruiter.json + candidate-filter.json |
| 职位配置（含 Rubric） | ✅ | boss-jobs-config.json |
| LLM 配置 | ✅ | boss-llm.json |
| └ 包含 API Key | ☐ | 子选项，默认关闭 |
| Webhook 配置 | ✅ | webhook.json |
| 登录会话（Cookie + localStorage） | ☐ | 默认关闭，显示安全提示 |

按钮：**导出配置文件** → main 端调用 `dialog.showSaveDialog`，写文件到用户选择路径。

### 导入区

标题：**导入配置**

流程：
1. 拖拽/点击上传区，接受 `.json` 文件
2. 上传后调用 `preview-recruiter-config-import`（只解析，不写磁盘），返回摘要
3. UI 展示带勾选的 section 列表（默认全选 bundle 中存在的 section，"登录会话"默认不选）：
   ```
   ☑ 基础配置
   ☑ 职位配置（3 个职位，含 Rubric）
   ☑ LLM 配置（API Key 已脱敏，导入后需手动补填）
   ☑ Webhook 配置
   ☐ 登录会话（含 Cookie，将替换当前登录状态）
   ```
4. 显示警告：**导入将覆盖当前对应配置，不可撤销**
5. 用户调整勾选后点"确认导入"

"确认导入"按钮在文件已选且预览成功后才变为可用。

---

## IPC Handler 设计

新增三个 handler，加入 `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`：

### `export-recruiter-config`

**Payload（renderer → main）：**
```ts
{
  sections: {
    recruiter?: boolean
    jobs?: boolean
    llm?: boolean
    includeApiKeys?: boolean   // llm 子选项
    webhook?: boolean
    session?: boolean
  }
}
```

**流程：**
1. 根据 `sections` 读取对应配置文件
2. `llm` 且 `!includeApiKeys` 时，递归将 `apiKey` 字段替换为 `"__REDACTED__"`
3. 组装 bundle JSON
4. 调用 `dialog.showSaveDialog`，写文件
5. 返回 `{ success: boolean, filePath?: string }`

---

### `preview-recruiter-config-import`

**Payload：** `{ bundleJson: string }`

**流程：**
1. JSON.parse，校验 `version === 1`
2. 遍历 `sections`，生成摘要：
   - `recruiter`: 是否存在
   - `jobs`: 职位数量
   - `llm`: provider 数量，apiKey 是否脱敏
   - `webhook`: 是否存在
   - `session`: 是否存在（标注安全警告）
3. 不写任何文件
4. 返回 `{ valid: boolean, summary: SectionSummary[], error?: string }`

---

### `import-recruiter-config`

**Payload：** `{ bundleJson: string, selectedSections: string[] }`

**流程（原子性保证）：**
1. JSON.parse，校验 `version`
2. 读取所有 `selectedSections` 对应的现有配置文件到内存（备份）
3. 逐 section 写入：
   - `recruiter` → 写 boss-recruiter.json + candidate-filter.json
   - `jobs` → 写 boss-jobs-config.json
   - `llm` → 写 boss-llm.json，跳过值为 `"__REDACTED__"` 的 apiKey 字段
   - `webhook` → 写 webhook.json
   - `session` → 写 boss-cookies.json + boss-local-storage.json
4. 任意步骤抛出异常 → 用内存备份回滚所有已写文件
5. 返回 `{ success: boolean, importedSections: string[], error?: string }`

**UI 响应：**
- 成功：toast "导入成功，已更新 N 项配置"
- 失败：toast "导入失败，已还原至原始配置"

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `packages/ui/src/renderer/src/page/MainLayout/LeftNavBar/RecruiterPart.vue` | 修改 | 新增"配置管理"导航条目 |
| `packages/ui/src/renderer/src/page/MainLayout/BossConfigManager/index.vue` | 新增 | 配置管理页面（导出区 + 导入区） |
| `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts` | 修改 | 新增三个 IPC handler |
| `packages/ui/src/renderer/src/router/index.ts`（或类似路由文件） | 修改 | 注册 BossConfigManager 路由 |

---

## 约束

- 不引入新的 npm 依赖（adm-zip 等），纯 JSON + Node.js fs
- API Key 脱敏仅替换字段值，不删除字段，保持结构完整
- 导入原子性：回滚粒度为"所有被选中的 section"，部分成功不存在
