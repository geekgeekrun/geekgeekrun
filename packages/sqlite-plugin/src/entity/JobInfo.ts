import { Entity, PrimaryGeneratedColumn, Column, Unique } from "typeorm";

@Entity()
export class JobInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedJobId: string;

  @Column()
  jobName: string;

  @Column()
  positionName: string;

  @Column()
  salaryLow?: number;

  @Column()
  salaryHeight?: number;

  @Column()
  salaryMonth?: number;

  @Column()
  experienceYearLow?: number;

  @Column()
  experienceYearHigh?: number;

  @Column()
  publishDate: Date;

  @Column()
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
