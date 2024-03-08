<template>
  <div>
    <div>愿你心想事成</div>
    <RouterView
      :dependencies-status="checkDependenciesResult"
      :process-waitee="downloadProcessWaitee"
    ></RouterView>
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { onMounted } from 'vue'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'

const router = useRouter()

onMounted(async () => {
  const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
  const downloadProcessWaitee = Promise.withResolvers()

  if (Object.values(checkDependenciesResult).includes(false)) {
    router.replace('/downloadingDependencies')
  } else {
    downloadProcessWaitee.resolve()
  }

  downloadProcessWaitee.promise.then(async () => {
    const isCookieFileValid = await electron.ipcRenderer.invoke('check-boss-zhipin-cookie-file')
    if (!isCookieFileValid) {
      router.replace('/cookieAssistant')
    } else {
      await sleep(1000)
      router.replace('/configuration')
    }
  })
})
</script>
