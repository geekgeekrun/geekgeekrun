<template>
  <el-dialog
    modal-class="running-overlay__modal"
    :model-value="isDialogVisible"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    width="400px"
    @closed="fillEmptySteps"
  >
    <div flex flex-col flex-items-center>
      <div class="dialog-header" w-full>
        <div
          h160px
          w-full
          :style="{
            backgroundImage: 'linear-gradient(#666, #666)'
          }"
        ></div>
      </div>
      <div class="dialog-main" w-full mt--20px>
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
        <div
          v-if="props.workerId === 'bossAutoBrowseAndChatMain' && (bossProgress.recommend.max > 0 || bossProgress.chatPage.max > 0)"
          class="progress-block"
          mb8px
        >
          <div v-if="bossProgress.recommend.max > 0" class="progress-line">
            推荐页：已开聊 {{ bossProgress.recommend.current }} / {{ bossProgress.recommend.max }}
          </div>
          <div v-if="bossProgress.chatPage.max > 0" class="progress-line">
            沟通页：已处理 {{ bossProgress.chatPage.current }} / {{ bossProgress.chatPage.max }}
          </div>
        </div>
        <div flex justify-between items-center w-full>
          <div>
            {{ runningStatusTextMapByCode[currentRunningStatus] }}
          </div>
          <div>
            <slot name="op-buttons" :current-running-status="currentRunningStatus" />
          </div>
        </div>
        <div
          v-if="workerLogs.length"
          mt8px
          style="max-height: 120px; overflow-y: auto; background: #f5f5f5; border-radius: 6px; padding: 6px 8px"
        >
          <div
            v-for="(line, i) in workerLogs"
            :key="i"
            style="font-size: 11px; color: #666; line-height: 1.5; word-break: break-all; font-family: monospace"
          >{{ line }}</div>
        </div>
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
import { gtagRenderer } from '@renderer/utils/gtag'
const props = defineProps({
  workerId: {
    type: String
  },
  runRecordId: {
    type: Number
  },
  getSteps: {
    type: Function,
    default: getAutoStartChatSteps
  }
})
// const taskManagerStore = useTaskManagerStore()
// const runningTaskInfo = computed(() => {
//   return taskManagerStore.runningTasks?.find((it) => {
//     return it.workerId === props.workerId
//   })
// })
const steps = ref([])
const workerLogs = ref<string[]>([])
const bossProgress = ref<{
  recommend: { current: number; max: number }
  chatPage: { current: number; max: number }
}>({
  recommend: { current: 0, max: 0 },
  chatPage: { current: 0, max: 0 }
})
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
  const arr = props.getSteps()
  arr.forEach((it) => (it.status = 'todo'))
  steps.value = arr
  currentRunningStatus.value = RUNNING_STATUS_ENUM.RUNNING
  workerLogs.value = []
  bossProgress.value = { recommend: { current: 0, max: 0 }, chatPage: { current: 0, max: 0 } }
}
watch(() => props.runRecordId, fillEmptySteps, {
  immediate: true
})
watch(
  () => stepsForRender.value,
  (v) => {
    const rejectedItems = v?.filter((it) => it.status === 'rejected')
    if (!rejectedItems.length) {
      return
    }
    gtagRenderer('running_overlay_rejected', {
      stepId: rejectedItems.map((it) => it.id).join(','),
      workerId: props.workerId
    })
  },
  { deep: true }
)

const { ipcRenderer } = electron
function messageHandler(ev, { data }) {
  if (data.type === 'worker-log' && data.workerId === props.workerId) {
    workerLogs.value.push(data.message)
    return
  }
  if (
    data.type === 'boss-auto-browse-progress' &&
    data.workerId === props.workerId &&
    (data.runRecordId == null || data.runRecordId === props.runRecordId)
  ) {
    if (data.phase === 'recommend') {
      bossProgress.value.recommend = { current: data.current ?? 0, max: data.max ?? 0 }
    } else if (data.phase === 'chatPage') {
      bossProgress.value.chatPage = { current: data.current ?? 0, max: data.max ?? 0 }
    }
    return
  }
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
watch(
  () => isDialogVisible.value,
  (newVal) => {
    if (!newVal) {
      gtagRenderer('running_overlay_shown')
    } else {
      gtagRenderer('running_overlay_hidden')
    }
  }
)
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
    gtagRenderer('running_overlay_error_exited', {
      exitCode: code,
      workerId: props.workerId
    })
  } else {
    currentRunningStatus.value = RUNNING_STATUS_ENUM.NORMAL_EXITED
    gtagRenderer('running_overlay_normal_exited', {
      exitCode: code,
      workerId: props.workerId
    })
  }
})
</script>

<style lang="scss">
.el-overlay.running-overlay__modal {
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
      // overflow: hidden;
    }
    .dialog-header {
      display: none;
      // display: flex;
      // justify-content: center;
      // border-radius: 20px 20px 0 0;
      // overflow: hidden;
    }
    background-color: transparent;
    box-shadow: none;
    padding: 0;
    border-radius: 0;
    .dialog-main {
      box-sizing: border-box;
      background: var(--el-dialog-bg-color);
      box-shadow: var(--el-dialog-box-shadow);
      padding: var(--el-dialog-padding-primary);
      //border-radius: 0 0 20px 20px;
      border-radius: 20px;
      .progress-block {
        font-size: 13px;
        color: #333;
        .progress-line {
          line-height: 1.6;
        }
      }
    }
  }
}
</style>
