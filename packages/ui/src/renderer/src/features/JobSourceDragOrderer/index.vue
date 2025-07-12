<template>
  <draggable
    :model-value="modelValue"
    class="list-group"
    :component-data="{
      tag: 'ul',
      type: 'transition-group',
      name: !drag ? 'flip-list' : null
    }"
    :group="{ name: 'parent', put: ['parent'] }"
    v-bind="dragOptions"
    handle=".drag-handle-wrap"
    @update:model-value="emit('update:model-value', $event)"
    @start="drag = true"
    @end="drag = false"
  >
    <template #item="{ element }">
      <li class="list-group-item">
        <div flex flex-items-center>
          <span class="drag-handle-wrap">
            <span class="drag-handle" />
          </span>
          <span class="inner-content">
            <div flex w-full flex-1>
              <template
                v-if="
                  element.item.type === 'search' &&
                  (!element.item?.children?.length ||
                    !element.item?.children?.some((it) => it.enabled) ||
                    !element.item?.children?.some((it) => !!it.keyword?.trim()))
                "
              >
                <el-switch
                  model-value="false"
                  mr10px
                  disabled
                  active-text="启用"
                  inactive-text="禁用"
                  inline-prompt
                />
                {{ element.label }}
              </template>
              <template v-else>
                <el-switch
                  v-model="element.item.enabled"
                  mr10px
                  active-text="启用"
                  inactive-text="禁用"
                  inline-prompt
                />
                {{ element.label }}
              </template>
            </div>
            <div v-if="element.item.type === 'search'">
              <div flex flex-items-center>
                <span color-orange align-self-end mr10px>
                  <template v-if="!element.item?.children?.length">
                    添加一个关键词后方可启用-&gt;
                  </template>
                  <template
                    v-else-if="
                      element.item?.children?.every((it) => !(it.enabled && !!it.keyword?.trim()))
                    "
                  >
                    至少启用下方任意一个不为空的关键词后方可启用
                  </template>
                  <template
                    v-else-if="element.item?.children?.some((it) => it.enabled && !it.keyword?.trim())"
                  >
                    留空的关键词会被跳过
                  </template>
                </span>
                <el-button p-0 h-fit type="text" @click="addSearchKeyword(element.item)"
                  >添加关键词</el-button
                >
              </div>
            </div>
          </span>
        </div>
        <div v-if="element.item.type === 'search' && element.item?.children?.length">
          <draggable
            v-model="element.item.children"
            class="list-group"
            :component-data="{
              tag: 'ul',
              type: 'transition-group',
              name: !drag ? 'flip-list' : null
            }"
            :group="{ name: 'child', put: ['child'] }"
            v-bind="dragOptions"
            handle=".drag-handle-wrap"
            @start="drag = true"
            @end="drag = false"
          >
            <template #item="{ element: searchItem, index }">
              <li class="list-group-item">
                <div flex flex-items-center>
                  <span class="drag-handle-wrap">
                    <span class="drag-handle" />
                  </span>
                  <span class="inner-content">
                    <div flex w-full>
                      <el-switch
                        v-if="element.item.enabled"
                        v-model="searchItem.enabled"
                        mr10px
                        active-text="启用"
                        inactive-text="禁用"
                        inline-prompt
                      />
                      <el-switch
                        v-else
                        disabled
                        :model-value="false"
                        mr10px
                        active-text="启用"
                        inactive-text="禁用"
                        inline-prompt
                      />
                      <el-input
                        v-model="searchItem.keyword"
                        maxlength="100"
                        @blur="() => (searchItem.keyword = searchItem.keyword?.trim() ?? '')"
                      />
                    </div>
                    <el-button
                      p-0
                      ml-10px
                      h-fit
                      type="danger"
                      link
                      @click="removeSearchKeywordByIndex(element.item, index)"
                      >删除</el-button
                    >
                  </span>
                </div>
              </li>
            </template>
          </draggable>
        </div>
      </li>
    </template>
  </draggable>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'

defineProps({
  modelValue: {
    type: Array
  }
})

const emit = defineEmits(['update:model-value'])

const drag = ref(false)

const dragOptions = computed(() => {
  return {
    animation: 200,
    disabled: false,
    ghostClass: 'ghost'
  }
})

function addSearchKeyword(item) {
  if (!item.children) {
    item.children = []
  }
  item.children.push({
    type: 'search-kw',
    enabled: true,
    keyword: ''
  })
}

function removeSearchKeywordByIndex(item, index) {
  item.children?.splice(index, 1)
}
</script>

<style lang="scss" scoped>
.ghost {
  opacity: 0.5;
  filter: blur(2px);
}

.list-group {
  line-height: 32px;
  min-height: 20px;
  .list-group {
    margin-left: 20px;
  }
  .list-group-item {
    background-color: #fff;
    list-style: none;
    display: flex;
    flex-direction: column;
    padding-top: 6px;
    padding-bottom: 6px;
    padding-right: 10px;
    border: 1px solid var(--el-card-border-color);
    margin-top: 6px;
    margin-bottom: 6px;
    box-shadow: var(--el-box-shadow-light);
    border-radius: 4px;
    .inner-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      ::v-deep(.el-checkbox) {
        .el-checkbox__label {
          width: 100%;
        }
      }
    }
    .drag-handle-wrap {
      display: flex;
      justify-content: flex-end;
      width: 25px;
      height: 1em;
      cursor: grab;
      margin-right: 4px;
      .drag-handle {
        width: 20px;
        background-image: linear-gradient(
          90deg,
          transparent 35%,
          var(--el-card-border-color) 35%,
          var(--el-card-border-color) 45%,
          transparent 45%,
          transparent 55%,
          var(--el-card-border-color) 55%,
          var(--el-card-border-color) 65%,
          transparent 65%,
          transparent 100%
        );
      }
    }
  }
}
</style>
