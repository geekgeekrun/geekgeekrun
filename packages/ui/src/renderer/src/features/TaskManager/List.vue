<template>
  <div>
    <div v-for="task in runningTasks" :key="task.workerId">
      <div>
        <TaskManagerItem :task="task" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useTaskManagerStore } from '@renderer/store'
import { computed } from 'vue'
import TaskManagerItem from './Item.vue'

const taskManagerStore = useTaskManagerStore()
const runningTasks = computed(() => taskManagerStore.runningTasks?.workers || [])
</script>
