import { Entity, PrimaryGeneratedColumn, Column, Index, PrimaryColumn } from "typeorm";

@Entity()
export class BossInfo {
  @PrimaryColumn()
  encryptedBossId: string;

  @Column()
  encryptedCompanyId: string;

  @Column()
  name: string;

  @Column()
  date: Date;

  @Column()
  title: Date;
}
