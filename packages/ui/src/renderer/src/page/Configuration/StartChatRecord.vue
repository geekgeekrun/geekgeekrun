<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="flex-0">
      <el-button :loading="isTableLoading" @click="getAutoStartChatRecord">刷新</el-button>
    </div>
    <div v-loading="isTableLoading" class="flex-1 of-hidden">
      <div ref="tableContainerEl" class="h-100% of-hidden">
        <ElTable
          ref="tableRef"
          :max-height="tableMaxHeight"
          :data="tableData"
          :row-key="getRowKey"
          size="small"
          table-layout="auto"
          highlight-current-row
        >
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
            :formatter="
              (row, _col, _val) =>
                `${row.salaryLow}-${row.salaryHeight}k` +
                (row.salaryMonth ? `* ${row.salaryMonth}薪` : '')
            "
          />
          <ElTableColumn prop="bossName" label="BOSS" />
          <ElTableColumn prop="bossTitle" label="BOSS身份" />
          <ElTableColumn label="职位信息" fixed="right">
            <template #default="{ row }">
              <!-- <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobButtonClick(row.encryptJobId)"
                >快照</ElButton
              > -->
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobButtonClick(row.encryptJobId)"
                >线上</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>
    <ElPagination
      v-model:current-page="pagination.pageNo"
      v-model:page-size="pagination.pageSize"
      class="flex-0 flex-justify-center pt10px pb10px"
      :page-sizes="pageSizeList"
      small
      :disabled="isTableLoading"
      layout="total, sizes, prev, pager, next, jumper"
      :total="pagination.totalItemCount"
      @size-change="getAutoStartChatRecord"
      @current-change="getAutoStartChatRecord"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElPagination } from 'element-plus'
import { useRouter } from 'vue-router'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import dayjs from 'dayjs'
import { PageReq, PagedRes } from '../../../../common/types/pagination'
const router = useRouter()

const tableData = ref<VChatStartupLog[]>([])
const pageSizeList = ref<number[]>([100, 200, 300, 400])
const pagination = ref<Omit<PageReq & PagedRes<unknown>, 'data'>>({
  pageNo: 1,
  pageSize: pageSizeList.value[0],
  totalItemCount: 0
})
const getRowKey = (row: VChatStartupLog) => {
  return `${row.encryptJobId}@${row.date}`
}
const tableRef = ref<InstanceType<typeof ElTable>>()
const isTableLoading = ref(false)
async function getAutoStartChatRecord() {
  try {
    isTableLoading.value = true
    const { data: res } = (await electron.ipcRenderer.invoke('get-auto-start-chat-record', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize
    })) as { data: PagedRes<VChatStartupLog> }
    tableData.value = res.data
    pagination.value = {
      totalItemCount: res.totalItemCount,
      pageNo: res.pageNo,
      pageSize: pagination.value.pageSize
    }
  } catch (err) {
    console.log(err)
    tableData.value = []
  } finally {
    tableRef.value?.setScrollTop(0)
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

function handleViewJobButtonClick(encryptJobId: string) {
  electron.ipcRenderer.send(
    'open-external-link',
    `https://www.zhipin.com/job_detail/${encryptJobId}.html`
  )
}
</script>

<style scoped lang="scss">
.page-wrap {
  margin: 0 auto;
  max-width: 1000px;
  max-height: 100vh;
  overflow: hidden;
}
</style>
