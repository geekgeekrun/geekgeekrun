import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const viewNames = [
  "v_boss_library",
  "v_chat_startup_log",
  "v_company_library",
  "v_job_library",
  "v_mark_as_not_suit_log"
];

export class UpdateChatStartupLogTable1729182577167
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const viewName of viewNames) {
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewName}"`);
    }
    if (await queryRunner.hasTable("boss_active_status_record")) {
      if (await queryRunner.hasColumn("boss_active_status_record", "updateDate")) {
        await queryRunner.query(
          `ALTER TABLE boss_active_status_record RENAME COLUMN updateDate TO updateTime`
        );
      }
      await queryRunner.changeColumn(
        'boss_active_status_record',
        'lastActiveStatus',
        new TableColumn({
          name: 'lastActiveStatus',
          type: 'varchar',
          isNullable: true
        })
      )
      await queryRunner.changeColumn(
        'job_info',
        'address',
        new TableColumn({
          name: 'address',
          type: 'varchar',
          isNullable: true
        })
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const viewName of viewNames) {
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewName}"`);
    }
    await queryRunner.query(
      `ALTER TABLE boss_active_status_record RENAME COLUMN updateTime TO updateDate`
    );
  }
}
