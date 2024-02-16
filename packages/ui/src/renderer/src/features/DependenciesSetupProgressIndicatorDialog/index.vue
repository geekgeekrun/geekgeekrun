<template>
  <el-dialog v-bind="$attrs" @open="percentage = 0">
    <div>Downloading the necessary dependencies...</div>
    <el-progress :percentage="percentage" :format="(n) => `${n.toFixed(1)}%`" />
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, onUnmounted } from 'vue'

const percentage = ref(0)
const handleProgress = (ev, { downloadedBytes, totalBytes }) => {
  percentage.value = ((downloadedBytes / totalBytes) * 100)
}
electron.ipcRenderer.on('PUPPETEER_DOWNLOAD_PROGRESS', handleProgress)
onUnmounted(
  () => electron.ipcRenderer.removeListener('PUPPETEER_DOWNLOAD_PROGRESS', handleProgress)
)
</script>
