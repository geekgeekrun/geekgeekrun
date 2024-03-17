import { Entity, PrimaryGeneratedColumn, Column, Unique, Index } from "typeorm";

@Entity()
export class JobInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index("e-job-id-idx", { unique: true })
  @Column()
  encryptedJobId: string;

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
  encryptedBossId: string;

  @Column()
  encryptedCompanyId: string;
}
