import { DataSource, MigrationInterface, QueryRunner, TableColumn } from "typeorm";
import { VBossLibrary } from "../entity/VBossLibrary";
import { VChatStartupLog } from "../entity/VChatStartupLog";
import { VCompanyLibrary } from "../entity/VCompanyLibrary";
import { VJobLibrary } from "../entity/VJobLibrary";
import { VMarkAsNotSuitLog } from "../entity/VMarkAsNotSuitLog";

const ViewEntities = [
  VBossLibrary,
  VChatStartupLog,
  VCompanyLibrary,
  VJobLibrary,
  VMarkAsNotSuitLog,
]

export class UpdateBossInfoTable1732032381304 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const EntityDefinition of ViewEntities) {
      const dataSource = queryRunner.connection as DataSource;
      const viewMetadata = dataSource.getMetadata(EntityDefinition);
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewMetadata.tableName}"`);
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

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
