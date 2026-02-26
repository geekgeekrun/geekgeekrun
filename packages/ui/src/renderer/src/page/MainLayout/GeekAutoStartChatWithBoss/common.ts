import { SalaryCalculateWay, JobDetailRegExpMatchLogic } from '@geekgeekrun/sqlite-plugin/src/enums'
import sampleCompanyList from '@geekgeekrun/geek-auto-start-chat-with-boss/default-config-file/sample-company-list.json'
import { nextTick } from 'vue'

export function isJobDetailRegExpEmpty({ formContent }) {
  return [
    formContent.expectJobDescRegExpStr,
    formContent.expectJobNameRegExpStr,
    formContent.expectJobTypeRegExpStr
  ]
    .map((it) => Boolean(it?.trim()))
    .every((it) => it === false)
}

export function getJobDetailRegExpMatchLogicConfig({ formContent }) {
  const result = {
    logicText: '-',
    inputPlaceholderText: '-'
  }
  if (formContent.jobDetailRegExpMatchLogic === JobDetailRegExpMatchLogic.EVERY) {
    Object.assign(result, {
      logicText: '且',
      inputPlaceholderText: 'true'
    })
  }
  if (formContent.jobDetailRegExpMatchLogic === JobDetailRegExpMatchLogic.SOME) {
    Object.assign(result, {
      logicText: '或',
      inputPlaceholderText: 'false'
    })
  }

  if (isJobDetailRegExpEmpty({ formContent })) {
    result.inputPlaceholderText = 'true'
  }
  return result
}

export const expectSalaryCalculateWayOption = [
  {
    name: '月薪（单位为 千元 - 即“k”）',
    value: SalaryCalculateWay.MONTH_SALARY
  },
  {
    name: '总包（单位为 万元 - 即“W”）',
    value: SalaryCalculateWay.ANNUAL_PACKAGE
  }
]

export function ensureSalaryRangeCorrect({ formContent }) {
  if (!formContent.expectSalaryHigh || isNaN(parseFloat(formContent.expectSalaryHigh))) {
    formContent.expectSalaryHigh = null
  } else {
    formContent.expectSalaryHigh = parseFloat(formContent.expectSalaryHigh.toFixed(2))
  }
  if (!formContent.expectSalaryLow || isNaN(parseFloat(formContent.expectSalaryLow))) {
    formContent.expectSalaryLow = null
  } else {
    formContent.expectSalaryLow = parseFloat(formContent.expectSalaryLow.toFixed(2))
  }

  if (
    formContent.expectSalaryLow &&
    formContent.expectSalaryHigh &&
    formContent.expectSalaryLow > formContent.expectSalaryHigh
  ) {
    formContent.expectSalaryHigh = formContent.expectSalaryLow
  }
}

export function getRuleOfExpectJobNameRegExpStr({ gtagRenderer, jobDetailRegExpSectionEl }) {
  return (_, value, cb) => {
    if (!value) {
      cb()
      gtagRenderer('empty_reg_exp_for_expect_job_name')
      return
    }
    try {
      new RegExp(value, 'ig')
      gtagRenderer('valid_reg_exp_for_expect_job_name', { v: value })
      cb()
    } catch (err) {
      cb(new Error(`正则无效：${err?.message}`))
      jobDetailRegExpSectionEl.value?.scrollIntoViewIfNeeded()
      gtagRenderer('invalid_reg_exp_for_expect_job_name', { v: value })
    }
  }
}

export function getRuleOfExpectJobTypeRegExpStr({ gtagRenderer, jobDetailRegExpSectionEl }) {
  return (_, value, cb) => {
    if (!value) {
      cb()
      gtagRenderer('empty_reg_exp_for_expect_job_type')
      return
    }
    try {
      new RegExp(value, 'ig')
      gtagRenderer('valid_reg_exp_for_expect_job_type', { v: value })
      cb()
    } catch (err) {
      cb(new Error(`正则无效：${err?.message}`))
      jobDetailRegExpSectionEl.value?.scrollIntoViewIfNeeded()
      gtagRenderer('invalid_reg_exp_for_expect_job_type', { v: value })
    }
  }
}

export function getRuleOfExpectJobDescRegExpStr({ gtagRenderer, jobDetailRegExpSectionEl }) {
  return (_, value, cb) => {
    if (!value) {
      cb()
      gtagRenderer('empty_reg_exp_for_expect_job_desc')
      return
    }
    try {
      new RegExp(value, 'ig')
      gtagRenderer('valid_reg_exp_for_expect_job_desc', { v: value })
      cb()
    } catch (err) {
      cb(new Error(`正则无效：${err?.message}`))
      jobDetailRegExpSectionEl.value?.scrollIntoViewIfNeeded()
      gtagRenderer('invalid_reg_exp_for_expect_job_desc', { v: value })
    }
  }
}

export function getRuleOfBlockCompanyNameRegExpStr({
  gtagRenderer,
  blockCompanyNameRegExpSectionEl
}) {
  return (_, value, cb) => {
    if (!value) {
      cb()
      gtagRenderer('empty_reg_exp_for_bcn')
      return
    }
    try {
      new RegExp(value, 'ig')
      gtagRenderer('valid_reg_exp_for_bcn', { v: value })
      cb()
    } catch (err) {
      cb(new Error(`正则无效：${err?.message}`))
      blockCompanyNameRegExpSectionEl.value?.scrollIntoViewIfNeeded()
      gtagRenderer('invalid_reg_exp_for_bcn', { v: value })
    }
  }
}

export const expectCompanyTemplateList = [
  {
    name: '不限公司（随便投）',
    value: ''
  },
  {
    name: '示例公司',
    value: sampleCompanyList.join(',')
  },
  {
    name: '大厂及关联企业',
    value: `抖音,字节,字跳,有竹居,脸萌,头条,懂车帝,滴滴,嘀嘀,巨量引擎,小桔,网易,有道,腾讯,酷狗,酷我,阅文,搜狗,小鹅通,富途,京东,沃东天骏,达达,达冠,京邦达,百度,昆仑芯,小度,度小满,爱奇艺,携程,趣拿,去哪儿,集度,智图,长地万方,瑞图万方,道道通,小熊博望,理想,蔚来,顺丰,丰巢,中通,圆通,申通,跨越,讯飞,同程,艺龙,马蜂窝,贝壳,自如,链家,我爱我家,相寓,多点,金山,小米,猎豹,新浪,微博,阿里,淘宝,淘麦郎,天猫,盒马,口碑,优视,夸克,UC,蚂蚁,高德,LAZADA,来赞达,飞猪,菜鸟,哈啰,钉钉,乌鸫,饿了么,美团,三快,猫眼,快手,映客,小红书,行吟,奇虎,360,三六零,鸿盈,奇富,奇元,亚信,启明星辰,奇安信,深信服,长亭,绿盟,天融信,商汤,SenseTime,大华,海康威视,hikvision,汽车之家,车好多,瓜子,易车,昆仑万维,昆仑天工,闲徕,趣加,FunPlus,完美,马上消费,轻松,水滴,白龙马,58,更赢,车欢欢,五八,红布林,致美,快狗,天鹅到家,转转,美餐,知乎,智者四海,易点云,搜狐,用友,畅捷通,猿辅导,小猿,猿力,好未来,学而思,希望学,新东方,东方甄选,东方优选,作业帮,高途,跟谁学,学科网,天学网,一起教育,一起作业,美术宝,火花思维,粉笔,51talk,爱学习,高思,老虎国际,一心向上,向上一意,联想,拉勾,乐视,欢聚,竞技世界,拼多多,寻梦,从鲸,TEMU,得物,有赞,Moka,希瑞亚斯,北森,OPPO,欧珀,vivo,维沃,小天才,步步高,读书郎,货拉拉,陌陌,探探,Shopee,虾皮,首汽租车,GoFun,神州租车,天眼查,旷视,小冰,美图,智谱华章,MiniMax,石头科技,迅雷,TP,锐捷,Tenda,腾达,斐讯,希音,SHEIN,稀宇,深言,百川智能,与爱为舞,牵手,Grab,爱回收,洋钱罐,瓴岳,得到,思维造物,地平线,咪咕,翼支付,电信,天翼,联通,蓝湖,墨刀,海尔,美的,米哈游,传音,同花顺,国美,TCL`
  },
  {
    name: '阿里系',
    value: `阿里,淘宝,淘麦郎,天猫,盒马,口碑,优视,夸克,UC,蚂蚁,飞猪,乌鸫,饿了么,LAZADA,来赞达,菜鸟,哈啰,钉钉,高德,白龙马,新浪,微博`
  },
  {
    name: '字节（头条/抖音）系',
    value: `抖音,字节,字跳,有竹居,脸萌,头条,懂车帝,巨量引擎`
  },
  {
    name: '百度系',
    value: `百度,昆仑芯,小度,度小满,爱奇艺,携程,趣拿,去哪儿,集度,作业帮,智图,长地万方,瑞图万方,道道通,小熊博望`
  },
  {
    name: '腾讯系',
    value: `腾讯,酷狗,酷我,阅文,搜狗,小鹅通,富途,京东,沃东天骏,达达,达冠,京邦达,美团,三快,猫眼,快手,拼多多,寻梦,从鲸,TEMU,Shopee,虾皮,滴滴,嘀嘀,小桔,转转`
  },
  {
    name: '外包、劳务派遣企业',
    value: `青钱,软通动力,南天,睿服,中电金信,佰钧成,云链,博彦,汉克时代,柯莱特,拓保,亿达信息,纬创,微创,微澜,诚迈科技,法本,兆尹,诚迈,联合永道,新致软件,宇信科技,华为,德科,FESCO,科锐,科之锐`
  }
]

export const blockCompanyNameRegExpTemplateList = [
  {
    name: '不限公司（不按照公司名称来标注不合适）',
    value: ''
  },
  {
    name: '外包、劳务派遣企业',
    value: `青钱|软通动力|南天|睿服|中电金信|佰钧成|云链|博彦|汉克时代|柯莱特|拓保|亿达信息|纬创|微创|微澜|诚迈科技|法本|兆尹|诚迈|联合永道|新致软件|宇信科技|华为|德科|FESCO|科锐|科之锐`
  },
  {
    name: '京东及相关公司',
    value: '京东|沃东天骏|达达|达冠|京邦达'
  }
]

export function getHandlerForExpectCompanyTemplateClicked({ gtagRenderer, formContent }) {
  return function handleExpectCompanyTemplateClicked(item) {
    gtagRenderer('expect_company_tpl_clicked', {
      name: item.name
    })
    formContent.value.expectCompanies = item.value
  }
}

export function getHandlerForExpectJobFilterTemplateClicked({ gtagRenderer, formContent }) {
  return function handleExpectJobFilterTemplateClicked(item) {
    gtagRenderer('expect_job_filter_tpl_clicked', {
      name: item.name
    })
    Object.assign(formContent.value, {
      ...item.config
    })
  }
}

export function getHandlerForBlockCompanyNameRegExpTemplateClicked({ gtagRenderer, formContent }) {
  return function handleBlockCompanyNameRegExpTemplateClicked(item) {
    gtagRenderer('bcn_reg_exp_tpl_clicked', {
      name: item.name
    })
    formContent.value.blockCompanyNameRegExpStr = item.value
  }
}

export const jobDetailRegExpMatchLogicOptions = [
  {
    name: '“且”模式 - 所有正则匹配时才认为职位匹配',
    value: JobDetailRegExpMatchLogic.EVERY
  },
  {
    name: '“或”模式 - 任一正则匹配时即认为职位匹配',
    value: JobDetailRegExpMatchLogic.SOME
  }
]

export function getHandlerForExpectSalaryCalculateWayChanged({ gtagRenderer, formContent }) {
  return async function handleExpectSalaryCalculateWayChanged(value) {
    gtagRenderer('expect_salary_calculate_way_changed', { value })

    await nextTick()
    // convert annual package to month salary as 12-month
    if (value === SalaryCalculateWay.MONTH_SALARY) {
      if (formContent.value.expectSalaryHigh) {
        formContent.value.expectSalaryHigh = Number(
          ((formContent.value.expectSalaryHigh * 10) / 12).toFixed(2)
        )
      }
      if (formContent.value.expectSalaryLow) {
        formContent.value.expectSalaryLow = Number(
          ((formContent.value.expectSalaryLow * 10) / 12).toFixed(2)
        )
      }
      return
    }
    // convert month salary to annual package as 12-month
    else if (value === SalaryCalculateWay.ANNUAL_PACKAGE) {
      if (formContent.value.expectSalaryHigh) {
        formContent.value.expectSalaryHigh = Number(
          ((formContent.value.expectSalaryHigh / 10) * 12).toFixed(2)
        )
      }
      if (formContent.value.expectSalaryLow) {
        formContent.value.expectSalaryLow = Number(
          ((formContent.value.expectSalaryLow / 10) * 12).toFixed(2)
        )
      }
      return
    }
  }
}

export const normalizeCommaSplittedStr = (str) => {
  return str
    .split(/,|，/)
    .map((it) => it.trim())
    .filter(Boolean)
    .join(',')
}
