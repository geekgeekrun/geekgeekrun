import { Entity, PrimaryGeneratedColumn, Column, Index, PrimaryColumn } from "typeorm";

@Entity()
export class BossInfo {
  @PrimaryColumn()
  encryptBossId: string;

  @Column()
  encryptCompanyId: string;

  @Column()
  name: string;

  @Column()
  date: Date;

  @Column()
  title: Date;
}
