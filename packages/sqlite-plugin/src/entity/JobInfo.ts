import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryColumn } = requireTypeorm()

@Entity()
export class JobInfo {
  @PrimaryColumn()
  encryptJobId: string;

  @Column()
  jobName: string;

  @Column()
  positionName: string;

  @Column({
    nullable: true
  })
  salaryLow?: number;

  @Column({
    nullable: true
  })
  salaryHigh?: number;

  @Column({
    nullable: true
  })
  salaryMonth?: number;

  @Column()
  experienceName: string;

  @Column({
    nullable: true
  })
  publishDate?: Date;

  @Column({
    nullable: true
  })
  degreeName?: string;

  @Column()
  address: string;

  @Column()
  description: string;

  @Column()
  encryptBossId: string;

  @Column()
  encryptCompanyId: string;
}
