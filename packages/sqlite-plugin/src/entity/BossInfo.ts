import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm;

@Entity()
export class BossInfo {
  @PrimaryColumn({ type: "varchar" })
  encryptBossId: string;

  @Column({
    type: "varchar",
    nullable: true
  })
  encryptCompanyId: string;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "datetime" })
  date: Date;

  @Column({ type: "varchar" })
  title: string;
}
