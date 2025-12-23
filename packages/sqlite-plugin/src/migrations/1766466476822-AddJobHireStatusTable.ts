import { MigrationInterface, QueryRunner } from "typeorm"
export class AddJobHireStatusTable1766466476822 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "job_hire_status_record" ("encryptJobId" varchar PRIMARY KEY NOT NULL, "hireStatus" integer NOT NULL, "lastSeenDate" datetime NOT NULL);`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }

}
