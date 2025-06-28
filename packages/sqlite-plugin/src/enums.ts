export enum MarkAsNotSuitReason {
  UNKNOWN = 0,
  BOSS_INACTIVE = 1,
  USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON = 2,
  JOB_NOT_SUIT = 3,
  JOB_CITY_NOT_SUIT = 4,
  JOB_WORK_EXP_NOT_SUIT = 5,
  JOB_SALARY_NOT_SUIT = 6,
}

export enum MarkAsNotSuitOp {
  MARK_AS_NOT_SUIT_ON_BOSS = 1,
  MARK_AS_NOT_SUIT_ON_LOCAL = 2,
  NO_OP = 3
}

export enum StrategyScopeOptionWhenMarkJobNotMatch {
  ALL_JOB = 1,
  ONLY_COMPANY_MATCHED_JOB = 2
}

export enum SalaryCalculateWay {
  MONTH_SALARY = 1,
  ANNUAL_PACKAGE = 2,
}

export enum JobDetailRegExpMatchLogic {
  EVERY = 1,
  SOME = 2,
}
