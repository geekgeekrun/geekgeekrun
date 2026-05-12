<template>
  <div class="webhook-integration__wrap">
    <div class="main__wrap">
      <el-form ref="formRef" :model="formContent" label-position="top">
        <!-- 基础设置 -->
        <el-card class="config-section">
          <el-form-item>
            <div class="section-title">基础设置</div>
          </el-form-item>
          <el-form-item label="启用 Webhook">
            <el-switch v-model="formContent.enabled" />
            <span class="hint-text">关闭后任务结束时不发送，也可手动触发</span>
          </el-form-item>
          <el-form-item
            label="目标 URL"
            prop="url"
            :rules="[{ validator: validateUrl, trigger: 'blur' }]"
          >
            <el-input
              v-model="formContent.url"
              placeholder="https://your-paperless.example.com/api/documents/post_document/"
              :disabled="!formContent.enabled"
            />
          </el-form-item>
          <el-form-item label="请求方法">
            <el-select v-model="formContent.method" :disabled="!formContent.enabled">
              <el-option label="POST" value="POST" />
              <el-option label="PUT" value="PUT" />
              <el-option label="PATCH" value="PATCH" />
            </el-select>
          </el-form-item>
          <el-form-item label="发送模式">
            <el-radio-group v-model="formContent.sendMode" :disabled="!formContent.enabled">
              <el-radio value="batch">轮次结束汇总发送</el-radio>
              <el-radio value="realtime">逐条实时发送（每打招呼后立即发一条）</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="请求体格式">
            <el-radio-group v-model="formContent.contentType" :disabled="!formContent.enabled">
              <el-radio value="application/json">JSON</el-radio>
              <el-radio value="multipart/form-data">Multipart（直传 Paperless 等）</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-card>

        <!-- 请求头 -->
        <el-card class="config-section">
          <el-form-item>
            <div class="section-title">请求头（Headers）</div>
          </el-form-item>
          <div class="header-presets">
            <span class="preset-label">快速模板：</span>
            <el-button size="small" @click="addPresetHeader('Authorization', 'Token YOUR_TOKEN')"
              >Authorization Token</el-button
            >
            <el-button size="small" @click="addPresetHeader('X-API-Key', 'YOUR_API_KEY')"
              >X-API-Key</el-button
            >
          </div>
          <div
            v-for="(header, index) in formContent.headers"
            :key="index"
            class="header-row"
          >
            <el-input
              v-model="header.key"
              placeholder="Header 名称"
              class="header-key-input"
            />
            <span class="header-sep">:</span>
            <el-input
              v-model="header.value"
              placeholder="Header 值"
              class="header-value-input"
            />
            <el-button
              type="danger"
              plain
              :icon="Delete"
              circle
              size="small"
              @click="removeHeader(index)"
            />
          </div>
          <el-button class="add-header-btn" @click="addHeader">+ 添加请求头</el-button>
        </el-card>

        <!-- Payload 选项 -->
        <el-card class="config-section">
          <el-form-item>
            <div class="section-title">Payload 内容选项</div>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.payloadOptions.includeBasicInfo">
              包含候选人基本信息（姓名、学历、工作年限、薪资、技能等）
            </el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.payloadOptions.includeFilterReason">
              包含筛选理由 / 评分报告（为什么选中或跳过此候选人）
            </el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.payloadOptions.includeLlmConclusion">
              包含 LLM 评估结论（如果启用了大语言模型筛选）
            </el-checkbox>
          </el-form-item>
          <el-form-item label="简历文件">
            <el-radio-group v-model="formContent.payloadOptions.includeResume">
              <el-radio value="none">不包含</el-radio>
              <el-radio value="path">本地文件路径</el-radio>
              <el-radio value="base64">Base64 编码内容</el-radio>
            </el-radio-group>
            <div class="hint-text" style="margin-top: 4px">
              注意：若沟通页配置了
              <code>chatPage.attachmentResume.skipDownload: true</code>（BOSS
              已设置附件简历自动发邮箱，无需下载），则系统不会下载 PDF，
              此字段在 Webhook Payload 中将始终为空。
            </div>
          </el-form-item>
        </el-card>

        <!-- 重试与队列 -->
        <el-card class="config-section">
          <el-form-item>
            <div class="section-title">重试与失败队列</div>
          </el-form-item>
          <el-form-item label="失败重试次数">
            <el-input-number
              v-model="formContent.retryTimes"
              :min="0"
              :max="10"
              :disabled="!formContent.enabled"
            />
            <span class="hint-text">0 表示不重试，首次失败后按延迟指数退避</span>
          </el-form-item>
          <el-form-item label="首次重试延迟（毫秒）">
            <el-input-number
              v-model="formContent.retryDelayMs"
              :min="500"
              :max="30000"
              :step="500"
              :disabled="!formContent.enabled"
            />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="formContent.queueFileOnFailure" :disabled="!formContent.enabled">
              最终失败时写入本地队列文件（webhook-failed-queue.jsonl），便于后续重发
            </el-checkbox>
          </el-form-item>
        </el-card>

        <!-- 操作栏 -->
        <div class="action-bar">
          <el-button :loading="isSaving" @click="handleSave">仅保存配置</el-button>
          <el-button type="primary" :loading="isSaving || isTesting" @click="handleSaveAndTest">
            保存并测试发送
          </el-button>
          <el-checkbox v-model="manualTriggerUseRealData" class="manual-trigger-checkbox">
            使用真实数据（数据库最近联系人）
          </el-checkbox>
          <el-button
            :loading="isTriggering"
            :disabled="!formContent.url"
            @click="handleManualTrigger"
          >
            {{ manualTriggerUseRealData ? '手动触发（真实数据）' : '手动触发（Mock 数据）' }}
          </el-button>
        </div>
      </el-form>

      <!-- 测试结果 -->
      <el-card v-if="testResult" class="config-section test-result-card">
        <div class="section-title">
          上次测试结果
          <el-tag
            :type="testResult.status >= 200 && testResult.status < 300 ? 'success' : 'danger'"
            size="small"
          >
            HTTP {{ testResult.status }}
          </el-tag>
        </div>
        <pre class="test-result-body">{{ testResult.formattedBody }}</pre>
      </el-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'

const { ipcRenderer } = electron

const formRef = ref()
const isSaving = ref(false)
const isTesting = ref(false)
const isTriggering = ref(false)
const testResult = ref<{ status: number; formattedBody: string } | null>(null)
const manualTriggerUseRealData = ref(false)

interface HeaderEntry {
  key: string
  value: string
}

const formContent = reactive({
  enabled: false,
  url: '',
  method: 'POST' as 'POST' | 'PUT' | 'PATCH',
  sendMode: 'batch' as 'batch' | 'realtime',
  contentType: 'application/json' as 'application/json' | 'multipart/form-data',
  headers: [] as HeaderEntry[],
  payloadOptions: {
    includeBasicInfo: true,
    includeFilterReason: true,
    includeLlmConclusion: true,
    includeResume: 'path' as 'none' | 'path' | 'base64'
  },
  retryTimes: 3,
  retryDelayMs: 1000,
  queueFileOnFailure: false
})

function headersArrayToObject(arr: HeaderEntry[]): Record<string, string> {
  const obj: Record<string, string> = {}
  for (const { key, value } of arr) {
    if (key.trim()) {
      obj[key.trim()] = value
    }
  }
  return obj
}

function headersObjectToArray(obj: Record<string, string>): HeaderEntry[] {
  return Object.entries(obj || {}).map(([key, value]) => ({ key, value }))
}

function validateUrl(_: unknown, value: string, callback: (err?: Error) => void) {
  if (formContent.enabled && value && !/^https?:\/\/.+/.test(value)) {
    callback(new Error('URL 必须以 http:// 或 https:// 开头'))
  } else {
    callback()
  }
}

function addHeader() {
  formContent.headers.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  formContent.headers.splice(index, 1)
}

function addPresetHeader(key: string, value: string) {
  const existing = formContent.headers.find((h) => h.key === key)
  if (existing) {
    existing.value = value
  } else {
    formContent.headers.push({ key, value })
  }
}

onMounted(async () => {
  try {
    const config = await ipcRenderer.invoke('fetch-webhook-config')
    if (config) {
      formContent.enabled = config.enabled ?? false
      formContent.url = config.url ?? ''
      formContent.method = config.method ?? 'POST'
      formContent.sendMode = config.sendMode ?? 'batch'
      formContent.contentType = config.contentType ?? 'application/json'
      formContent.headers = headersObjectToArray(config.headers ?? {})
      formContent.payloadOptions.includeBasicInfo = config.payloadOptions?.includeBasicInfo ?? true
      formContent.payloadOptions.includeFilterReason =
        config.payloadOptions?.includeFilterReason ?? true
      formContent.payloadOptions.includeLlmConclusion =
        config.payloadOptions?.includeLlmConclusion ?? true
      formContent.payloadOptions.includeResume = config.payloadOptions?.includeResume ?? 'path'
      formContent.retryTimes = config.retryTimes ?? 3
      formContent.retryDelayMs = config.retryDelayMs ?? 1000
      formContent.queueFileOnFailure = config.queueFileOnFailure ?? false
    }
  } catch (err) {
    console.error(err)
  }
})

function buildSavePayload() {
  return {
    enabled: formContent.enabled,
    url: formContent.url,
    method: formContent.method,
    sendMode: formContent.sendMode,
    contentType: formContent.contentType,
    headers: headersArrayToObject(formContent.headers),
    payloadOptions: { ...formContent.payloadOptions },
    retryTimes: formContent.retryTimes,
    retryDelayMs: formContent.retryDelayMs,
    queueFileOnFailure: formContent.queueFileOnFailure
  }
}

async function doSave() {
  await ipcRenderer.invoke('save-webhook-config', JSON.stringify(buildSavePayload()))
}

const handleSave = async () => {
  isSaving.value = true
  try {
    await doSave()
    ElMessage({ type: 'success', message: '配置已保存' })
  } catch (err) {
    ElMessage({ type: 'error', message: '保存失败' })
    console.error(err)
  } finally {
    isSaving.value = false
  }
}

const handleSaveAndTest = async () => {
  if (!formContent.url) {
    ElMessage({ type: 'warning', message: '请先填写目标 URL' })
    return
  }
  isSaving.value = true
  isTesting.value = true
  testResult.value = null
  try {
    await doSave()
    const result = await ipcRenderer.invoke('test-webhook')
    let formattedBody = result.body
    try {
      formattedBody = JSON.stringify(JSON.parse(result.body), null, 2)
    } catch {
      // keep as-is
    }
    testResult.value = { status: result.status, formattedBody }
    if (result.status >= 200 && result.status < 300) {
      ElMessage({ type: 'success', message: `测试成功，HTTP ${result.status}` })
    } else {
      ElMessage({ type: 'warning', message: `服务器返回 HTTP ${result.status}` })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage({ type: 'error', message: `请求失败：${message}` })
    testResult.value = { status: 0, formattedBody: message }
  } finally {
    isSaving.value = false
    isTesting.value = false
  }
}

const handleManualTrigger = async () => {
  if (!formContent.url) {
    ElMessage({ type: 'warning', message: '请先填写目标 URL' })
    return
  }
  isTriggering.value = true
  testResult.value = null
  try {
    await doSave()
    const result = await ipcRenderer.invoke(
      'trigger-webhook-manually',
      manualTriggerUseRealData.value
    )
    let formattedBody = result.body
    try {
      formattedBody = JSON.stringify(JSON.parse(result.body), null, 2)
    } catch {
      // keep as-is
    }
    testResult.value = { status: result.status, formattedBody }
    if (result.status >= 200 && result.status < 300) {
      ElMessage({ type: 'success', message: `手动触发成功，HTTP ${result.status}` })
    } else {
      ElMessage({ type: 'warning', message: `服务器返回 HTTP ${result.status}` })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ElMessage({ type: 'error', message: `触发失败：${message}` })
  } finally {
    isTriggering.value = false
  }
}
</script>

<style lang="scss" scoped>
.webhook-integration__wrap {
  width: 100%;
  height: 100%;
  overflow: auto;

  .main__wrap {
    padding: 24px;
    max-width: 800px;
    margin: 0 auto;
  }

  .config-section {
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hint-text {
    margin-left: 12px;
    font-size: 12px;
    color: #909399;
  }

  .header-presets {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .preset-label {
      font-size: 12px;
      color: #606266;
    }
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .header-key-input {
      flex: 0 0 200px;
    }

    .header-value-input {
      flex: 1;
    }

    .header-sep {
      color: #999;
    }
  }

  .add-header-btn {
    margin-top: 4px;
  }

  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
    flex-wrap: wrap;

    .manual-trigger-checkbox {
      margin-right: 8px;
    }
  }

  .test-result-card {
    .test-result-body {
      margin: 12px 0 0;
      padding: 12px;
      background: #f5f7fa;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'Consolas', 'Monaco', monospace;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow: auto;
    }
  }
}
</style>
