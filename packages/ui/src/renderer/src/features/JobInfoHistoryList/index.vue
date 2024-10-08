<template>
  <div>
    <el-table :data="dataForRender">
      <el-table-column prop="title" label="" width="120px" fixed />
      <el-table-column
        v-for="(item, index) in tableProps"
        :key="index"
        :prop="item.value"
        :label="item.label"
      >
        <template #header>
          <div class="diff-table-header">
            {{ dayjs(item.value).format('YYYY-MM-DD HH:mm:ss') }}
            <el-radio v-model="diffPivot" :label="index">作为diff基准</el-radio>
          </div>
        </template>
        <template #default="{ row }">
          <div class="of-auto">
            <pre>{{ row[item.value] }}</pre>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { PropType, computed, ref, watch } from 'vue'
import { type VChatStartupLog } from '@geekgeekrun/sqlite-plugin/src/entity/VChatStartupLog'
import { JobInfoChangeLog } from '@geekgeekrun/sqlite-plugin/src/entity/JobInfoChangeLog'
import { ElTable, ElTableColumn } from 'element-plus'
import dayjs from 'dayjs'

const props = defineProps({
  jobInfo: {
    type: Object as PropType<VChatStartupLog>,
    required: true
  },
  jobInfoHistoryList: {
    type: Array as PropType<JobInfoChangeLog[]>,
    default: () => []
  }
})

const tableProps = computed(() =>
  props.jobInfoHistoryList.map((it) => {
    return {
      label: it.__ggr_updateTime,
      value: it.__ggr_updateTime
    }
  })
)
/**
 *  定义映射字段表(最好取全量字段)
 * */
const mapObj = {
  jobName: '职位名称',
  positionName: '职位分类',
  experienceName: '工作经验',
  degreeName: '学历',
  salaryDesc: '薪资',
  postDescription: '职位描述',
  locationName: '工作地点',
  address: '地址'
}

const dataForRender = computed(() => {
  const newArr = []
  const keys = Object.keys(mapObj)
  keys.forEach((key, keyIndex) => {
    const obj = {
      title: mapObj[key]
    }
    tableProps.value.forEach((dateKey, dataKeyIndex) => {
      obj[dateKey.value] = props.jobInfoHistoryList[dataKeyIndex][keys[keyIndex]]
    })
    newArr.push(obj)
  })
  return newArr
})

const diffPivot = ref(0)
watch(
  () => props.jobInfoHistoryList,
  () => {
    if (!props.jobInfoHistoryList.length) {
      diffPivot.value = 0
      return
    }
    diffPivot.value = props.jobInfoHistoryList.length - 1
  }
)
</script>

<style lang="scss" scoped>
.form {
  :deep(.el-form-item__label) {
    color: #999;
  }
}
.diff-table-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
<style lang="scss"></style>
