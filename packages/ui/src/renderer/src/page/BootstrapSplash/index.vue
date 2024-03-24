<template>
  <div>
    <div>愿你薪想事成</div>
    <RouterView
      :dependencies-status="checkDependenciesResult"
      :process-waitee="downloadProcessWaitee"
    ></RouterView>
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { onMounted, ref } from 'vue'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'

const router = useRouter()

const checkDependenciesResult = ref({})
const downloadProcessWaitee = ref(null)

onMounted(async () => {
  checkDependenciesResult.value = await electron.ipcRenderer.invoke('check-dependencies')
  downloadProcessWaitee.value = Promise.withResolvers()

  if (Object.values(checkDependenciesResult.value).includes(false)) {
    router.replace('/downloadingDependencies')
  } else {
    downloadProcessWaitee.value!.resolve()
  }

  downloadProcessWaitee.value!.promise.then(async () => {
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
