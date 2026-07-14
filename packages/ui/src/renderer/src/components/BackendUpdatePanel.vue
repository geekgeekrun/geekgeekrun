<template>
  <section class="backend-update-panel">
    <div>后端版本：{{ status.current || '未安装' }}</div>
    <div v-if="availableVersion">可用版本：{{ availableVersion }}</div>
    <div v-if="status.progress">更新状态：{{ status.progress }}</div>
    <div v-if="!compatible" class="error">{{ compatibilityReason || '此版本与当前应用不兼容' }}</div>
    <div v-if="status.lastFailure" class="error">{{ status.lastFailure.code }}：{{ status.lastFailure.message }}</div>
    <div v-if="status.rollback?.version">上次回滚：{{ status.rollback.version }}</div>
    <div v-if="status.diagnostics?.length" class="diagnostic">{{ status.diagnostics.at(-1)?.message }}</div>
    <el-button size="small" :loading="loading" @click="refresh">检查更新</el-button>
    <el-button size="small" type="primary" :loading="loading" :disabled="!compatible" @click="install">更新后端</el-button>
    <el-button size="small" :loading="loading" @click="install">重试</el-button>
    <el-button size="small" :loading="loading" :disabled="!status.previous" @click="rollback">回滚</el-button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

type Status = {
  current: string | null; previous: string | null; progress: string | null
  rollback: { version: string | null } | null
  lastFailure: { code: string; message: string } | null
  diagnostics: Array<{ message: string }>
}
const status = reactive<Status>({ current: null, previous: null, progress: null, rollback: null, lastFailure: null, diagnostics: [] })
const availableVersion = ref<string | null>(null)
const compatible = ref(true)
const compatibilityReason = ref<string | null>(null)
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    Object.assign(status, await electron.ipcRenderer.invoke('backend-update-status'))
    const check = await electron.ipcRenderer.invoke('backend-update-check')
    availableVersion.value = check.availableVersion
    compatible.value = check.compatible
    compatibilityReason.value = check.reason
  } finally { loading.value = false }
}
async function install() { loading.value = true; try { Object.assign(status, await electron.ipcRenderer.invoke('backend-update-install')) } finally { loading.value = false } }
async function rollback() { loading.value = true; try { Object.assign(status, await electron.ipcRenderer.invoke('backend-update-rollback')) } finally { loading.value = false } }
onMounted(() => { void refresh() })
</script>

<style scoped>
.backend-update-panel { display: grid; gap: 6px; margin-top: 12px; }
.error { color: var(--el-color-danger); }
</style>
