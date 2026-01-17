<template>
  <el-dialog
    modal-class="runing-overlay__modal"
    :model-value="runingTaskInfo"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div flex justify-between items-center w-full>
      <div>任务运行中!</div>
      <div>
        <slot name="op-buttons" />
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
import { useTaskManagerStore } from '@renderer/store'
import { computed } from 'vue'

const props = defineProps({
  workerId: {
    type: String
  }
})

const taskManagerStore = useTaskManagerStore()
const runingTaskInfo = computed(() => {
  return taskManagerStore.runningTasks?.find(it => {
    return it.workerId === props.workerId
  })
})
</script>

<style lang="scss">
.el-overlay.runing-overlay__modal {
  position: absolute;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(5px);
  
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