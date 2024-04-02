<template>
  <div>{{ jobInfo }}</div>
</template>

<script setup lang="ts">
import { PropType } from 'vue'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'

const props = defineProps({
  jobInfo: {
    type: Object as PropType<VChatStartupLog>,
    required: true
  }
})
</script>

<style lang="scss" scoped></style>
<style lang="scss"></style>
