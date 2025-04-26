import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const viewNames = [
  "v_boss_library",
  "v_chat_startup_log",
  "v_company_library",
  "v_job_library",
  "v_mark_as_not_suit_log",
];

export class UpdateBossInfoTable1732032381304 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const viewName of viewNames) {
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewName}"`);
    }
    if (await queryRunner.hasTable("boss_info")) {
      if (await queryRunner.hasColumn("boss_info", "encryptCompanyId")) {
        await queryRunner.changeColumn(
          "boss_info",
          "encryptCompanyId",
          new TableColumn({
            name: "encryptCompanyId",
            type: "varchar",
            isNullable: true,
          })
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
