import { MigrationInterface, QueryRunner } from "typeorm";
const viewNames = [
  "v_boss_library",
  "v_chat_startup_log",
  "v_company_library",
  "v_job_library",
  "v_mark_as_not_suit_log",
];
export class ChangeJobLibraryView1744467048874 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const viewName of viewNames) {
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewName}"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
