import { DataSource, MigrationInterface, QueryRunner, TableColumn } from "typeorm"
import { VBossLibrary } from "../entity/VBossLibrary";
import { VChatStartupLog } from "../entity/VChatStartupLog";
import { VCompanyLibrary } from "../entity/VCompanyLibrary";
import { VJobLibrary } from "../entity/VJobLibrary";
import { VMarkAsNotSuitLog } from "../entity/VMarkAsNotSuitLog";
import { JobSource } from "../enums";

const ViewEntities = [
  VBossLibrary,
  VChatStartupLog,
  VCompanyLibrary,
  VJobLibrary,
  VMarkAsNotSuitLog,
]
export class AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const EntityDefinition of ViewEntities) {
      const dataSource = queryRunner.connection as DataSource;
      const viewMetadata = dataSource.getMetadata(EntityDefinition);
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewMetadata.tableName}"`);
    }
    if (await queryRunner.hasTable("mark_as_not_suit_log")) {
      if (!await queryRunner.hasColumn("mark_as_not_suit_log", "jobSource")) {
        await queryRunner.addColumn(
          "mark_as_not_suit_log",
          new TableColumn({
            name: "jobSource",
            type: "number",
            isNullable: true,
          })
        );
        await queryRunner.query(`UPDATE mark_as_not_suit_log SET jobSource=?`, [JobSource.expect]);
      }
    }
    if (await queryRunner.hasTable("chat_startup_log")) {
      if (!await queryRunner.hasColumn("chat_startup_log", "jobSource")) {
        await queryRunner.addColumn(
          "chat_startup_log",
          new TableColumn({
            name: "jobSource",
            type: "number",
            isNullable: true,
          })
        );
        await queryRunner.query(`UPDATE chat_startup_log SET jobSource=?`, [JobSource.expect]);
      }
    }
    for (const EntityDefinition of ViewEntities) {
      const dataSource = queryRunner.connection as DataSource;
      const viewMetadata = dataSource.getMetadata(EntityDefinition);
      let expression = viewMetadata.expression;
      if (typeof expression === 'function') {
        expression = expression(dataSource).getQuery();
      }
      await queryRunner.query(`CREATE VIEW "${viewMetadata.tableName}" AS ${expression}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }

}
