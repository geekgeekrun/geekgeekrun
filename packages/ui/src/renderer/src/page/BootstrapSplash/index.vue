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
  await sleep(1500)
  try {
    await electron.ipcRenderer.invoke('pre-enter-setting-ui')
  } catch (err) {
    console.log('pre-enter-setting-ui error', err)
  } finally {
    await sleep(500)
    router.replace('/main-layout')
  }
})
</script>
