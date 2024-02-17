<template>
  <el-dialog v-bind="$attrs" @open="percentage = 0">
    <div>Downloading the necessary dependencies...</div>
    <el-progress :percentage="percentage" :format="(n) => `${n.toFixed(1)}%`" />
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus';

const props = defineProps({
  dispose: Function
})

const percentage = ref(0)
const handleProgress = (ev, { downloadedBytes, totalBytes }) => {
  percentage.value = (downloadedBytes / totalBytes) * 100
}
electron.ipcRenderer.on('PUPPETEER_DOWNLOAD_PROGRESS', handleProgress)
onUnmounted(() =>
  electron.ipcRenderer.removeListener('PUPPETEER_DOWNLOAD_PROGRESS', handleProgress)
)
const downloadProcessExitCode = ref(0)

const processDownload = async () => {
  downloadProcessExitCode.value = 0
  percentage.value = 0
  try {
    await electron.ipcRenderer.invoke('setup-dependencies')
    props.dispose?.()
  } catch(err) {
    downloadProcessExitCode.value = 1

    ElMessageBox.confirm('Encounter error while setup dependencies. Retry?')
    .then(() => {
      processDownload()
    })
    .catch(() => {
      // FIXME: should exit app here
      props.dispose?.()
    })
  }
}
processDownload()
</script>
