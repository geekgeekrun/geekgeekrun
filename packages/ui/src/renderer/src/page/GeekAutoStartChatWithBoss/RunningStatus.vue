<template>
  <div class="geek-auto-start-chat-with-boss__running-status">
    <article>
      <h1>👋 BOSS炸弹正在运行</h1>
      <p>💬 正在为你开聊BOSS，请静候佳音</p>
      <p>📱 你可以在<b>手机</b> / <b>平板电脑</b>上，使用BOSS直聘App与为你开聊的BOSS聊天</p>
      <p>🍀 祝你求职顺利！</p>
    </article>
    <el-button :disabled="isStopping" @click="handleStopButtonClick">停止开聊</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router'

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
</script>

<style scoped lang="scss">
.geek-auto-start-chat-with-boss__running-status {
  padding-top: 100px;
  margin: 0 auto;
  max-width: 640px;
}
</style>
