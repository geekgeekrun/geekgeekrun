import { MigrationInterface, QueryRunner } from "typeorm"

const dropViewSql = `
DROP VIEW IF EXISTS "v_boss_library";
DROP VIEW IF EXISTS "v_chat_startup_log";
DROP VIEW IF EXISTS "v_company_library";
DROP VIEW IF EXISTS "v_job_library";
`;

export class UpdateChatStartupLogTable1729182577167 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(dropViewSql);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(dropViewSql);
    }
}
