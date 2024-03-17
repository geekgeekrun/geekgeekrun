import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class BossInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptBossId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
