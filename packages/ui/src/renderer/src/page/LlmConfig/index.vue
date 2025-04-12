<template>
  <div class="llm-config-page">
    <div class="mt1em mb1em">
      <span>大语言模型设置</span>
    </div>
    <el-form
      ref="formRef"
      :model="formContent"
      :rules="formRules"
      label-position="top"
      class="llm-config-form"
    >
      <div v-for="(conf, index) in formContent" :key="index">
        <div>
          <el-form-item prop="providerCompleteApiUrl">
            <div
              class="el-form-item__label flex-items-center flex-justify-between w-full pr0px"
              :style="{ display: 'flex' }"
            >
              <div>服务提供商 Base Url</div>
              <el-dropdown @command="(item) => handlePresetClick(item, index)">
                <el-button size="small"
                  >配置模板 <el-icon class="el-icon--right"><arrow-down /></el-icon
                ></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="item in llmPresetList"
                      :key="item.name"
                      :command="item"
                      >{{ item.name }}</el-dropdown-item
                    >
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <el-input
              v-model="conf.providerCompleteApiUrl"
              :autosize="{
                minRows: 10,
                maxRows: 10
              }"
              font-size-12px
            ></el-input>
          </el-form-item>
          <el-form-item prop="model" label="要使用的模型">
            <el-input
              v-model="conf.model"
              :autosize="{
                minRows: 10,
                maxRows: 10
              }"
              font-size-12px
            ></el-input>
          </el-form-item>
          <el-form-item prop="providerApiSecret" label="从服务提供商处获取的 API Secret">
            <el-input
              v-model="conf.providerApiSecret"
              :autosize="{
                minRows: 10,
                maxRows: 10
              }"
              font-size-12px
            ></el-input>
          </el-form-item>
          <div class="serve-weight-config">
            <div class="flex">
              <el-form-item prop="enabled">
                <div class="el-form-item__label">启用</div>
                <el-checkbox
                  v-model="conf.enabled"
                  :autosize="{
                    minRows: 10,
                    maxRows: 10
                  }"
                  font-size-12px
                ></el-checkbox>
              </el-form-item>
              <el-form-item prop="serveWeight" class="ml40px">
                <div class="el-form-item__label">权重</div>
                <el-input-number
                  v-model="conf.serveWeight"
                  :autosize="{
                    minRows: 10,
                    maxRows: 10
                  }"
                  :min="0"
                  :max="100"
                  :step="1"
                  step-strictly
                  :precision="0"
                  font-size-12px
                  placeholder="0 ~ 100"
                ></el-input-number>
              </el-form-item>
            </div>
            <div class="flex">
              <!-- <el-form-item class="ml20px">
                <el-button type="text">测试设置</el-button>
              </el-form-item> -->
            </div>
          </div>
        </div>
      </div>
    </el-form>
    <footer flex mt20px pb20px flex-justify-between>
      <div>
        <!-- <el-button type="text" @click="handleTestAvailability">测试可用性</el-button> -->
      </div>
      <div>
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { ElForm, ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon, ElButton } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { ref, onMounted } from 'vue'

interface LlmConfigItem {
  providerCompleteApiUrl: string
  providerApiSecret: string
  model: string
  serveWeight: number
  enabled: true
}

const formRef = ref<InstanceType<typeof ElForm>>()
const formContent = ref<LlmConfigItem[]>([
  {
    providerCompleteApiUrl: '',
    providerApiSecret: '',
    model: '',
    serveWeight: 10,
    enabled: true
  }
])

const formRules = {}

const handleCancel = () => {
  electron.ipcRenderer.send('close-llm-config')
}
const handleSubmit = async () => {
  electron.ipcRenderer.invoke('save-llm-config', JSON.parse(JSON.stringify(formContent.value)))
}

onMounted(async () => {
  const savedFileContent = (await electron.ipcRenderer.invoke('fetch-config-file-content'))
    ?.config?.['llm.json']
  if (!savedFileContent) {
    return
  }
  for (const k of Object.keys(formContent.value)) {
    formContent.value[k] = savedFileContent[k]
  }
})

const llmPresetList: {
  name: string
  config: LlmConfigItem
}[] = [
  {
    name: '由 DeepSeek 提供 DeepSeek-V3 模型',
    config: {
      model: 'deepseek-chat',
      providerApiSecret: '',
      providerCompleteApiUrl: 'https://api.deepseek.com/v1',
      serveWeight: 100,
      enabled: true
    }
  },
  // TODO:
  // {
  //   name: '通过 Ollama 部署的 DeepSeek-R1（14B）模型',
  //   config: {
  //     model: 'deepseek-r1:14b',
  //     providerApiSecret: 'ollama',
  //     providerCompleteApiUrl: 'http://127.0.0.1:11434/v1',
  //     serveWeight: 10,
  //     enabled: true
  //   }
  // },
  {
    name: '通过 Ollama 部署的 Qwen2.5（7B）模型',
    config: {
      model: 'qwen2.5:7b',
      providerApiSecret: 'ollama',
      providerCompleteApiUrl: 'http://127.0.0.1:11434/v1',
      serveWeight: 10,
      enabled: true
    }
  }
]

function handlePresetClick(selected: (typeof llmPresetList)[number], index) {
  for (const k of Object.keys(formContent.value[index])) {
    formContent.value[index][k] = selected.config[k]
  }
}

// function handleTestAvailability() {}
</script>

<style lang="scss" scoped>
.llm-config-page {
  margin: 0 auto;
  max-width: 480px;
}
</style>

<style lang="scss">
.llm-config-form.el-form {
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
  .serve-weight-config {
    display: flex;
    justify-content: space-between;
    .el-form-item__label {
      margin-bottom: 0;
    }
    .el-form-item__content {
      display: flex;
      flex-wrap: nowrap;
    }
  }
}
</style>
