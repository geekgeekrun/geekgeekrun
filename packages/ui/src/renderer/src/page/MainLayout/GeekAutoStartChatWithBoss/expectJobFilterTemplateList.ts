import { JobDetailRegExpMatchLogic } from '@geekgeekrun/sqlite-plugin/src/enums'

const expectJobFilterTemplateList = [
  {
    type: '不限职位',
    name: '不限职位（随便投）',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: 'Java',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '\\bJava\\b',
      expectJobDescRegExpStr:
        '\\bJava\\b|JVM|消息队列|MQ|SQL|Oracle|MongoDB|Redis|Nginx|Dubbo|Docker|K8s|Kubernetes',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: 'Golang',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '\\bGolang\\b',
      expectJobDescRegExpStr:
        '\\bGo\\b|\\bGolang\\b|消息队列|MQ|SQL|Oracle|MongoDB|Redis|Nginx|Dubbo|Docker|K8s|Kubernetes',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: '前端开发工程师、JavaScript',
    config: {
      expectJobNameRegExpStr: '前端|H5|\\bFE\\b',
      expectJobTypeRegExpStr: '前端开发|javascript',
      expectJobDescRegExpStr: '前端|vue|react|node|\\bjs\\b|javascript|H5',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: '测试工程师、测试开发',
    config: {
      expectJobNameRegExpStr: '测试|测开|QA|质量',
      expectJobTypeRegExpStr: '测试工程师|测试开发',
      expectJobDescRegExpStr:
        '测试|测开|QA|线上问题|自动化|复盘|效率|Selenium|Puppeteer|Playwright|Cypress|JMeter|LoadRunner|QTP|TestNG|JUnit|Pytest|Fiddler|Charles|Jenkins|Appium|黑盒|白盒|用例|缺陷|Linux|Ubuntu|Debian|CentOS|Shell|c\\+\\+|Python|PHP|\\bJava\\b|Node|\\bGo\\b|\\bGolang\\b',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: '运维工程师、运维开发工程师',
    config: {
      expectJobNameRegExpStr: '运维(开发)?|SRE',
      expectJobTypeRegExpStr: '运维(开发)?工程师',
      expectJobDescRegExpStr:
        '运维|SRE|服务器|云计算|Docker|K8s|Kubernetes|Linux|Ubuntu|Debian|CentOS|Shell|Python|\\bGo\\b|\\bGolang\\b|监控|Prometheus|Grafana|ELK|负载均衡|部署|Nginx|Apache|DevOps|harbor',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: '数据开发',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '数据开发',
      expectJobDescRegExpStr: 'c\\+\\+|Python|\\bGo\\b|\\bGolang\\b|\\bJava\\b|Node|数据仓库|ETL|大数据|Hadoop|Spark|Flink|Hive|Presto|数据湖|数仓|SQL|Oracle|MongoDB|Redis|Kafka',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '互联网/AI',
    name: '实施工程师',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '实施',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '产品',
    name: '产品经理',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '产品经理',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '产品',
    name: '用户研究',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '用户研究',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '产品',
    name: '游戏策划',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '游戏策划',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '客服/运营',
    name: '产品运营',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '产品运营',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '客服/运营',
    name: '用户运营',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '用户运营',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '客服/运营',
    name: '数据标注/AI训练师',
    config: {
      expectJobNameRegExpStr: '',
      expectJobTypeRegExpStr: '数据标注|AI训练师',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '财务/审计/税务',
    name: '会计、出纳',
    config: {
      expectJobNameRegExpStr: '会计|Accountant|出纳|财务',
      expectJobTypeRegExpStr: '会计|出纳',
      expectJobDescRegExpStr:
        '会计|财务|出纳|审计|账务|税务|总账|做账|应付|应收|成本|资产|资金|记账|发票|结算|核算|汇算|利润|对账|报税|回款|SAP|用友|金蝶',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '人力/行政/法务',
    name: '人力资源专员/助理、人力资源经理/主管',
    config: {
      expectJobNameRegExpStr: 'HR|人力|人资|人事',
      expectJobTypeRegExpStr: '人力',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '人力/行政/法务',
    name: 'HRBP',
    config: {
      expectJobNameRegExpStr: 'BP|HRG|HR|人力|人资|人事',
      expectJobTypeRegExpStr: 'HRBP|人力',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '人力/行政/法务',
    name: '员工关系',
    config: {
      expectJobNameRegExpStr: '员工关系|劳动关系|SSC|社保|HR|人力|人资|人事',
      expectJobTypeRegExpStr: '员工关系|人力',
      expectJobDescRegExpStr: '员工关系|劳动关系|SSC|社保|考勤|入职|离职|入转调离',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '人力/行政/法务',
    name: '招聘',
    config: {
      expectJobNameRegExpStr: '招聘|高招|Recruiter|HR|人力|人资|人事',
      expectJobTypeRegExpStr: '招聘|猎头|人力',
      expectJobDescRegExpStr:
        '招聘|高招|Recruiter|简历|面试|人才引进|Mapping|人才画像|offer|猎头|内推|外推|猎聘|Boss|拉勾|前程无忧|智联|58同城|领英|LinkedIn|ATS|人才库|Moka|北森|iTenant|倍罗|大易|伯乐',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.EVERY
    }
  },
  {
    type: '人力/行政/法务',
    name: '薪酬绩效',
    config: {
      expectJobNameRegExpStr: '薪酬|绩效|福利|COE|payroll',
      expectJobTypeRegExpStr: '薪酬绩效',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
  {
    type: '人力/行政/法务',
    name: '企业文化',
    config: {
      expectJobNameRegExpStr: '企业文化|组织文化|组织|OC|廉洁|反腐',
      expectJobTypeRegExpStr: '企业文化',
      expectJobDescRegExpStr: '',
      jobDetailRegExpMatchLogic: JobDetailRegExpMatchLogic.SOME
    }
  },
]

export default expectJobFilterTemplateList
