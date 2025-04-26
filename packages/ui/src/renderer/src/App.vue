<template>
  <el-config-provider :locale="zhCn">
    <Suspense>
      <RouterView />
    </Suspense>
  </el-config-provider>
</template>

<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { onMounted } from 'vue'
import { gtagRenderer } from './utils/gtag'

gtagRenderer('app_component_before_create')
onMounted(() => {
  gtagRenderer('app_component_mounted')
})
</script>
