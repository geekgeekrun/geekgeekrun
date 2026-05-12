# 招聘端 LLM 集成计划（整合版）

本文档由原 LLM 简历 Rubric 集成计划与招聘端 LLM 配置设计整合而来，并反映当前实现状态。

---

## 1. 设计目标与原则

1. **独立于应聘端**：招聘端使用 `~/.geekgeekrun/config/boss-llm.json`，与应聘端 `llm.json` 完全独立
2. **多模型多用途**：支持为不同场景（简历筛选、招呼语生成、消息续写等）指定不同模型
3. **简历 Rubric 模式**：由 `resumeLlmRule`（单一字符串）升级为可视化的、由大模型辅助生成的多维度评分表
4. **支持推理模型**：支持 DeepSeek-R1、Qwen3、GLM 推理系列等 thinking model（待实现）
5. **测试 API 连通性**：配置页提供「测试连接」按钮（待实现）

---

## 2. 配置文件

### 2.1 `boss-llm.json` — 招聘端 LLM 配置

**路径：** `~/.geekgeekrun/config/boss-llm.json`

```json
{
  "providers": [
    {
      "id": "uuid-provider",
      "name": "SiliconFlow",
      "baseURL": "https://api.siliconflow.cn/v1",
      "apiKey": "sk-xxx",
      "models": [
        {
          "id": "uuid-model",
          "name": "DeepSeek-R1",
          "model": "Pro/deepseek-ai/DeepSeek-R1",
          "enabled": true,
          "thinking": {
            "enabled": true,
            "budget": 2048
          }
        }
      ]
    }
  ],
  "purposeDefaultModelId": {
    "resume_screening": "uuid-model",
    "greeting_generation": "uuid-model-2",
    "default": "uuid-model"
  }
}
```

**设计说明：** 模型本身不再携带 `purposes` 标签。用途与模型的绑定通过 `purposeDefaultModelId` 统一管理，在配置 UI 中直接为每个用途选择一个模型即可。所有 `enabled: true` 的模型均可被分配到任意用途。

**用途（purposeDefaultModelId 的 key）：**

| 用途 key | 说明 |
|----------|------|
| `resume_screening` | 简历 LLM 筛选（Rubric 评分 / 规则判断） |
| `rubric_generation` | 自动生成评分标准（根据 JD 生成 Rubric） |
| `greeting_generation` | 招呼语生成 |
| `message_rewrite` | 消息续写 / 已读不回提醒等 |
| `default` | 未指定用途时的默认模型 |

**实现状态：**

- [x] `llm-rubric.mjs` 中 `getEnabledLlmClient` 已正确读取 `boss-llm.json` 并按 purpose 选模型
- [x] 默认文件与自动创建逻辑：`readBossLlmConfig()` 在文件不存在时返回 `{ providers: [], purposeDefaultModelId: {} }` 安全默认值
- [x] BossLlmConfig 配置页及 IPC（`boss-fetch-llm-config`、`boss-save-llm-config`、`boss-test-llm-endpoint`、`boss-llm-config` 窗口）

### 2.2 `boss-jobs-config.json` — 每职位 `resumeLlmConfig` 扩展

```json
{
  "resumeLlmEnabled": true,
  "resumeLlmConfig": {
    "sourceJd": "用户粘贴的岗位描述...",
    "passThreshold": 75,
    "rubric": {
      "knockouts": ["必须统招本科及以上", "必须有3年以上经验"],
      "dimensions": [
        {
          "name": "硬件开发经验",
          "weight": 40,
          "criteria": { "1": "无相关经验", "3": "参与过项目", "5": "主导过复杂设计" }
        },
        {
          "name": "编程能力",
          "weight": 60,
          "criteria": { "1": "无编程经验", "3": "中等模块开发", "5": "大型项目架构" }
        }
      ]
    }
  }
}
```

**字段说明：**

- `knockouts`：一票否决项
- `dimensions`：1/3/5 分制，按权重加权得总分（满 100）
- `passThreshold`：及格线（0–100）
- **向后兼容**：若无 `resumeLlmConfig` 但有 `resumeLlmRule`，沿用旧字符串规则逻辑

**实现状态：** [x] 已完整实现（BossJobConfig UI + runtime-file-utils + chat-page-processor）

---

## 3. 自动化层

### 3.1 `llm-rubric.mjs`

| 函数 | 作用 | 状态 |
|------|------|------|
| `getEnabledLlmClient(purpose)` | 从 boss-llm.json 按 purpose 选取模型 | [x] 已实现 |
| `evaluateResumeByRubric(resumeText, rubricConfig)` | 根据 Rubric 评估简历 | [x] 已实现 |
| `generateRubricFromJd(sourceJd)` | 根据 JD 生成 Rubric | [x] 已实现 |

### 3.2 `runtime-file-utils.mjs`

- `jobFilterToChatPageFilter`：正确处理 `resumeLlmConfig.rubric` 优先级 [x] 已实现

### 3.3 `chat-page-processor.mjs`

- rubric 分支：当 `llmConfig.rubric` 存在时调用 `evaluateResumeByRubric` [x] 已实现

### 3.4 `gpt-request.mjs` — 推理模型支持

**状态：** [x] 已实现

需扩展 `completes` 支持 `thinking` 参数，并**避免与推理预算冲突**：

- **max_tokens 约束**：推理模型的输出长度通常包含「思考内容 + 最终 content」，若开启 `thinking_budget`，则 `max_tokens` 需要明显大于预算（常见至少 2x 以上），否则会因长度上限导致 `finish_reason=length` 被截断。
- **建议做法**：将 `max_tokens` 由“固定默认值”改为“按用途/按模型配置”，并为 `thinking.enabled=true` 的请求提供更大的默认值（例如 4096/8192），避免 Rubric JSON 输出不完整。
- **temperature**：对结构化 JSON 输出建议低温（如 0.1）；推理模型在启用 thinking 时可考虑允许更高 temperature（如 0.6），但应可配置（不建议硬编码一个值覆盖所有模型与用途）。

```javascript
// 新增可选参数
export async function completes(
  { baseURL, apiKey, model, max_tokens, temperature, thinking },
  messages
) {
  // 建议：调用方显式传 max_tokens；若未传，按是否启用 thinking 给一个更安全的默认值
  const resolvedMaxTokens =
    typeof max_tokens === 'number' ? max_tokens : thinking?.enabled ? 8192 : 1200

  const body = {
    messages,
    model,
    max_tokens: resolvedMaxTokens,
    temperature: typeof temperature === 'number' ? temperature : thinking?.enabled ? 0.6 : 0.1
  }
  if (thinking?.enabled && thinking?.budget) {
    body.enable_thinking = true
    body.thinking_budget = thinking.budget
  }
  // ...
}
```

---

## 4. IPC 与 UI

### 4.1 已实现的 IPC

| IPC | 作用 | 状态 |
|-----|------|------|
| `generate-llm-rubric` | 根据 sourceJd 调用 generateRubricFromJd | [x] 已实现 |
| `llm-screen-resume` | 调试工具用，主进程直接 evaluateResumeByRubric | [x] 已实现 |

### 4.2 待实现的 IPC（BossLlmConfig 配置页）

| IPC | 作用 |
|-----|------|
| `boss-fetch-llm-config` | 读取 boss-llm.json |
| `boss-save-llm-config` | 保存 boss-llm.json |
| `boss-test-llm-endpoint` | 测试 API 连通性 |

### 4.3 已实现的 UI

- **BossJobConfig**：AI Rubric Builder（Step 1）+ Visual Rubric Editor（Step 2）[x]
- **BossDebugTool**：LLM 简历筛选、Rubric 生成测试 [x]

### 4.4 待实现的 UI

- **BossLlmConfig** 配置页：模型列表增删改、purposes 多选、thinking 参数、测试连接、预设模板（SiliconFlow、DeepSeek、阿里云百炼、火山方舟、Ollama 等）
- 路由 `#/bossLlmConfig` 及 `createBossLlmConfigWindow`
- RecruiterPart 导航增加「配置大语言模型」入口

**测试 API 逻辑**（`boss-test-llm-endpoint`）：`POST {baseURL}/chat/completions`，Body: `{ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 10 }`。成功显示「连接成功」，失败显示错误信息。

---

## 5. 实现检查清单（更新后）

### 简历 Rubric 流程

- [x] `llm-rubric.mjs`：getEnabledLlmClient 读 boss-llm.json
- [x] `llm-rubric.mjs`：evaluateResumeByRubric、generateRubricFromJd
- [x] `runtime-file-utils.mjs`：jobFilterToChatPageFilter 支持 resumeLlmConfig
- [x] `chat-page-processor.mjs`：接入 rubric 分支
- [x] IPC：generate-llm-rubric
- [x] BossJobConfig：resumeLlmConfig 数据结构 + AI Rubric Builder + Visual Rubric Editor

### boss-llm.json 配置页

- [x] boss-llm.json 默认文件与 ensure 逻辑（`readBossLlmConfig` / `writeBossLlmConfig` in `runtime-file-utils.mjs`）
- [x] BossLlmConfig/index.vue（模型 CRUD、purposes 多选、thinking 参数、测试连接、用途默认模型选择器）
- [x] createBossLlmConfigWindow 及路由 #/bossLlmConfig
- [x] IPC：boss-fetch-llm-config、boss-save-llm-config、boss-test-llm-endpoint、boss-llm-config（打开窗口）
- [x] RecruiterPart 增加「配置大语言模型」链接
- [x] 预设模板（SiliconFlow DeepSeek-R1/V3、DeepSeek 官方、阿里云百炼、Ollama）

### 推理模型

- [x] gpt-request.mjs：支持 `thinking` 参数（`enable_thinking` / `thinking_budget`）、`reasoning_content` 日志输出、按是否启用 thinking 自动调整 `max_tokens` 和 `temperature` 默认值

---

## 6. 标准 API 参考（推理模型扩展）

推理模型在标准 Chat Completions 请求上增加可选参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `enable_thinking` | boolean | 是否启用思维链 |
| `thinking_budget` | integer | 思维链最大 token 数 |

响应中 `message` 可能包含 `reasoning_content`，业务**仅使用 `content`**。

**Provider 适配**：部分厂商通过 `extra_body` 传入推理参数，实现时需兼容顶层参数或 extra_body 透传。

**参考文献：**

- [SiliconFlow - Chat Completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions.md)
- [SiliconFlow - 推理模型](https://docs.siliconflow.cn/cn/userguide/capabilities/reasoning.md)

---

## 7. 注意事项

- **boss-llm.json 必须先配置**：generate-llm-rubric 与 evaluateResumeByRubric 均依赖 boss-llm.json 中至少一个启用的 resume_screening 模型。若未配置，UI 应给出明确提示并引导用户到「大语言模型配置」页。
- **Token 控制**：简历文本截断至 3500 字；knockouts 优先判断可减少 token。
- **维度上限**：建议最多 5 个，generateRubricFromJd 已做截断。
- **权重归一化**：generateRubricFromJd 返回前已归一化；UI 可对总和不等于 100 时做警告提示。
- **Rubric 总分计算（实现已按 100 分归一化）**：维度分是 1/3/5，需先映射到 0–1 再乘权重，最终总分落在 0–100。推荐公式：

\[
\text{Total} = 100 \times \frac{\sum_i \left(W_i \times \frac{Score_i}{5}\right)}{\sum_i W_i}
\]

这样当权重和为 100 且所有维度满分 5 时，总分为 100；最低分 1 时总分约为 20（若权重和为 100）。

---

## 8. 与应聘端对比

| 项目 | 应聘端 | 招聘端 |
|------|--------|--------|
| 配置文件 | llm.json | boss-llm.json |
| 配置入口 | LlmConfig (#/llmConfig) | BossLlmConfig（待实现 #/bossLlmConfig） |
| 用途 | 职位匹配、已读不回提醒等 | 简历筛选、招呼语、消息续写等 |
