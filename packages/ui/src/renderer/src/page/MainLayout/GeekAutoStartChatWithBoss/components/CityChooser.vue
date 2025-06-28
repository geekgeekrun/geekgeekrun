<template>
  <div>
    <div v-if="modelValue?.length">
      <div>当前已选择城市：</div>
      <div flex flex-wrap gap-10px>
        <el-tag v-for="it in modelValue" :key="it">
          {{ it }}
        </el-tag>
      </div>
    </div>
    <div v-else>
      <div>当前未选择任何期望城市，将不会按照城市进行筛选</div>
    </div>
    <div
      line-height-1
      :style="{
        marginTop: modelValue?.length ? '10px' : ''
      }"
    >
      <el-button
        size="small"
        type="primary"
        @click="
          () => {
            isDialogVisible = true
            gtagRenderer('choose_city_entry_button_clicked')
          }
        "
        >选择城市</el-button
      >
      <el-button
        v-if="modelValue?.length"
        size="small"
        type="danger"
        @click="handleClearSelectedCitiesInModelValue"
        >清空已选择的所有城市</el-button
      >
    </div>
    <el-dialog
      v-model="isDialogVisible"
      width="1000px"
      title="请选择城市"
      :show-close="false"
      @open="handleDialogOpen"
      @closed="handleDialogClosed"
    >
      <el-tabs v-model="activeTabName">
        <el-tab-pane
          :style="{ height: '300px', overflow: 'auto' }"
          label="热门城市"
          name="热门城市"
        >
          <el-checkbox-group v-model="selectedCities">
            <div
              :style="{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr'
              }"
            >
              <el-checkbox
                v-for="op in hotCityList.filter((it) => it.code !== 100010000)"
                :key="op.code"
                :label="op.name"
              >
                {{ op.name }}
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </el-tab-pane>
        <el-tab-pane
          v-for="it in cityGroupsByAlphabetMap.keys()"
          :key="it"
          :style="{ height: '300px', overflow: 'auto' }"
          :label="it"
          :value="it"
        >
          <div v-for="group in cityGroupsByAlphabetMap.get(it)" :key="group.firstChar">
            {{ group.firstChar }}
            <el-checkbox-group v-model="selectedCities">
              <div
                :style="{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr'
                }"
              >
                <el-checkbox v-for="op in group.cityList" :key="op.code" :label="op.name">
                  {{ op.name }}
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <div
          :style="{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }"
        >
          <div>
            <el-button
              v-if="selectedCities.length"
              type="danger"
              @click="handleClearSelectedCitiesInDialog"
              >清空已选择的所有城市</el-button
            >
          </div>
          <div>
            <el-button @click="handleCancelClicked">取消</el-button>
            <el-button type="primary" @click="handleConfirmClicked">确定</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { PropType, ref } from 'vue'
import cityGroupData from '../../../../../../common/constant/cityGroup.json'
import { gtagRenderer } from '@renderer/utils/gtag'

const props = defineProps({
  modelValue: {
    type: Array as PropType<string[]>
  }
})
const emits = defineEmits(['update:modelValue'])
const { hotCityList, cityGroup } = cityGroupData.zpData

const activeTabName = ref('热门城市')
const isDialogVisible = ref(false)
const selectedCities = ref([])

const cityGroupsByAlphabetMap = ref(
  new Map(['ABCDE', 'FGHJ', 'KLMN', 'PQRST', 'WXYZ'].map((it) => [it, []]))
)
for (const group of cityGroup) {
  const { firstChar } = group
  const targetKey =
    [...cityGroupsByAlphabetMap.value.keys()].find((it) => it.includes(firstChar)) ?? null
  if (!targetKey) {
    if (!cityGroupsByAlphabetMap.value.get(targetKey)) {
      cityGroupsByAlphabetMap.value.set(targetKey, [])
    }
  }
  cityGroupsByAlphabetMap.value.get(targetKey)?.push(group)
}

function handleDialogOpen() {
  activeTabName.value = '热门城市'
  selectedCities.value = [...(props.modelValue ?? [])]
  gtagRenderer('choose_city_dialog_open')
}

function handleCancelClicked() {
  gtagRenderer('choose_city_cancel_button_clicked')
  isDialogVisible.value = false
}
function handleConfirmClicked() {
  gtagRenderer('choose_city_confirm_button_clicked', { value: selectedCities.value.join(',') })
  isDialogVisible.value = false
  emits('update:modelValue', [...(selectedCities.value ?? [])])
}
function handleDialogClosed() {
  selectedCities.value = []
  gtagRenderer('choose_city_dialog_closed')
}

function handleClearSelectedCitiesInModelValue() {
  emits('update:modelValue', [])
  gtagRenderer('clear_selected_cities_in_mv_clicked')
}
function handleClearSelectedCitiesInDialog() {
  selectedCities.value = []
  gtagRenderer('clear_selected_cities_in_dialog_clicked')
}
</script>
