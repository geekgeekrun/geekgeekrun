<template><RouterView :status="currentStatus" /></template>

<script lang="ts" setup>
import { ElMessage } from 'element-plus'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()
const { ipcRenderer } = electron

const currentStatus = ref('')
onMounted(() => {
  const promise = Promise.resolve()
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

const needToCheckRuntimeDependenciesHandler = () => {
  router.replace('/')
}

ipcRenderer.on('need-to-check-runtime-dependencies', needToCheckRuntimeDependenciesHandler)
onUnmounted(() => {
  ipcRenderer.removeListener('need-to-check-runtime-dependencies', needToCheckRuntimeDependenciesHandler)
})
</script>
