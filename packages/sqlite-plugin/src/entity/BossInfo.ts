import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class BossInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedBossId: string;

  @Column()
  encryptedCompanyId: string;

  @Column()
  date: Date;

  @Column()
  title: Date;
}
