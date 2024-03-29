<template>
  <div class="h-screen flex flex-col flex-items-center flex-justify-center">
    <div>
      <img
        class="block"
        :class="{
          'animate__animated animate__bounce animate__repeat-3':
            Object.values(checkDependenciesResult).includes(false)
        }"
        :width="256"
        src="@renderer/../../../resources/icon.png"
      />
    </div>
    <div mt24px>愿你薪想事成</div>
    <div class="h60px mt14px">
      <RouterView
        class="h100%"
        :dependencies-status="checkDependenciesResult"
        :process-waitee="downloadProcessWaitee"
      ></RouterView>
    </div>
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

electron.ipcRenderer.invoke('get-auto-start-chat-record').then(() => {
  debugger
}, () => {
  debugger
})
</script>
