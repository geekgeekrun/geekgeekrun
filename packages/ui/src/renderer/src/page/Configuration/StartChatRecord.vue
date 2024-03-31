<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="flex-0"><el-button @click="getAutoStartChatRecord" :loading="isTableLoading">刷新</el-button></div>
    <div class="flex-1 of-hidden" v-loading="isTableLoading">
      <div ref="tableContainerEl" class="h-100% of-hidden">
        <ElTable :data="tableData" :max-height="tableMaxHeight">
          <ElTableColumn prop="companyName" label="公司" />
          <ElTableColumn prop="jobName" label="职位名称" />
          <ElTableColumn prop="positionName" label="职位分类" />
          <ElTableColumn
            prop="date"
            label="开聊时间"
            :formatter="(_row, _col, val) => dayjs(val).format('YYYY-MM-DD HH:mm:ss')"
          />
          <ElTableColumn prop="experienceName" label="工作经验" />
          <ElTableColumn
            label="薪资"
            :formatter="(row, _col, _val) => `${row.salaryLow}-${row.salaryHeight}k`"
          />
          <ElTableColumn prop="bossName" label="BOSS" />
          <ElTableColumn prop="bossTitle" label="BOSS身份" />
        </ElTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { ElTable, ElTableColumn, ElButton } from 'element-plus'
import { useRouter } from 'vue-router'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import dayjs from 'dayjs'
const router = useRouter()

const tableData = ref<VChatStartupLog[]>([])

const isTableLoading = ref(false)
async function getAutoStartChatRecord() {
  try {
    isTableLoading.value = true
    const res = (await electron.ipcRenderer.invoke('get-auto-start-chat-record')) as {
      data: VChatStartupLog[]
    }
    tableData.value = res.data
  } catch (err) {
    console.log(err)
    tableData.value = []
  } finally {
    isTableLoading.value = false
  }
}

getAutoStartChatRecord()

const tableMaxHeight = ref<number | undefined>(undefined)
const tableContainerEl = ref<HTMLElement>()
const setTableMaxHeight = () =>
  (tableMaxHeight.value = tableContainerEl.value?.clientHeight ?? undefined)
onMounted(() => {
  setTableMaxHeight()
  const ro = new ResizeObserver(() => setTableMaxHeight())
  ro.observe(tableContainerEl.value!)
  onBeforeUnmount(() => {
    ro.disconnect()
  })
})
</script>

<style scoped lang="scss">
.page-wrap {
  margin: 0 auto;
  max-width: 1000px;
  max-height: 100vh;
  overflow: hidden;
}
</style>
