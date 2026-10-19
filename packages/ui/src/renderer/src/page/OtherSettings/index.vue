<template>
  <div class="page-wrap">
    <div class="settings-card">
      <div class="settings-title">外观</div>
      <div class="settings-row">
        <div>
          <div class="settings-label">暗色模式</div>
          <div class="settings-desc">选择界面配色，或跟随系统设置自动切换</div>
        </div>
        <el-radio-group :model-value="scheme" @change="handleSchemeChange">
          <el-radio-button value="light">明亮</el-radio-button>
          <el-radio-button value="dark">暗色</el-radio-button>
          <el-radio-button value="system">跟随系统</el-radio-button>
        </el-radio-group>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useColorScheme } from '@renderer/hooks/useColorScheme'

const { scheme, setScheme } = useColorScheme()

const handleSchemeChange = (value: string | number | boolean) => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    setScheme(value)
  }
}
</script>

<style scoped lang="scss">
.page-wrap {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 20px;
}
.settings-card {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid var(--el-card-border-color);
  border-radius: 4px;
  background-color: var(--el-bg-color);
}
.settings-title {
  font-size: 16px;
  margin-bottom: 20px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.settings-label {
  font-size: 14px;
}
.settings-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
