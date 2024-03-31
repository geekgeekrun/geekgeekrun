<template>
  <div class="flex h100vh">
    <div class="flex flex-col w160px pt50px pl30px aside-nav">
      <RouterLink to="./GeekAutoStartChatWithBoss">Boss炸弹</RouterLink>
      <RouterLink to="./StartChatRecord">开聊记录</RouterLink>
    </div>
    <RouterView #default="{ Component }" class="flex-1">
      <KeepAlive>
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
const unmountedCbs: Array<InstanceType<typeof Function>> = []
onUnmounted(() => {
  while (unmountedCbs.length) {
    const fn = unmountedCbs.shift()!
    try {
      fn()
    } catch {}
  }
})
const goToCheckBossZhipinCookieFile = () => router.replace('/cookieAssistant')
onMounted(() => {
  electron.ipcRenderer.on('check-boss-zhipin-cookie-file', goToCheckBossZhipinCookieFile)
})
onUnmounted(() => {
  electron.ipcRenderer.removeListener(
    'check-boss-zhipin-cookie-file',
    goToCheckBossZhipinCookieFile
  )
})
;(async () => {
  const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
  if (Object.values(checkDependenciesResult).includes(false)) {
    router.replace('/')
    return
  }

  const isCookieFileValid = await electron.ipcRenderer.invoke('check-boss-zhipin-cookie-file')
  if (!isCookieFileValid) {
    router.replace('/cookieAssistant')
    return
  }
})()
</script>

<style lang="scss" scoped>
.aside-nav {
  background-image: linear-gradient(
    45deg,
    #eaf4f1,
    #dcf6f2,
  );
  > a {
    display: flex;
    align-items: center;
    height: 2.5em;
    box-sizing: border-box;
    padding-left: 2em;
    & + a {
      margin-top: 10px;
    }
    &.router-link-active {
      background-color: #fff;
      font-weight: 700;
      color: #2faa9e;
      border-radius: 9999px 0 0 9999px;
    }
  }
}
</style>
