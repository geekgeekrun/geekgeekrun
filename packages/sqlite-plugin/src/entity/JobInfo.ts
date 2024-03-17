import { Entity, PrimaryGeneratedColumn, Column, Unique, Index, PrimaryColumn } from "typeorm";

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
  salaryHeight?: number;

  @Column({
    nullable: true
  })
  salaryMonth?: number;

  @Column({
    nullable: true
  })
  experienceYearLow?: number;

  @Column({
    nullable: true
  })
  experienceYearHigh?: number;

  @Column()
  publishDate: Date;

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
