import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryGeneratedColumn } = requireTypeorm()

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
