import { requireTypeorm } from "../utils/module-loader";
import { ChatStartupFrom } from "./ChatStartupLog";
import { MarkAsNotSuitReason } from "../enums";
const { ViewEntity, ViewColumn } = requireTypeorm();
@ViewEntity({
  expression: `SELECT
    job_info.*,
    user_info.name as userName,
    mark_as_not_suit_log.date,
    mark_as_not_suit_log.markFrom,
    mark_as_not_suit_log.markReason,
    mark_as_not_suit_log.extInfo,
    boss_info.name AS bossName,
    company_info.name AS companyName
  FROM
    mark_as_not_suit_log
    LEFT JOIN job_info ON mark_as_not_suit_log.encryptJobId = job_info.encryptJobId
    LEFT JOIN user_info ON mark_as_not_suit_log.encryptCurrentUserId = user_info.encryptUserId
    LEFT JOIN boss_info ON boss_info.encryptBossId = job_info.encryptBossId
    LEFT JOIN company_info ON company_info.encryptCompanyId = job_info.encryptCompanyId
    `,
})
export class VMarkAsNotSuitLog {
  @ViewColumn()
  encryptJobId: number;

  @ViewColumn()
  jobName: string;

  @ViewColumn()
  positionName: string;

  @ViewColumn()
  salaryLow: number | null;

  @ViewColumn()
  salaryHigh: number | null;

  @ViewColumn()
  salaryMonth: number | null;

  @ViewColumn()
  experienceName: number | null;

  @ViewColumn()
  publishDate: Date | null;

  @ViewColumn()
  degreeName: string;

  @ViewColumn()
  address: string;

  @ViewColumn()
  description: string;

  @ViewColumn()
  userName: string;

  @ViewColumn()
  date: string;

  @ViewColumn()
  bossName: string;

  @ViewColumn()
  markFrom: ChatStartupFrom;

  @ViewColumn()
  markReason: MarkAsNotSuitReason;

  @ViewColumn()
  extInfo: string;

  @ViewColumn()
  companyName: string;
}
