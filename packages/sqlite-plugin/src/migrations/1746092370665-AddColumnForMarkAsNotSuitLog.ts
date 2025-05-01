import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const viewNames = [
  "v_boss_library",
  "v_chat_startup_log",
  "v_company_library",
  "v_job_library",
  "v_mark_as_not_suit_log",
];

export class AddColumnForMarkAsNotSuitLog1746092370665 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const viewName of viewNames) {
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewName}"`);
    }
    if (await queryRunner.hasTable("mark_as_not_suit_log")) {
      if (!await queryRunner.hasColumn("mark_as_not_suit_log", "markOp")) {
        await queryRunner.addColumn(
          "mark_as_not_suit_log",
          new TableColumn({
            name: "markOp",
            type: "number",
            isNullable: true,
          })
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
