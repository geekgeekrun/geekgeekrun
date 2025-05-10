import { DataSource, MigrationInterface, QueryRunner, TableColumn } from "typeorm";
export class Init1000000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableSchemaStatements = `CREATE TABLE IF NOT EXISTS "boss_info" ("encryptBossId" varchar PRIMARY KEY NOT NULL, "encryptCompanyId" varchar, "name" varchar NOT NULL, "date" datetime NOT NULL, "title" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS "boss_info_change_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptBossId" varchar NOT NULL, "updateTime" datetime NOT NULL, "dataAsJson" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS "chat_startup_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptJobId" varchar NOT NULL, "encryptCurrentUserId" varchar NOT NULL, "date" datetime NOT NULL, "chatStartupFrom" integer, "autoStartupChatRecordId" integer);
CREATE TABLE IF NOT EXISTS "company_info_change_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptCompanyId" varchar NOT NULL, "updateTime" datetime NOT NULL, "dataAsJson" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS "company_info" ("encryptCompanyId" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "brandName" varchar NOT NULL, "scaleLow" integer, "scaleHigh" integer, "stageName" varchar, "industryName" varchar);
CREATE TABLE IF NOT EXISTS "job_info" ("encryptJobId" varchar PRIMARY KEY NOT NULL, "jobName" varchar NOT NULL, "positionName" varchar NOT NULL, "salaryLow" integer, "salaryHigh" integer, "salaryMonth" integer, "experienceName" varchar NOT NULL, "publishDate" datetime, "degreeName" varchar, "address" varchar, "description" varchar NOT NULL, "encryptBossId" varchar NOT NULL, "encryptCompanyId" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS "job_info_change_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptJobId" varchar NOT NULL, "updateTime" datetime NOT NULL, "dataAsJson" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS "boss_active_status_record" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptBossId" varchar NOT NULL, "lastActiveStatus" varchar, "updateTime" datetime NOT NULL);
CREATE TABLE IF NOT EXISTS "user_info" ("encryptUserId" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS "auto_start_chat_run_record" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "date" datetime NOT NULL);
CREATE TABLE IF NOT EXISTS "mark_as_not_suit_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptJobId" varchar NOT NULL, "encryptCurrentUserId" varchar NOT NULL, "date" datetime NOT NULL, "markFrom" integer, "markReason" integer, "extInfo" varchar, "autoStartupChatRecordId" integer);
CREATE TABLE IF NOT EXISTS "chat_message_record" ("mid" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "encryptFromUserId" varchar NOT NULL, "encryptToUserId" varchar NOT NULL, "time" datetime, "type" varchar, "style" varchar, "text" varchar, "imageUrl" varchar, "imageWidth" integer, "imageHeight" integer);
CREATE TABLE IF NOT EXISTS "llm_model_usage_record" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "providerCompleteApiUrl" varchar NOT NULL, "model" varchar NOT NULL, "providerApiSecret" varchar, "completionTokens" integer, "promptTokens" integer, "promptCacheHitTokens" integer, "promptCacheMissTokens" integer, "totalTokens" integer, "requestStartTime" datetime NOT NULL, "requestEndTime" datetime, "hasError" boolean NOT NULL, "errorMessage" varchar NOT NULL, "requestScene" integer);`.split('\n')
    for(const statement of tableSchemaStatements) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }
}
