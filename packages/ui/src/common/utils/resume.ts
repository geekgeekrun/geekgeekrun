export interface ResumeContent {
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

export function formatResumeJsonToMarkdown(resume) {
  const basicInfoText = [
    ['# 姓名', resume.content.name],
    ['# 工作年限', resume.content.workYearDesc],
    ['# 期望职位', resume.content.expectJob],
    ['# 个人优势', resume.content.userDescription]
  ]
    .filter((it) => {
      return Boolean(it[1]?.trim())
    })
    .map((it) => it.join('\n'))
    .join('\n\n')

  let formattedWorkExpText = resume.content.geekWorkExpList
    .filter((it) => Boolean(it.company?.trim()))
    .map((it) => {
      const info = [
        [`职务`, it.positionName],
        [`任职时间`],
        [`工作描述`, it.workDescription],
        [`工作业绩`, it.performance]
      ].filter((it) => {
        return Boolean(it[1]?.trim())
      })
      return [[`## ${it.company}`], ...info].map((it) => it.join('\n')).join('\n\n')
    })
    .join('\n')
  if (formattedWorkExpText?.trim()) {
    formattedWorkExpText = '# 工作经历\n' + formattedWorkExpText
  }

  let formattedProjWorkExpText = resume.content.geekProjExpList
    .filter((it) => Boolean(it.name?.trim()))
    .map((it) => {
      const info = [
        [`## ${it.name}`],
        [`项目角色`, it.roleName],
        [`项目时间`],
        [`工作描述`, it.projectDescription],
        [`工作业绩`, it.performance]
      ].filter((it) => {
        return Boolean(it[1]?.trim())
      })

      return [[`## ${it.name}`], ...info].map((it) => it.join('\n')).join('\n\n')
    })
    .join('\n')
  if (formattedProjWorkExpText?.trim()) {
    formattedProjWorkExpText = '# 项目经历\n' + formattedProjWorkExpText
  }

  const result = `${basicInfoText}\n\n${formattedWorkExpText}\n\n${formattedProjWorkExpText}`

  return result
}

export function checkIsResumeContentValid(resumeItem: { content: ResumeContent }) {
  return (
    !!resumeItem?.content &&
    resumeItem.content.geekProjExpList?.[0]?.name?.trim() &&
    resumeItem.content.geekWorkExpList?.[0]?.positionName?.trim()
  )
}

export function resumeContentEnoughDetect(resumeItem: { content: ResumeContent }) {
  return resumeItem?.content && formatResumeJsonToMarkdown(resumeItem)?.length > 800
}
