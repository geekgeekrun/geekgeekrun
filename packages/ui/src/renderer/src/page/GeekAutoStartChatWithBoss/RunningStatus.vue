<template>
  <div class="geek-auto-start-chat-with-boss__running-status">
    <div class="tip">
      <article>
        <h1>👋 BOSS炸弹正在运行</h1>
        <p>💬 正在为你开聊BOSS，请静候佳音</p>
        <p>📱 你可以在<b>手机</b> / <b>平板电脑</b>上，使用BOSS直聘App与为你开聊的BOSS聊天</p>
        <p>🍀 祝你求职顺利！</p>
      </article>
      <el-button :disabled="isStopping" @click="handleStopButtonClick">停止开聊</el-button>
    </div>
    <FlyingCompanyLogoList class="flying-company-logo-list" />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FlyingCompanyLogoList from '../../features/FlyingCompanyLogoList/index.vue'

const { ipcRenderer } = electron
const router = useRouter()

const handleStopButtonClick = async () => {
  ipcRenderer.invoke('stop-geek-auto-start-chat-with-boss')
}

const isStopping = ref(false)
const handleStopping = () => {
  isStopping.value = true
}
ipcRenderer.once('geek-auto-start-chat-with-boss-stopping', handleStopping)

const handleStopped = () => {
  router.replace('/configuration/GeekAutoStartChatWithBoss')
}
ipcRenderer.once('geek-auto-start-chat-with-boss-stopped', handleStopped)

onUnmounted(() => {
  ipcRenderer.removeListener('geek-auto-start-chat-with-boss-stopped', handleStopped)
  ipcRenderer.removeListener('geek-auto-start-chat-with-boss-stopping', handleStopping)
})

onMounted(async () => {
  try {
    await electron.ipcRenderer.invoke('run-geek-auto-start-chat-with-boss')
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
      ElMessage.error({
        message: `核心组件损坏，正在尝试修复`
      })
      const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
      if (Object.values(checkDependenciesResult).includes(false)) {
        router.replace('/')
        // TODO: should continue interrupted task
      }
    }
    console.error(err)
  }
})
</script>

<style scoped lang="scss">
.geek-auto-start-chat-with-boss__running-status {
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  .tip {
    margin: 0 auto;
    max-width: 640px;
  }
}
</style>
