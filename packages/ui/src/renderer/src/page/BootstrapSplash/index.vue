<template>
  <div class="h-screen flex flex-col flex-items-center flex-justify-center">
    <div>
      <img
        class="block"
        :class="{
          'animate__animated animate__bounce animate__repeat-3': true
        }"
        :width="256"
        src="@renderer/../../../resources/icon.png"
      />
    </div>
    <div mt24px>愿你薪想事成</div>
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { onMounted } from 'vue'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { gtagRenderer } from '@renderer/utils/gtag'

const router = useRouter()

// const checkDependenciesResult = ref({})
// const downloadProcessWaitee = ref(null)

onMounted(async () => {
  gtagRenderer('bootstrap_mounted')
  // checkDependenciesResult.value = await electron.ipcRenderer.invoke('check-dependencies')
  // downloadProcessWaitee.value = Promise.withResolvers()

  // if (Object.values(checkDependenciesResult.value).includes(false)) {
  //   gtagRenderer('dependencies_need_download')
  //   router.replace('/downloadingDependencies')
  // } else {
  //   downloadProcessWaitee.value!.resolve()
  // }

  // downloadProcessWaitee.value!.promise.then(async () => {
  //   const isCookieFileValid = await electron.ipcRenderer.invoke('check-boss-zhipin-cookie-file')
  //   if (!isCookieFileValid) {
  //     gtagRenderer('found_cookie_invalid_when_bootstrap')
  //     router.replace('/cookieAssistant')
  //   } else {
  await sleep(2000)
  router.replace('/main-layout')
  //   }
  // })
})
</script>
