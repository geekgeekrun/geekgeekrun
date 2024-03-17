import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class BossActiveStatusRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedBossId: string;

  @Column()
  lastActiveStatus: string;
  
  @Column()
  updateDate: Date;
}