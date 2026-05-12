import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCandidateTables1766466476823 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "candidate_info" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptGeekId" varchar UNIQUE NOT NULL, "geekName" varchar NOT NULL, "educationLevel" varchar, "workExpYears" varchar, "city" varchar, "jobTitle" varchar, "salaryExpect" varchar, "skills" varchar, "firstContactTime" datetime, "lastContactTime" datetime, "status" varchar NOT NULL DEFAULT 'new', "rawData" text, "createdAt" datetime NOT NULL, "updatedAt" datetime NOT NULL);`
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "candidate_contact_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptGeekId" varchar NOT NULL, "contactType" varchar NOT NULL, "message" varchar, "result" varchar, "contactTime" datetime NOT NULL, "createdAt" datetime NOT NULL);`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }
}
