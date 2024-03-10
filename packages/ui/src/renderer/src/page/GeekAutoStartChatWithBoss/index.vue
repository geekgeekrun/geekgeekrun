<template><RouterView :status="currentStatus" /></template>

<script lang="ts" setup>
import { ElMessage } from 'element-plus'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

const currentStatus = ref('')
onMounted(() => {
  const promise = electron.ipcRenderer.invoke('prepare-run-geek-auto-start-chat-with-boss')
  const handleLocatingPuppeteerExecutable = () => {
    currentStatus.value = 'locating-puppeteer-executable'
  }
  electron.ipcRenderer.once('locating-puppeteer-executable', handleLocatingPuppeteerExecutable)
  onUnmounted(() => {
    electron.ipcRenderer.removeListener(
      'locating-puppeteer-executable',
      handleLocatingPuppeteerExecutable
    )
  })

  promise
    .then(() => {
      router.replace('/geekAutoStartChatWithBoss/runningStatus')
    })
    .catch(async (err) => {
      if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
        ElMessage.error({
          message: `核心组件损坏，正在尝试修复`
        })
        router.replace('/')
      }
      console.error(err)
    })
})
</script>
