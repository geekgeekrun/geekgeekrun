import * as typeorm from 'typeorm';
const { ViewEntity, ViewColumn } = typeorm;
@ViewEntity({
  expression: `SELECT
    boss_info.encryptBossId,
    boss_info.name,
    boss_info.title,
    company_info.name as companyName,
    company_info.encryptCompanyId as encryptCompanyId
  FROM
    boss_info
    LEFT JOIN company_info ON company_info.encryptCompanyId = boss_info.encryptCompanyId
    `,
})
export class VBossLibrary {
  @ViewColumn()
  encryptBossId: number;

  @ViewColumn()
  name: string;

  @ViewColumn()
  title: string;

  @ViewColumn()
  companyName: number | null;

  @ViewColumn()
  encryptCompanyId: number | null;
}
