import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryGeneratedColumn } = requireTypeorm();

@Entity()
export class BossActiveStatusRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptBossId: string;

  @Column()
  lastActiveStatus: string;
  
  @Column()
  updateDate: Date;
}