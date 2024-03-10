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
</script>
