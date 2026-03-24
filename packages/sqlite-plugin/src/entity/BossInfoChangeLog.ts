import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

@Entity()
export class BossInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  encryptBossId: string;

  @Column({ type: "datetime" })
  updateTime: Date;

  @Column({ type: "varchar" })
  dataAsJson: string;
}
