<template>
  <div class="boss-llm-config__wrap">
    <div class="page-header">
      <div class="page-title">招聘端大语言模型配置</div>
      <div class="page-desc">
        配置用于简历筛选、招呼语生成等功能的 LLM 模型。此配置独立于应聘端，保存到
        <code>boss-llm.json</code>。
      </div>
    </div>

    <!-- 模型列表 -->
    <div v-if="models.length" class="model-list">
      <el-card
        v-for="(m, idx) in models"
        :key="m.id"
        class="model-card"
        shadow="hover"
      >
        <div class="model-card-header">
          <div class="model-card-title">
            <el-switch v-model="m.enabled" style="margin-right: 8px" />
            <el-input
              v-model="m.name"
              placeholder="模型别名（例如：DeepSeek-R1 简历筛选）"
              class="model-name-input"
              size="small"
            />
          </div>
          <div class="model-card-actions">
            <el-button
              size="small"
              :loading="m._testing"
              @click="handleTestEndpoint(m)"
            >
              测试连接
            </el-button>
            <el-button
              size="small"
              type="danger"
              text
              @click="removeModel(idx)"
            >
              删除
            </el-button>
          </div>
        </div>

        <el-form label-position="top" class="model-form">
          <div class="form-row-2">
            <el-form-item label="API Base URL">
              <el-input v-model="m.baseURL" placeholder="https://api.siliconflow.cn/v1" />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input v-model="m.apiKey" type="password" show-password placeholder="sk-xxx" />
            </el-form-item>
          </div>

          <el-form-item label="Model ID">
            <el-input v-model="m.model" placeholder="Pro/deepseek-ai/DeepSeek-R1" />
          </el-form-item>

          <!-- 推理模型 -->
          <el-form-item>
            <template #label>
              <span>推理模型（Thinking）</span>
              <el-tooltip content="支持 DeepSeek-R1、Qwen3、GLM 推理系列等。开启后 max_tokens 会自动调整为 budget×2 以防输出被截断。" placement="top">
                <el-icon style="margin-left: 4px; cursor: help;"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
            <div class="thinking-row">
              <el-checkbox v-model="m.thinking.enabled" label="启用 Thinking" />
              <el-input-number
                v-if="m.thinking.enabled"
                v-model="m.thinking.budget"
                :min="256"
                :max="32768"
                :step="512"
                controls-position="right"
                style="width: 160px; margin-left: 16px"
              />
              <span v-if="m.thinking.enabled" class="form-tip" style="margin-left: 8px">Token 预算</span>
            </div>
          </el-form-item>

          <!-- 测试结果 -->
          <el-alert
            v-if="m._testResult"
            :type="m._testResult.ok ? 'success' : 'error'"
            :title="m._testResult.ok ? '连接成功' : `连接失败：${m._testResult.error}`"
            show-icon
            :closable="false"
            style="margin-top: 4px"
          />
        </el-form>
      </el-card>
    </div>

    <el-empty v-else description="暂无模型，请添加" />

    <!-- 添加模型 -->
    <div class="add-model-bar">
      <el-button type="primary" plain @click="addModel">+ 添加模型</el-button>
      <el-dropdown @command="addPreset">
        <el-button plain>
          从预设添加 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="p in presets"
              :key="p.name"
              :command="p"
            >
              {{ p.name }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 用途默认模型 -->
    <el-card class="section" style="margin-top: 16px">
      <div class="section-title">各用途默认模型</div>
      <div class="section-desc">当同一用途有多个模型时，指定优先使用哪一个。</div>
      <el-form label-position="top">
        <div class="form-row-2">
          <el-form-item
            v-for="purpose in purposes"
            :key="purpose.key"
            :label="purpose.label"
          >
            <el-select
              v-model="purposeDefaultModelId[purpose.key]"
              clearable
              placeholder="（跟随第一个启用的模型）"
              style="width: 100%"
            >
              <el-option
                v-for="m in models.filter(m => m.enabled)"
                :key="m.id"
                :label="m.name || m.model"
                :value="m.id"
              />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
    </el-card>

    <!-- 操作栏 -->
    <div class="action-bar">
      <el-button :loading="isSaving" type="primary" @click="handleSave">保存配置</el-button>
      <el-button @click="handleClose">关闭</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, ArrowDown } from '@element-plus/icons-vue'

const { ipcRenderer } = electron

// ── 数据类型 ─────────────────────────────────────────────────────────────────
interface ThinkingConfig {
  enabled: boolean
  budget: number
}

interface ModelEntry {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  enabled: boolean
  thinking: ThinkingConfig
  // UI 临时状态
  _testing?: boolean
  _testResult?: { ok: boolean; error?: string } | null
}

// ── 状态 ─────────────────────────────────────────────────────────────────────
const models = ref<ModelEntry[]>([])
const purposeDefaultModelId = ref<Record<string, string>>({})
const isSaving = ref(false)

const purposes = [
  { key: 'resume_screening', label: '简历筛选' },
  { key: 'rubric_generation', label: '自动生成评分标准' },
  { key: 'greeting_generation', label: '招呼语生成' },
  { key: 'message_rewrite', label: '消息续写' },
  { key: 'default', label: '默认' }
]

// ── 预设模板 ─────────────────────────────────────────────────────────────────
const presets = [
  {
    name: 'SiliconFlow - DeepSeek-R1',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'Pro/deepseek-ai/DeepSeek-R1',
    thinking: { enabled: true, budget: 2048 }
  },
  {
    name: 'SiliconFlow - DeepSeek-V3',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'Pro/deepseek-ai/DeepSeek-V3',
    thinking: { enabled: false, budget: 2048 }
  },
  {
    name: 'DeepSeek 官方 - DeepSeek-R1',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-reasoner',
    thinking: { enabled: false, budget: 2048 }
  },
  {
    name: 'DeepSeek 官方 - DeepSeek-V3',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    thinking: { enabled: false, budget: 2048 }
  },
  {
    name: '阿里云百炼 - Qwen-Plus',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    thinking: { enabled: false, budget: 2048 }
  },
  {
    name: 'Ollama 本地 - qwen2.5',
    baseURL: 'http://localhost:11434/v1',
    model: 'qwen2.5:latest',
    thinking: { enabled: false, budget: 2048 }
  }
]

function newModelEntry(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    baseURL: '',
    apiKey: '',
    model: '',
    enabled: true,
    thinking: { enabled: false, budget: 2048 },
    _testing: false,
    _testResult: null,
    ...overrides
  }
}

// ── 生命周期 ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const config = await ipcRenderer.invoke('boss-fetch-llm-config')
    models.value = (config?.models ?? []).map((m: any) => ({
      ...newModelEntry(),
      ...m,
      thinking: { enabled: false, budget: 2048, ...(m.thinking ?? {}) }
    }))
    purposeDefaultModelId.value = config?.purposeDefaultModelId ?? {}
  } catch (err) {
    console.error('[BossLlmConfig] 加载配置失败', err)
  }
})

// ── CRUD ──────────────────────────────────────────────────────────────────────
function addModel() {
  models.value.push(newModelEntry())
}

function addPreset(preset: typeof presets[0]) {
  models.value.push(newModelEntry({
    name: preset.name,
    baseURL: preset.baseURL,
    model: preset.model,
    thinking: { ...preset.thinking }
  } as Partial<ModelEntry>))
}

function removeModel(idx: number) {
  models.value.splice(idx, 1)
}

// ── 测试连接 ─────────────────────────────────────────────────────────────────
async function handleTestEndpoint(m: ModelEntry) {
  m._testing = true
  m._testResult = null
  try {
    const res = await ipcRenderer.invoke('boss-test-llm-endpoint', {
      baseURL: m.baseURL,
      apiKey: m.apiKey,
      model: m.model,
      thinking: m.thinking
    })
    m._testResult = res
  } catch (err: any) {
    m._testResult = { ok: false, error: err?.message }
  } finally {
    m._testing = false
  }
}

// ── 保存 ─────────────────────────────────────────────────────────────────────
async function handleSave() {
  isSaving.value = true
  try {
    const config = {
      models: models.value.map(({ _testing, _testResult, ...rest }) => rest),
      purposeDefaultModelId: purposeDefaultModelId.value
    }
    await ipcRenderer.invoke('boss-save-llm-config', JSON.stringify(config))
    ElMessage({ type: 'success', message: '配置已保存' })
  } catch (err: any) {
    ElMessage({ type: 'error', message: `保存失败：${err?.message}` })
  } finally {
    isSaving.value = false
  }
}

function handleClose() {
  ipcRenderer.send('close-boss-llm-config')
}
</script>

<style lang="scss" scoped>
.boss-llm-config__wrap {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100vh;
  overflow-y: auto;
  box-sizing: border-box;

  .page-header {
    .page-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .page-desc {
      font-size: 13px;
      color: #909399;
      line-height: 1.7;
    }
  }

  .model-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .model-card {
    .model-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;

      .model-card-title {
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 0;

        .model-name-input {
          flex: 1;
          max-width: 340px;
        }
      }

      .model-card-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
    }

    .model-form {
      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 16px;
      }

      .thinking-row {
        display: flex;
        align-items: center;
      }

      .form-tip {
        font-size: 12px;
        color: #909399;
      }
    }
  }

  .add-model-bar {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .section {
    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .section-desc {
      font-size: 12px;
      color: #909399;
      margin-bottom: 14px;
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 16px;
    }
  }

  .action-bar {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 0 8px;
    border-top: 1px solid #ebeef5;
    position: sticky;
    bottom: 0;
    background: #fff;
    z-index: 1;
  }
}
</style>
