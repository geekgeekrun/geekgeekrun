<template>
  <div class="page-wrap flex flex-col of-hidden">
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
            :formatter="
              (_row, _col, val) => transformUtcDateToLocalDate(val).format('YYYY-MM-DD HH:mm:ss')
            "
          />
          <ElTableColumn prop="experienceName" label="工作经验" />
          <ElTableColumn
            label="薪资"
            :formatter="
              (row, _col, _val) =>
                `${row.salaryLow}-${row.salaryHigh}k` +
                (row.salaryMonth ? `* ${row.salaryMonth}薪` : '')
            "
          />
          <ElTableColumn prop="bossName" label="BOSS" />
          <ElTableColumn prop="bossTitle" label="BOSS身份" />
          <ElTableColumn label="职位信息" fixed="right" :width="120">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobSnapshotButtonClick(row)"
                >快照</ElButton
              >
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobOnlineButtonClick(row.encryptJobId)"
                >线上</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>
    <div class="flex flex-0 flex-justify-between pt10px pb10px">
      <div class="w100px">
        <el-button
          :loading="isTableLoading"
          size="small"
          @click="
            () => {
              gtagRenderer('start_chat_record_refresh_clicked')
              getAutoStartChatRecord()
            }
          "
          >刷新</el-button
        >
      </div>
      <ElPagination
        v-model:current-page="pagination.pageNo"
        v-model:page-size="pagination.pageSize"
        :page-sizes="pageSizeList"
        small
        :disabled="isTableLoading"
        layout="total, sizes, prev, pager, next, jumper"
        :total="pagination.totalItemCount"
        @size-change="getAutoStartChatRecord"
        @current-change="getAutoStartChatRecord"
      />
      <div class="w100px" />
    </div>
    <ElDrawer v-model="drawVisibleModelValue" size="400px">
      <JobInfoSnapshot
        v-if="selectedJobInfoForViewSnapshot"
        :job-info="selectedJobInfoForViewSnapshot"
        scene="startChatRecord"
        @closed="
          () => {
            gtagRenderer('start_chat_record_closed')
            selectedJobInfoForViewSnapshot = null
          }
        "
      />
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElPagination, ElDrawer } from 'element-plus'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import { transformUtcDateToLocalDate } from '@geekgeekrun/utils/date.mjs'
import { PageReq, PagedRes } from '../../../../common/types/pagination'
import JobInfoSnapshot from '../../features/JobInfoSnapshot/index.vue'
import { gtagRenderer } from '@renderer/utils/gtag'

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
    gtagRenderer('start_chat_record_request_sent', {
      page_no: pagination.value.pageNo,
      page_size: pagination.value.pageSize,
    })
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
    gtagRenderer('start_chat_record_request_success', {
      page_no: pagination.value.pageNo,
      page_size: pagination.value.pageSize,
    })
  } catch (err) {
    gtagRenderer('start_chat_record_request_error', {
      err,
      page_no: pagination.value.pageNo,
      page_size: pagination.value.pageSize,
    })
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

async function handleViewJobOnlineButtonClick(encryptJobId: string) {
  return await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/job_detail/${encryptJobId}.html`
  })
}

const drawVisibleModelValue = ref(false)
const selectedJobInfoForViewSnapshot = ref<VChatStartupLog | null>(null)

function handleViewJobSnapshotButtonClick(record: VChatStartupLog) {
  selectedJobInfoForViewSnapshot.value = record
  drawVisibleModelValue.value = true
}
</script>

<style scoped lang="scss">
.page-wrap {
  margin: 0 auto;
  max-width: 1000px;
  max-height: 100vh;
  overflow: hidden;
  padding-left: 20px;
  padding-top: 20px;
  :deep(.el-drawer) {
    .el-drawer__header {
      padding: 16px 20px;
      margin-bottom: 0;
    }
    .el-drawer__body {
      padding: 0;
      margin: 0 0 20px 20px;
      padding-right: 20px;
    }
  }
}
</style>
