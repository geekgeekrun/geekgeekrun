import { requireTypeorm } from "../utils/module-loader";
const { ViewEntity, ViewColumn } = requireTypeorm();
@ViewEntity({
  expression: `SELECT
    company_info.*
  FROM
    company_info
    `,
})
export class VCompanyLibrary {
  @ViewColumn()
  encryptCompanyId: string;

  @ViewColumn()
  name: string;

  @ViewColumn()
  brandName: string;

  @ViewColumn()
  scaleLow?: number;

  @ViewColumn()
  scaleHigh?: number;

  @ViewColumn()
  stageName?: string;

  @ViewColumn()
  industryName?: string;
}
