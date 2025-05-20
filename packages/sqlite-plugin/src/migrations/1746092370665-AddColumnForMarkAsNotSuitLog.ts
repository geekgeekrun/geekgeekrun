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

export class AddColumnForMarkAsNotSuitLog1746092370665 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const EntityDefinition of ViewEntities) {
      const dataSource = queryRunner.connection as DataSource;
      const viewMetadata = dataSource.getMetadata(EntityDefinition);
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewMetadata.tableName}"`);
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
