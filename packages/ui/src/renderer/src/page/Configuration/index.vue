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
    let processDialog
    const needWarmingUpDenpendenciesHandler = () => {
      processDialog = mountDependenciesSetupProgressIndicatorDialog()
    }
    electron.ipcRenderer.on('NEED_RESETUP_DEPENDENCIES', needWarmingUpDenpendenciesHandler)

    const handlePuppeteerDownloadFinished = () => {
      processDialog?.dispose()
    }
    electron.ipcRenderer.once('PUPPETEER_DOWNLOAD_FINISHED', handlePuppeteerDownloadFinished)

    unmountedCbs.push(
      () => {
        electron.ipcRenderer.removeListener('PUPPETEER_DOWNLOAD_FINISHED', handlePuppeteerDownloadFinished)
        electron.ipcRenderer.removeListener('NEED_RESETUP_DEPENDENCIES', needWarmingUpDenpendenciesHandler)
      }
    )
    try {
      await electron.ipcRenderer.invoke('setup-dependencies')
    } finally {
      electron.ipcRenderer.removeListener('PUPPETEER_DOWNLOAD_FINISHED', handlePuppeteerDownloadFinished)
      electron.ipcRenderer.removeListener('NEED_RESETUP_DEPENDENCIES', needWarmingUpDenpendenciesHandler)
    }
  }
})()
</script>
