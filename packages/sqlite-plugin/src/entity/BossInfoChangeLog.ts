import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class BossInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedBossId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
