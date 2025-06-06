export enum MarkAsNotSuitReason {
  UNKNOWN = 0,
  BOSS_INACTIVE = 1,
  USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON = 2,
  JOB_NOT_SUIT = 3,
  JOB_CITY_NOT_SUIT = 4,
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
