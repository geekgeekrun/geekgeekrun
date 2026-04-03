<template>
  <div class="boss-llm-config__wrap">
    <div class="page-header">
      <div class="page-title">招聘端大语言模型配置</div>
      <div class="page-desc">
        为不同 API 服务商配置模型，同一服务商的多个模型共享 API Key。配置保存到
        <code>boss-llm.json</code>。
      </div>
    </div>

    <!-- Provider 列表 -->
    <div v-if="providers.length" class="provider-list">
      <el-card
        v-for="(p, pIdx) in providers"
        :key="p.id"
        class="provider-card"
        shadow="hover"
      >
        <!-- Provider 头部 -->
        <div class="provider-header">
          <div class="provider-header-left">
            <el-input
              v-model="p.name"
              placeholder="服务商名称（例如：SiliconFlow）"
              class="provider-name-input"
              size="small"
            />
          </div>
          <el-button
            size="small"
            type="danger"
            text
            @click="removeProvider(pIdx)"
          >
            删除服务商
          </el-button>
        </div>

        <!-- Provider 连接信息 -->
        <div class="form-row-2 provider-conn">
          <el-form-item label="API Base URL">
            <el-input v-model="p.baseURL" placeholder="https://api.siliconflow.cn/v1" />
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="p.apiKey" type="password" show-password placeholder="sk-xxx" />
          </el-form-item>
        </div>

        <!-- 该 Provider 下的模型列表 -->
        <div class="model-list">
          <div
            v-for="(m, mIdx) in p.models"
            :key="m.id"
            class="model-row"
          >
            <div class="model-row-header">
              <el-switch v-model="m.enabled" style="flex-shrink: 0" />
              <el-input
                v-model="m.name"
                placeholder="模型别名（例如：DeepSeek-R1 简历筛选）"
                class="model-name-input"
                size="small"
              />
              <el-button
                size="small"
                :loading="m._testing"
                @click="handleTestEndpoint(p, m)"
              >
                测试连接
              </el-button>
              <el-button
                size="small"
                type="danger"
                text
                @click="removeModel(pIdx, mIdx)"
              >
                删除
              </el-button>
            </div>

            <div class="form-row-2 model-fields">
              <el-form-item label="Model ID">
                <el-input v-model="m.model" placeholder="Pro/deepseek-ai/DeepSeek-R1" />
              </el-form-item>
              <el-form-item>
                <template #label>
                  <span>推理模型</span>
                  <el-tooltip
                    content="支持 DeepSeek-R1、Qwen3 等 thinking model。开启后会自动调整 max_tokens。"
                    placement="top"
                  >
                    <el-icon style="margin-left: 4px; cursor: help"><InfoFilled /></el-icon>
                  </el-tooltip>
                </template>
                <div class="thinking-row">
                  <el-checkbox v-model="m.thinking.enabled" label="启用" />
                  <el-input-number
                    v-if="m.thinking.enabled"
                    v-model="m.thinking.budget"
                    :min="256"
                    :max="32768"
                    :step="512"
                    controls-position="right"
                    style="width: 130px; margin-left: 12px"
                  />
                  <span v-if="m.thinking.enabled" class="form-tip" style="margin-left: 6px">Token 预算</span>
                </div>
              </el-form-item>
            </div>

            <el-alert
              v-if="m._testResult"
              :type="m._testResult.ok ? 'success' : 'error'"
              :title="m._testResult.ok ? '连接成功' : `连接失败：${m._testResult.error}`"
              show-icon
              :closable="false"
              style="margin-top: 4px"
            />
          </div>
        </div>

        <!-- 添加模型按钮 -->
        <div class="add-model-bar">
          <el-button size="small" plain @click="addModel(pIdx)">+ 添加模型</el-button>
        </div>
      </el-card>
    </div>

    <el-empty v-else description="暂无服务商，请添加" />

    <!-- 添加 Provider -->
    <div class="add-provider-bar">
      <el-button type="primary" plain @click="addProvider">+ 添加服务商</el-button>
      <el-dropdown @command="addPreset">
        <el-button plain>
          从预设添加 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="preset in presets"
              :key="preset.name"
              :command="preset"
            >
              {{ preset.name }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 各用途默认模型 -->
    <el-card class="section" style="margin-top: 16px">
      <div class="section-title">各用途默认模型</div>
      <div class="section-desc">当同一用途有多个模型时，指定优先使用哪一个。</div>
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
              v-for="m in allEnabledModels"
              :key="m.id"
              :label="m.displayName"
              :value="m.id"
            />
          </el-select>
        </el-form-item>
      </div>
    </el-card>

    <!-- 操作栏 -->
    <div class="action-bar">
      <el-button :loading="isSaving" type="primary" @click="handleSave">保存配置</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
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
  model: string
  enabled: boolean
  thinking: ThinkingConfig
  _testing?: boolean
  _testResult?: { ok: boolean; error?: string } | null
}

interface ProviderEntry {
  id: string
  name: string
  baseURL: string
  apiKey: string
  models: ModelEntry[]
}

// ── 状态 ─────────────────────────────────────────────────────────────────────
const providers = ref<ProviderEntry[]>([])
const purposeDefaultModelId = ref<Record<string, string>>({})
const isSaving = ref(false)

const purposes = [
  { key: 'resume_screening', label: '简历筛选' },
  { key: 'greeting_generation', label: '招呼语生成' },
  { key: 'message_rewrite', label: '消息续写' },
  { key: 'default', label: '默认' }
]

// 所有已启用的模型（展平），用于用途默认模型下拉
const allEnabledModels = computed(() =>
  providers.value.flatMap((p) =>
    p.models
      .filter((m) => m.enabled)
      .map((m) => ({
        id: m.id,
        displayName: `${p.name ? p.name + ' / ' : ''}${m.name || m.model}`
      }))
  )
)

// ── 预设模板（provider 维度）─────────────────────────────────────────────────
const presets = [
  {
    name: 'SiliconFlow',
    baseURL: 'https://api.siliconflow.cn/v1',
    models: [
      { name: 'DeepSeek-R1', model: 'Pro/deepseek-ai/DeepSeek-R1', thinking: { enabled: true, budget: 2048 } },
      { name: 'DeepSeek-V3', model: 'Pro/deepseek-ai/DeepSeek-V3', thinking: { enabled: false, budget: 2048 } }
    ]
  },
  {
    name: 'DeepSeek 官方',
    baseURL: 'https://api.deepseek.com/v1',
    models: [
      { name: 'DeepSeek-R1', model: 'deepseek-reasoner', thinking: { enabled: false, budget: 2048 } },
      { name: 'DeepSeek-V3', model: 'deepseek-chat', thinking: { enabled: false, budget: 2048 } }
    ]
  },
  {
    name: '阿里云百炼',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { name: 'Qwen-Plus', model: 'qwen-plus', thinking: { enabled: false, budget: 2048 } }
    ]
  },
  {
    name: 'Ollama 本地',
    baseURL: 'http://localhost:11434/v1',
    models: [
      { name: 'qwen2.5', model: 'qwen2.5:latest', thinking: { enabled: false, budget: 2048 } }
    ]
  }
]

// ── 工厂函数 ─────────────────────────────────────────────────────────────────
function newModel(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    model: '',
    enabled: true,
    thinking: { enabled: false, budget: 2048 },
    _testing: false,
    _testResult: null,
    ...overrides,
    thinking: { enabled: false, budget: 2048, ...(overrides.thinking ?? {}) }
  }
}

function newProvider(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    id: crypto.randomUUID(),
    name: '',
    baseURL: '',
    apiKey: '',
    models: [],
    ...overrides
  }
}

// ── 生命周期 ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const config = await ipcRenderer.invoke('boss-fetch-llm-config')
    providers.value = (config?.providers ?? []).map((p: any) => ({
      ...newProvider(),
      ...p,
      models: (p.models ?? []).map((m: any) => ({
        ...newModel(),
        ...m,
        thinking: { enabled: false, budget: 2048, ...(m.thinking ?? {}) }
      }))
    }))
    purposeDefaultModelId.value = config?.purposeDefaultModelId ?? {}
  } catch (err) {
    console.error('[BossLlmConfig] 加载配置失败', err)
  }
})

// ── CRUD ─────────────────────────────────────────────────────────────────────
function addProvider() {
  providers.value.push(newProvider())
}

function removeProvider(pIdx: number) {
  providers.value.splice(pIdx, 1)
}

function addModel(pIdx: number) {
  providers.value[pIdx].models.push(newModel())
}

function removeModel(pIdx: number, mIdx: number) {
  providers.value[pIdx].models.splice(mIdx, 1)
}

function addPreset(preset: typeof presets[0]) {
  providers.value.push(
    newProvider({
      name: preset.name,
      baseURL: preset.baseURL,
      models: preset.models.map((m) => newModel(m as Partial<ModelEntry>))
    })
  )
}

// ── 测试连接 ─────────────────────────────────────────────────────────────────
async function handleTestEndpoint(p: ProviderEntry, m: ModelEntry) {
  m._testing = true
  m._testResult = null
  try {
    const res = await ipcRenderer.invoke('boss-test-llm-endpoint', {
      baseURL: p.baseURL,
      apiKey: p.apiKey
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
      providers: providers.value.map((p) => ({
        id: p.id,
        name: p.name,
        baseURL: p.baseURL,
        apiKey: p.apiKey,
        models: p.models.map(({ _testing, _testResult, ...rest }) => rest)
      })),
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
</script>

<style lang="scss" scoped>
.boss-llm-config__wrap {
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
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

  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .provider-card {
    .provider-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      .provider-header-left {
        display: flex;
        align-items: center;
        flex: 1;
        min-width: 0;
        margin-right: 12px;
      }

      .provider-name-input {
        flex: 1;
        max-width: 280px;
      }
    }

    .provider-conn {
      margin-bottom: 16px;
    }

    .model-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .model-row {
      background: #f8fdfb;
      border: 1px solid #dce8e6;
      border-radius: 6px;
      padding: 12px 14px;

      .model-row-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;

        .model-name-input {
          flex: 1;
          min-width: 0;
        }
      }

      .model-fields {
        margin-bottom: 0;
      }
    }

    .add-model-bar {
      margin-top: 12px;
    }
  }

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

  .add-provider-bar {
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
