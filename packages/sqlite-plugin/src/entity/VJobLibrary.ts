import { requireTypeorm } from "../utils/module-loader";
const { ViewEntity, ViewColumn } = requireTypeorm();
@ViewEntity({
  expression: `SELECT
    job_info.*,
    boss_info.name AS bossName,
    boss_info.title AS bossTitle,
    company_info.name AS companyName
  FROM
    job_info
    LEFT JOIN boss_info ON boss_info.encryptBossId = job_info.encryptBossId
    LEFT JOIN company_info ON company_info.encryptCompanyId = job_info.encryptCompanyId
    `,
})
export class VJobLibrary {
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
  bossName: string;

  @ViewColumn()
  bossTitle: string;

  @ViewColumn()
  companyName: string;
}
