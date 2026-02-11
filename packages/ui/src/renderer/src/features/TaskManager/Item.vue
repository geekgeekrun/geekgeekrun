<template>
  <el-card class="task-item">
    <div>
      <div flex flex-col position-relative>
        <div>
          <el-button type="danger" size="small" @click="stopTask(task.workerId)">结束任务</el-button>
        </div>
        <img block :src="task.screenshot" height="190" width="360" />
        <div position-absolute bottom-0 right-0 font-size-12px :style="{
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff',
          padding: '2px 4px 2px 6px',
          borderRadius: '8px 0 0 0'
        }">{{ task.screenshotAt ? dayjs(task.screenshotAt).format('YYYY-MM-DD HH:mm:ss') : ' - ' }}</div>
      </div>
    </div>
    <div ml-30px>
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
    </div>
  </el-card>
</template>

<script lang="ts" setup>
import dayjs from 'dayjs'
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
  width: 1000px;
  margin: 0 auto;
  font-size: 14px;
  overflow: hidden;
  ::v-deep(.el-card__body) {
    display: flex;
  }
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
      word-break: break-all;
    }
  }
}
</style>
