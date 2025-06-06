import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryColumn } = requireTypeorm();

@Entity()
export class BossInfo {
  @PrimaryColumn()
  encryptBossId: string;

  @Column({
    nullable: true
  })
  encryptCompanyId: string;

  @Column()
  name: string;

  @Column()
  date: Date;

  @Column()
  title: string;
}
