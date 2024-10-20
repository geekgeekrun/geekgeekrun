import { requireTypeorm } from "../utils/module-loader";
const { ViewEntity, ViewColumn } = requireTypeorm();
@ViewEntity({
  expression: `SELECT
    job_info.*,
    user_info.name as userName,
    chat_startup_log.date,
    boss_info.name AS bossName,
    boss_info.title AS bossTitle,
    company_info.name AS companyName
  FROM
    chat_startup_log
    LEFT JOIN job_info ON chat_startup_log.encryptJobId = job_info.encryptJobId
    LEFT JOIN user_info ON chat_startup_log.encryptCurrentUserId = user_info.encryptUserId
    LEFT JOIN boss_info ON boss_info.encryptBossId = job_info.encryptBossId
    LEFT JOIN company_info ON company_info.encryptCompanyId = job_info.encryptCompanyId
    `,
})
export class VChatStartupLog {
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
  address?: string;

  @ViewColumn()
  description: string;

  @ViewColumn()
  userName: string;

  @ViewColumn()
  date: string;

  @ViewColumn()
  bossName: string;

  @ViewColumn()
  bossTitle: string;

  @ViewColumn()
  companyName: string;
}
