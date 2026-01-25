<template>
  <div class="job-combo-filter">
    <div class="filter-item">
      <div font-size-12px>城市</div>
      <div
        style="
          align-items: center;
          background-color: var(--el-input-bg-color, var(--el-fill-color-blank));
          background-image: none;
          border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
          box-shadow: 0 0 0 1px var(--el-input-border-color, var(--el-border-color)) inset;
        "
        pl4px
        pr4px
        flex
        justify-between
        items-center
      >
        <city-chooser v-model="modelValue.cityList">
          <template #default="{ showDialog }">
            <div flex justify-between items-center>
              <div font-size-12px>
                <template v-if="modelValue.cityList?.length"
                  >已选择<span ml3px mr3px>{{ modelValue.cityList?.length }}</span
                  >个城市</template
                >
                <template v-else><i color-gray>未选择城市</i></template>
              </div>
              <el-button size="small" @click="showDialog" pl4px pr4px>选择</el-button>
            </div>
          </template>
        </city-chooser>
      </div>
    </div>
    <div class="filter-item">
      <div font-size-12px>薪资待遇</div>
      <el-select
        v-model="modelValue.salaryList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.salaryList.filter((it) => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
    <div class="filter-item">
      <div font-size-12px>工作经验</div>
      <el-select
        v-model="modelValue.experienceList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.experienceList.filter((it) => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
    <div class="filter-item">
      <div font-size-12px>学历要求</div>
      <el-select
        v-model="modelValue.degreeList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.degreeList.filter((it) => it.code !== 0)"
          :key="it.code"
          :value="it.code"
          :label="it.name"
        />
      </el-select>
    </div>
    <div class="filter-item">
      <div font-size-12px>公司行业</div>
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
      <div font-size-12px>公司规模</div>
      <el-select
        v-model="modelValue.scaleList"
        multiple
        clearable
        collapse-tags
        collapse-tags-tooltip
      >
        <el-option
          v-for="it in conditions.scaleList.filter((it) => it.code !== 0)"
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
import CityChooser from '@renderer/page/MainLayout/GeekAutoStartChatWithBoss/components/CityChooser.vue'
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
