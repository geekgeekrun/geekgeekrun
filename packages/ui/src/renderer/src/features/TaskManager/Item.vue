<template>
  <div class="task-item" flex>
    <div>
      <img height="160" width="256" />
    </div>
    <div ml-40px>
      <dl>
        <dt>workerId</dt>
        <dd>{{ task.workerId }}</dd>
      </dl>
      <dl>
        <dt>status</dt>
        <dd>{{ task.status }}</dd>
      </dl>
      <dl>
        <dt>重启次数</dt>
        <dd>{{ task.restartCount }}</dd>
      </dl>
      <dl>
        <dt>已运行时间</dt>
        <dd>{{ task.uptime ?? '-' }} 毫秒</dd>
      </dl>
      <dl>
        <dt>命令行</dt>
        <dd>{{ task.command }} {{ task.args.join(' ') }}</dd>
      </dl>
      <dl>
        <dt>PID</dt>
        <dd>{{ task.pid }}</dd>
      </dl>
      <el-button type="danger" @click="stopTask(task.workerId)">结束任务</el-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { PropType } from 'vue'

defineProps({
  task: {
    type: Object as PropType<any>
  }
})

const { ipcRenderer } = electron
const stopTask = async (workerId: string) => {
  await ipcRenderer.invoke('stop-task', workerId)
}
</script>

<style lang="scss" scoped>
.task-item {
  font-size: 14px;
  overflow: hidden;
  dl {
    margin: 0;
    display: flex;
    padding-top: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid #eee;
    dt {
      width: 6em;
      flex: 0 0 6em;
    }
    dd {
    }
  }
}
</style>
