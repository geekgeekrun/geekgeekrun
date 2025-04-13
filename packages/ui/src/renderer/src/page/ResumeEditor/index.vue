<template>
  <div class="resume-editor-page">
    <div class="main-wrapper">
      <main>
        <div class="mt1em mb1em flex flex-items-center flex-justify-between">
          <span>简历编辑器</span>
        </div>
        <el-alert type="info" :closable="false" mb20px line-height-1.25em>
          <ul pl16px m0>
            <li>
              此简历将作为提示词的一部分提交给语言大模型，仅在匹配职位、生成已读不回提醒消息时使用；大部分信息非必填，但在不填写的情况下，可能会匹配到不准确的职位或生成预料之外的已读不回提醒消息
            </li>
            <li>期望薪资仅作匹配职位使用，不会用作生成已读不回提醒消息</li>
          </ul>
        </el-alert>
        <el-form
          ref="formRef"
          :model="formContent"
          :rules="formRules"
          label-position="top"
          class="resume-editor-form"
        >
          <div
            :style="{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px'
            }"
          >
            <el-form-item label="姓名">
              <el-input v-model="formContent.name" font-size-12px></el-input>
            </el-form-item>
            <el-form-item label="工作年限">
              <el-input v-model="formContent.workYearDesc" font-size-12px></el-input>
            </el-form-item>
            <el-form-item label="期望职位">
              <el-input v-model="formContent.expectJob" font-size-12px></el-input>
            </el-form-item>
            <el-form-item label="期望薪资（k）">
              <div
                :style="{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr'
                }"
              >
                <el-input v-model="formContent.expectSalary[0]" placeholder="下限" />
                <el-input v-model="formContent.expectSalary[1]" placeholder="上限" />
              </div>
            </el-form-item>
          </div>

          <el-form-item label="个人优势">
            <el-input
              v-model="formContent.userDescription"
              type="textarea"
              :autosize="{
                minRows: 6,
                maxRows: 8
              }"
              font-size-12px
            ></el-input>
          </el-form-item>
          <el-form-item>
            <div class="el-form-item__label">
              工作经历
              <el-button size="small" :icon="Plus" @click="addWorkExp">新增一条</el-button>
            </div>
            <div v-for="(exp, index) in formContent.geekWorkExpList" :key="index">
              <div
                :style="{
                  display: 'flex',
                  gap: '12px'
                }"
              >
                <div
                  :style="{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    height: 'fit-content',
                    marginTop: '10px'
                  }"
                >
                  <el-button
                    :disabled="index <= 0"
                    style="margin: 0"
                    circle
                    size="small"
                    :icon="ArrowUp"
                    @click="moveWorkExpUp(index)"
                  />
                  <el-button
                    :disabled="index >= formContent.geekWorkExpList.length - 1"
                    style="margin: 0"
                    circle
                    size="small"
                    :icon="ArrowDown"
                    @click="moveWorkExpDown(index)"
                  />
                  <el-button
                    :disabled="1 >= formContent.geekWorkExpList.length"
                    style="margin: 0"
                    circle
                    size="small"
                    :icon="Delete"
                    @click="removeWorkExp(index)"
                  />
                </div>
                <div>
                  <div
                    :style="{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.25fr 1fr',
                      gap: '10px',
                      width: '100%'
                    }"
                  >
                    <el-form-item label="公司名称" style="margin-bottom: 18px">
                      <el-input v-model="exp.company" />
                    </el-form-item>
                    <el-form-item label="任职时间" style="margin-bottom: 18px">
                      <div
                        :style="{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr'
                        }"
                      >
                        <el-date-picker
                          v-model="exp.startYearMon"
                          :style="{ '--el-date-editor-width': 'auto' }"
                          type="month"
                          placeholder="开始月份"
                        />
                        <el-date-picker
                          v-model="exp.endYearMon"
                          :style="{ '--el-date-editor-width': 'auto' }"
                          type="month"
                          placeholder="结束月份"
                        />
                      </div>
                    </el-form-item>
                    <el-form-item label="职务" style="margin-bottom: 18px">
                      <el-input v-model="exp.positionName" />
                    </el-form-item>
                  </div>
                  <el-form-item label="工作描述" style="margin-bottom: 18px">
                    <el-input
                      v-model="exp.workDescription"
                      type="textarea"
                      :autosize="{
                        minRows: 6,
                        maxRows: 8
                      }"
                      font-size-12px
                    />
                  </el-form-item>
                  <el-form-item label="工作业绩">
                    <el-input
                      v-model="exp.performance"
                      type="textarea"
                      :autosize="{
                        minRows: 6,
                        maxRows: 8
                      }"
                      font-size-12px
                    />
                  </el-form-item>
                  <div
                    v-if="index !== formContent.geekWorkExpList.length - 1"
                    class="mt20px mb20px h1px"
                    style="background-color: #dcdcdc"
                  />
                </div>
              </div>
            </div>
          </el-form-item>
          <el-form-item>
            <div class="el-form-item__label">
              项目经历
              <el-button size="small" :icon="Plus" @click="addProjExp">新增一条</el-button>
            </div>
            <div v-for="(proj, index) in formContent.geekProjExpList" :key="index">
              <div
                :style="{
                  display: 'flex',
                  gap: '12px'
                }"
              >
                <div
                  :style="{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    height: 'fit-content',
                    marginTop: '10px'
                  }"
                >
                  <el-button
                    :disabled="index <= 0"
                    style="margin: 0"
                    circle
                    size="small"
                    :icon="ArrowUp"
                    @click="moveProjExpUp(index)"
                  />
                  <el-button
                    :disabled="index >= formContent.geekProjExpList.length - 1"
                    style="margin: 0"
                    circle
                    size="small"
                    :icon="ArrowDown"
                    @click="moveProjExpDown(index)"
                  />
                  <el-button
                    :disabled="1 >= formContent.geekProjExpList.length"
                    style="margin: 0"
                    circle
                    size="small"
                    :icon="Delete"
                    @click="removeProjExp(index)"
                  />
                </div>
                <div>
                  <div
                    :style="{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1.25fr',
                      gap: '10px',
                      width: '100%'
                    }"
                  >
                    <el-form-item label="项目名称" style="margin-bottom: 18px">
                      <el-input v-model="proj.name" />
                    </el-form-item>
                    <el-form-item label="项目角色" style="margin-bottom: 18px">
                      <el-input v-model="proj.roleName" />
                    </el-form-item>
                    <el-form-item label="项目时间" style="margin-bottom: 18px">
                      <div
                        :style="{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr'
                        }"
                      >
                        <el-date-picker
                          v-model="proj.startYearMon"
                          :style="{ '--el-date-editor-width': 'auto' }"
                          type="month"
                          placeholder="开始月份"
                        />
                        <el-date-picker
                          v-model="proj.endYearMon"
                          :style="{ '--el-date-editor-width': 'auto' }"
                          type="month"
                          placeholder="结束月份"
                        />
                      </div>
                    </el-form-item>
                  </div>
                  <el-form-item label="项目描述" style="margin-bottom: 18px">
                    <el-input
                      v-model="proj.projectDescription"
                      type="textarea"
                      :autosize="{
                        minRows: 6,
                        maxRows: 8
                      }"
                      font-size-12px
                    />
                  </el-form-item>
                  <el-form-item label="项目业绩">
                    <el-input
                      v-model="proj.performance"
                      type="textarea"
                      :autosize="{
                        minRows: 6,
                        maxRows: 8
                      }"
                      font-size-12px
                    />
                  </el-form-item>
                  <div
                    v-if="index !== formContent.geekProjExpList.length - 1"
                    class="mt20px mb20px h1px"
                    style="background-color: #dcdcdc"
                  />
                </div>
              </div>
            </div>
          </el-form-item>
        </el-form>
      </main>
    </div>
    <footer pt10px pb10px flex flex-justify-center>
      <div w768px flex flex-justify-between>
        <div>
          <!-- <el-button type="text" @click="handleTestAvailability">测试可用性</el-button> -->
        </div>
        <div>
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </div>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { ElForm, ElButton, ElAlert } from 'element-plus'
import { ref, onMounted } from 'vue'
import { ArrowUp, ArrowDown, Delete, Plus } from '@element-plus/icons-vue'

interface ResumeContent {
  name: string
  workYearDesc: string
  expectJob: string
  userDescription: string
  geekWorkExpList: Array<{
    company: string
    positionName: string
    startYearMon: string | null
    endYearMon: string | null
    performance: string
    workDescription: string
  }>
  geekProjExpList: Array<{
    name: string
    startYearMon: string
    endYearMon: string
    roleName: string
    projectDescription: string
    performance: string
  }>
  expectSalary: [string, string]
}

const formRef = ref<InstanceType<typeof ElForm>>()

const getEmptyFormContent = () => {
  const o: any = {
    expectJob: '',
    name: '',
    userDescription: '',
    workYearDesc: '',
    expectSalary: ['', ''],
    geekWorkExpList: [],
    geekProjExpList: []
  }
  o.geekProjExpList = [getNewProjExpItem()]
  o.geekWorkExpList = [getNewWorkExpItem()]

  return o as ResumeContent
}
const formContent = ref<ResumeContent>(getEmptyFormContent())

const formRules = {}

const handleCancel = () => {
  electron.ipcRenderer.send('close-resume-editor')
}
const handleSubmit = async () => {
  electron.ipcRenderer.invoke('save-resume-content', JSON.parse(JSON.stringify(formContent.value)))
}

onMounted(async () => {
  try {
    const savedFileContent = await electron.ipcRenderer.invoke('fetch-resume-content')
    if (!savedFileContent) {
      return
    }
    for (const k of Object.keys(formContent.value)) {
      formContent.value[k] = savedFileContent[k]
    }
    if (!formContent.value.expectSalary) {
      formContent.value.expectSalary = ['', '']
    }
    if (!formContent.value.expectSalary?.[0] || /\D/.test(formContent.value.expectSalary?.[0])) {
      formContent.value.expectSalary[0] = ''
    }
    if (!formContent.value.expectSalary?.[1] || /\D/.test(formContent.value.expectSalary?.[1])) {
      formContent.value.expectSalary[1] = ''
    }
    if (!formContent.value.geekProjExpList?.length) {
      formContent.value.geekProjExpList = [getNewProjExpItem()]
    }
    if (!formContent.value.geekWorkExpList?.length) {
      formContent.value.geekWorkExpList = [getNewWorkExpItem()]
    }
  } catch (err) {
    formContent.value = getEmptyFormContent()
  }
})

// function handlePresetClick(selected: (typeof llmPresetList)[number]) {}

// #region edit work exp list
function getNewWorkExpItem() {
  return {
    company: '',
    endYearMon: '',
    positionName: '',
    startYearMon: '',
    performance: '',
    workDescription: ''
  }
}
function addWorkExp() {
  formContent.value.geekWorkExpList.push(getNewWorkExpItem())
}
function moveWorkExpUp(index) {
  ;[formContent.value.geekWorkExpList[index], formContent.value.geekWorkExpList[index - 1]] = [
    formContent.value.geekWorkExpList[index - 1],
    formContent.value.geekWorkExpList[index]
  ]
}

function moveWorkExpDown(index) {
  ;[formContent.value.geekWorkExpList[index], formContent.value.geekWorkExpList[index + 1]] = [
    formContent.value.geekWorkExpList[index + 1],
    formContent.value.geekWorkExpList[index]
  ]
}

function removeWorkExp(index) {
  formContent.value.geekWorkExpList.splice(index, 1)
}
// #endregion

// #region edit proj list
function getNewProjExpItem() {
  return {
    name: '',
    endYearMon: '',
    roleName: '',
    startYearMon: '',
    performance: '',
    projectDescription: ''
  }
}
function addProjExp() {
  formContent.value.geekProjExpList.push(getNewProjExpItem())
}
function moveProjExpUp(index) {
  ;[formContent.value.geekProjExpList[index], formContent.value.geekProjExpList[index - 1]] = [
    formContent.value.geekProjExpList[index - 1],
    formContent.value.geekProjExpList[index]
  ]
}

function moveProjExpDown(index) {
  ;[formContent.value.geekProjExpList[index], formContent.value.geekProjExpList[index + 1]] = [
    formContent.value.geekProjExpList[index + 1],
    formContent.value.geekProjExpList[index]
  ]
}

function removeProjExp(index) {
  formContent.value.geekProjExpList.splice(index, 1)
}
// #endregion
</script>

<style lang="scss" scoped>
.resume-editor-page {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: 100vh;
  .main-wrapper {
    overflow: auto;
    main {
      margin: 0 auto;
      max-width: 768px;
    }
  }
  footer {
    background-color: #f0f0f0;
  }
}
</style>

<style lang="scss">
.resume-editor-form.el-form {
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
}
</style>
