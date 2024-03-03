<template><RouterView /></template>

<script lang="ts" setup>
import { onUnmounted } from 'vue'
import { mountGlobalDialog as mountDependenciesSetupProgressIndicatorDialog } from '@renderer/features/DependenciesSetupProgressIndicatorDialog/operations'
import { mountGlobalDialog as mountWaitForLoginDialog } from '@renderer/features/WaitForLoginDialog/operations'

const unmountedCbs: Array<InstanceType<typeof Function>> = []
onUnmounted(() => {
  while (unmountedCbs.length) {
    const fn = unmountedCbs.shift()!
    try {
      fn()
    } catch {}
  }
})
;(async () => {
  const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
  if (Object.values(checkDependenciesResult).includes(false)) {
    mountDependenciesSetupProgressIndicatorDialog(checkDependenciesResult)
  }

  const isCookieFileValid = await electron.ipcRenderer.invoke('check-boss-zhipin-cookie-file')
  if (!isCookieFileValid) {
    mountWaitForLoginDialog()
  }
})()
</script>
