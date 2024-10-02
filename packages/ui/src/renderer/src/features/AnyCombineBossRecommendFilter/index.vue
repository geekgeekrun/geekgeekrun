<template>
  <div class="job-combo-filter">
    <div class="filter-item">
      <div>薪资待遇</div>
      <el-select
        v-model="modelValue.salaryList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.salaryList.filter(it => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
    <div class="filter-item">
      <div>工作经验</div>
      <el-select
        v-model="modelValue.experienceList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.experienceList.filter(it => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
    <div class="filter-item">
      <div>学历要求</div>
      <el-select
        v-model="modelValue.degreeList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.degreeList.filter(it => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
    <div class="filter-item">
      <div>公司行业</div>
      <el-select
        v-model="modelValue.industryList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option-group
          v-for="group in industryFilterExemption"
          :key="group.code"
          :label="group.name"
        >
          <el-option
            v-for="item in group.subLevelModelList"
            :key="item.code"
            :label="item.name"
            :value="item.code"
          />
        </el-option-group>
      </el-select>
    </div>
    <div class="filter-item">
      <div>公司规模</div>
      <el-select
        v-model="modelValue.scaleList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.scaleList.filter(it => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
  </div>
</template>

<script lang="ts" setup>
import conditions from '@geekgeekrun/geek-auto-start-chat-with-boss/internal-config/job-filter-conditions-20241002.json'
import industryFilterExemption from '@geekgeekrun/geek-auto-start-chat-with-boss/internal-config/job-filter-industry-filter-exemption-20241002.json'
import { PropType } from 'vue'

defineProps({
  modelValue: {
    type: Object as PropType<{
      salaryList: number[]
      experienceList: number[]
      degreeList: number[]
      industryList: number[]
      scaleList: number[]
    }>
  }
})
</script>

<style lang="scss" scoped>
.job-combo-filter {
  display: flex;
  width: 100%;
  gap: 10px;
  .filter-item {
    flex: 1;
  }
}
</style>
