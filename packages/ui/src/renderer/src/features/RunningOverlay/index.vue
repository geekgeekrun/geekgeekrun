<template>
  <el-dialog
    modal-class="runing-overlay__modal"
    :model-value="isDialogVisible"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <!-- v-if="stepsForRender.some(it => ['todo', 'pending', 'rejected'].includes(it.status))" -->
    <div>
      <ul m0 pl0>
        <li
          v-for="(item, index) in stepsForRender"
          :key="index"
          list-style-none
          flex
          justify-start
          pt4px
          pb4px
        >
          <div>
            <span v-if="item.status === 'todo'">🕐</span>
            <span v-if="item.status === 'pending'">👉</span>
            <span v-if="item.status === 'fulfilled'">✅</span>
            <span v-if="item.status === 'rejected'">⛔️</span>
          </div>
          <span ml8px>{{ item.describe }}</span>
        </li>
      </ul>
    </div>
    <div flex justify-between items-center w-full>
      <div>
        {{ runningStatusTextMapByCode[currentRunningStatus] }}
      </div>
      <div>
        <slot name="op-buttons" :current-running-status="currentRunningStatus" />
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
// import { useTaskManagerStore } from '@renderer/store'
import { getAutoStartChatSteps } from '../../../../common/prerequisite-step-by-step-check'
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  AUTO_CHAT_ERROR_EXIT_CODE,
  RUNNING_STATUS_ENUM
} from '../../../../common/enums/auto-start-chat'
const props = defineProps({
  workerId: {
    type: String
  },
  runRecordId: {
    type: Number
  }
})
// const taskManagerStore = useTaskManagerStore()
// const runingTaskInfo = computed(() => {
//   return taskManagerStore.runningTasks?.find((it) => {
//     return it.workerId === props.workerId
//   })
// })
const steps = ref([])
const stepsForRender = computed(() => {
  const clonedSteps = JSON.parse(JSON.stringify(steps.value))
  if (clonedSteps.some((it) => it.status === 'rejected')) {
    return clonedSteps
  }
  const lastFulfilledIndex = clonedSteps.findLastIndex((it) => it.status === 'fulfilled')
  if (lastFulfilledIndex + 1 < clonedSteps.length) {
    clonedSteps[lastFulfilledIndex + 1].status = 'pending'
  }
  return clonedSteps
})
const runningStatusTextMapByCode = {
  [RUNNING_STATUS_ENUM.RUNNING]: '正在运行中',
  [RUNNING_STATUS_ENUM.NORMAL_EXITED]: '程序已正常退出',
  [RUNNING_STATUS_ENUM.ERROR_EXITED]: '程序异常退出'
}
const currentRunningStatus = ref(RUNNING_STATUS_ENUM.RUNNING)
function fillEmptySteps() {
  const arr = getAutoStartChatSteps()
  arr.forEach((it) => (it.status = 'todo'))
  steps.value = arr
  currentRunningStatus.value = RUNNING_STATUS_ENUM.RUNNING
}
watch(() => props.runRecordId, fillEmptySteps, {
  immediate: true
})

const { ipcRenderer } = electron
function messageHandler(ev, { data }) {
  if (
    data.type !== 'prerequisite-step-by-step-checkstep-by-step-check' ||
    data.runRecordId !== props.runRecordId
  ) {
    return
  }
  const { id: stepId, status: stepStatus } = data.step
  const targetStep = steps.value.find((it) => it.id === stepId)
  if (!targetStep) {
    return
  }
  targetStep.status = stepStatus
}
const unListenMessage = ipcRenderer.on('worker-to-gui-message', messageHandler)
onUnmounted(unListenMessage)

const isDialogVisible = ref(false)
const show = () => {
  isDialogVisible.value = true
}
const hide = () => {
  isDialogVisible.value = false
}
defineExpose({
  show,
  hide
})
ipcRenderer.on('worker-exited', (ev, payload) => {
  const { workerId, code } = payload
  if (
    workerId !== props.workerId
    // || runRecordId !== props.runRecordId
  ) {
    return
  }
  if (code !== AUTO_CHAT_ERROR_EXIT_CODE.NORMAL) {
    currentRunningStatus.value = RUNNING_STATUS_ENUM.ERROR_EXITED
  } else {
    currentRunningStatus.value = RUNNING_STATUS_ENUM.NORMAL_EXITED
  }
})
</script>

<style lang="scss">
.el-overlay.runing-overlay__modal {
  position: absolute;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(3px);

  background-color: transparent;
  background-image: radial-gradient(transparent 1px, #fff 1px);
  background-size: 4px 4px;

  .el-overlay-dialog {
    position: absolute;
    pointer-events: all;
  }
  .el-dialog {
    margin: 0;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    .el-dialog__header {
      display: none;
    }
    .el-dialog__body {
      overflow: hidden;
    }
  }
}
</style>
