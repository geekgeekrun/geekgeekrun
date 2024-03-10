<template>
  <div class="geek-auto-start-chat-with-boss__prepare-run">
    <div>{{ statusText }}</div>
  </div>
</template>

<script lang="ts" setup>
import { hasOwn } from '@vue/shared'
import { PropType, computed } from 'vue'

const statusTextMap = {
  _: '请稍后，正在进行一些处理',
  'locating-puppeteer-executable': '正在寻找可用的浏览器'
} as const

const props = defineProps({
  status: {
    type: String as PropType<keyof typeof statusText>,
    default: '_'
  }
})
const statusText = computed(() => {
  if (hasOwn(statusTextMap, props.status)) {
    return statusTextMap[props.status]
  } else {
    return statusTextMap._
  }
})
</script>
