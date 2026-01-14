<template><RouterView :status="currentStatus" /></template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()

const currentStatus = ref('')
onMounted(() => {
  switch (route.query.flow) {
    case 'geek-auto-start-chat-with-boss': {
      router.replace({
        path: '/geekAutoStartChatWithBoss/runningStatus'
      })
      break
    }
    case 'read-no-reply-reminder': {
      router.replace({
        path: '/geekAutoStartChatWithBoss/runningStatusForReadNoReplyReminder'
      })
      break
    }
    default: {
      router.replace('/')
    }
  }
})
</script>
