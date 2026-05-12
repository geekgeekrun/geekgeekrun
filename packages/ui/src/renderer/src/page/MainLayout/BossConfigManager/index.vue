<template>
  <div class="boss-config-manager__wrap">
    <div class="main__wrap">
      <!-- 导出区 -->
      <el-card class="config-section">
        <div class="section-title">导出招聘端配置</div>
        <p class="section-desc">将当前配置打包为 JSON 文件，可分发给同事导入使用。</p>

        <el-form label-position="top">
          <el-form-item label="选择要导出的内容">
            <div class="checkbox-group">
              <el-checkbox v-model="exportOptions.recruiter">基础配置（招聘策略 + 候选人筛选条件）</el-checkbox>
              <el-checkbox v-model="exportOptions.jobs">职位配置（含 Rubric）</el-checkbox>
              <el-checkbox v-model="exportOptions.llm">LLM 配置</el-checkbox>
              <div v-if="exportOptions.llm" class="sub-checkbox">
                <el-checkbox v-model="exportOptions.includeApiKeys">
                  包含 API Key
                  <el-text type="warning" size="small">（明文导出，注意安全）</el-text>
                </el-checkbox>
              </div>
              <el-checkbox v-model="exportOptions.webhook">Webhook 配置</el-checkbox>
              <div class="session-checkbox-row">
                <el-checkbox v-model="exportOptions.session">
                  登录会话（Cookie + localStorage）
                </el-checkbox>
                <el-tag v-if="exportOptions.session" type="danger" size="small" style="margin-left: 8px">
                  安全风险：含登录凭据
                </el-tag>
              </div>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              :loading="exporting"
              :disabled="!hasAnyExportSelected"
              @click="handleExport"
            >
              导出配置文件
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 导入区 -->
      <el-card class="config-section">
        <div class="section-title">导入配置</div>
        <p class="section-desc">从之前导出的配置文件中选择性恢复配置，导入操作不可撤销。</p>

        <div
          class="upload-zone"
          :class="{ 'is-dragging': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleFileDrop"
          @click="triggerFileInput"
        >
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleFileChange"
          />
          <el-icon :size="32" color="#909399"><Upload /></el-icon>
          <p class="upload-hint">点击或拖入 .json 配置文件</p>
        </div>

        <!-- 预览区 -->
        <div v-if="previewState === 'loading'" class="preview-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>正在解析文件...</span>
        </div>

        <div v-if="previewState === 'error'" class="preview-error">
          <el-alert :title="previewError" type="error" :closable="false" show-icon />
        </div>

        <div v-if="previewState === 'ready'" class="preview-ready">
          <div class="preview-meta">
            导出时间：{{ formatExportedAt(previewData.exportedAt) }}
          </div>

          <el-alert
            title="导入将覆盖当前对应配置，操作不可撤销。"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
          />

          <div class="import-section-list">
            <div
              v-for="item in previewData.summary"
              :key="item.key"
              class="import-section-item"
            >
              <el-checkbox v-model="importSelected[item.key]">
                <span class="section-label">{{ item.label }}</span>
                <span class="section-desc-inline">{{ item.description }}</span>
              </el-checkbox>
              <el-tag v-if="item.hasSecurityWarning" type="danger" size="small" style="margin-left: 8px">
                安全风险
              </el-tag>
            </div>
          </div>

          <el-button
            type="primary"
            :loading="importing"
            :disabled="!hasAnyImportSelected"
            style="margin-top: 16px"
            @click="handleImport"
          >
            确认导入
          </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Loading } from '@element-plus/icons-vue'

const exportOptions = reactive({
  recruiter: true,
  jobs: true,
  llm: true,
  includeApiKeys: false,
  webhook: true,
  session: false
})

const exporting = ref(false)
const hasAnyExportSelected = computed(
  () => exportOptions.recruiter || exportOptions.jobs || exportOptions.llm || exportOptions.webhook || exportOptions.session
)

async function handleExport() {
  exporting.value = true
  try {
    const result = await electron.ipcRenderer.invoke('export-recruiter-config', {
      sections: {
        recruiter: exportOptions.recruiter,
        jobs: exportOptions.jobs,
        llm: exportOptions.llm,
        includeApiKeys: exportOptions.includeApiKeys,
        webhook: exportOptions.webhook,
        session: exportOptions.session
      }
    })
    if (result.success) {
      ElMessage({ type: 'success', message: `配置已导出：${result.filePath}` })
    }
  } catch (err: any) {
    ElMessage({ type: 'error', message: err?.message ?? '导出失败' })
  } finally {
    exporting.value = false
  }
}

// Import
const fileInputRef = ref<HTMLInputElement>()
const isDragging = ref(false)
const previewState = ref<'idle' | 'loading' | 'error' | 'ready'>('idle')
const previewError = ref('')
const previewData = ref<{
  exportedAt: string
  summary: Array<{
    key: string
    label: string
    description: string
    hasSecurityWarning?: boolean
    apiKeysRedacted?: boolean
  }>
}>({ exportedAt: '', summary: [] })
const importSelected = reactive<Record<string, boolean>>({})
const bundleJson = ref('')
const importing = ref(false)

const hasAnyImportSelected = computed(
  () => Object.values(importSelected).some(Boolean)
)

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) loadFile(file)
}

function loadFile(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    const text = e.target?.result as string
    bundleJson.value = text
    await runPreview(text)
  }
  reader.readAsText(file)
}

async function runPreview(json: string) {
  previewState.value = 'loading'
  try {
    const result = await electron.ipcRenderer.invoke('preview-recruiter-config-import', { bundleJson: json })
    if (!result.valid) {
      previewState.value = 'error'
      previewError.value = result.error ?? '文件无效'
      return
    }
    previewData.value = result
    // default: select all except session
    const newSelected: Record<string, boolean> = {}
    for (const item of result.summary) {
      newSelected[item.key] = item.key !== 'session'
    }
    Object.assign(importSelected, newSelected)
    previewState.value = 'ready'
  } catch (err: any) {
    previewState.value = 'error'
    previewError.value = err?.message ?? '预览失败'
  }
}

async function handleImport() {
  importing.value = true
  try {
    const selectedSections = Object.entries(importSelected)
      .filter(([, v]) => v)
      .map(([k]) => k)
    const result = await electron.ipcRenderer.invoke('import-recruiter-config', {
      bundleJson: bundleJson.value,
      selectedSections
    })
    if (result.success) {
      ElMessage({ type: 'success', message: `导入成功，已更新 ${result.importedSections.length} 项配置` })
      previewState.value = 'idle'
      bundleJson.value = ''
      if (fileInputRef.value) fileInputRef.value.value = ''
    } else {
      ElMessage({ type: 'error', message: result.error ?? '导入失败，已还原至原始配置' })
    }
  } catch (err: any) {
    ElMessage({ type: 'error', message: err?.message ?? '导入失败' })
  } finally {
    importing.value = false
  }
}

function formatExportedAt(iso: string) {
  if (!iso) return '未知'
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}
</script>

<style scoped lang="scss">
.boss-config-manager__wrap {
  height: 100%;
  overflow-y: auto;
}

.main__wrap {
  padding: 20px;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  .section-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .section-desc {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin-bottom: 16px;
    margin-top: 0;
  }
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-checkbox {
  padding-left: 24px;
}

.session-checkbox-row {
  display: flex;
  align-items: center;
}

.upload-zone {
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.2s;

  &:hover,
  &.is-dragging {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .upload-hint {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin: 0;
  }
}

.preview-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  color: var(--el-text-color-secondary);
}

.preview-error {
  margin-top: 12px;
}

.preview-ready {
  margin-top: 16px;

  .preview-meta {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-bottom: 12px;
  }
}

.import-section-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
}

.import-section-item {
  display: flex;
  align-items: center;

  .section-label {
    font-weight: 500;
  }

  .section-desc-inline {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    margin-left: 6px;
  }
}
</style>
