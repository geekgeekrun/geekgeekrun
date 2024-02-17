<template><RouterView /></template>

<script lang="ts" setup>
import { onUnmounted } from 'vue'
import { mountGlobalDialog as mountDependenciesSetupProgressIndicatorDialog } from '@renderer/features/DependenciesSetupProgressIndicatorDialog/operations'

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
  if (!checkDependenciesResult) {
    mountDependenciesSetupProgressIndicatorDialog()
  }
})()
</script>
