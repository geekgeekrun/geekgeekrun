/**
 * 招聘端自动浏览运行状态枚举
 */
export const BossAutoProcessStatus = (() => {
  const enums = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    STOPPED: 'stopped',
    ERROR: 'error',
    LOGIN_REQUIRED: 'login_required'
  }
  const kvList = Object.entries(enums)
  kvList.forEach(([k, v]) => {
    enums[v] = k
  })
  return enums
})()

/**
 * 候选人筛选结果枚举（用于说明匹配/排除原因）
 */
export const CandidateFilterResult = (() => {
  const enums = {
    MATCHED: 'matched',
    SKIPPED_CITY: 'skipped_city',
    SKIPPED_EDUCATION: 'skipped_education',
    SKIPPED_WORK_EXP: 'skipped_work_exp',
    SKIPPED_SALARY: 'skipped_salary',
    SKIPPED_SKILLS: 'skipped_skills',
    SKIPPED_BLOCKLIST: 'skipped_blocklist'
  }
  const kvList = Object.entries(enums)
  kvList.forEach(([k, v]) => {
    enums[v] = k
  })
  return enums
})()

/**
 * 招聘端运行错误退出码（供 daemon 识别后不再重启）
 */
export const BOSS_AUTO_ERROR_EXIT_CODE = (() => {
  const enums = {
    NORMAL: 0,
    COOKIE_INVALID: 81,
    LOGIN_STATUS_INVALID: 82,
    ERR_INTERNET_DISCONNECTED: 83,
    ACCESS_IS_DENIED: 84,
    PUPPETEER_IS_NOT_EXECUTABLE: 85
  }
  const kvList = Object.entries(enums)
  kvList.forEach(([k, v]) => {
    enums[v] = k
  })
  return enums
})()
