<template><RouterView :status="currentStatus" /></template>

<script lang="ts" setup>
import { ElMessage } from 'element-plus'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()

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
      switch (route.query.flow) {
        case 'geek-auto-start-chat-with-boss': {
          router.replace({
            path: '/geekAutoStartChatWithBoss/runningStatus'
          })
          break
        }
        case 'read-no-reply-reminder': {
          router.replace({
            path: '/geekAutoStartChatWithBoss/runningStatusForReadNoReplyReminder'
          })
          break
        }
        default: {
          router.replace('/')
        }
      }
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
