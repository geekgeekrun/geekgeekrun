import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm

@Entity()
export class JobInfo {
  @PrimaryColumn({ type: "varchar" })
  encryptJobId: string;

  @Column({ type: "varchar" })
  jobName: string;

  @Column({ type: "varchar" })
  positionName: string;

  @Column({
    type: "integer",
    nullable: true
  })
  salaryLow?: number;

  @Column({
    type: "integer",
    nullable: true
  })
  salaryHigh?: number;

  @Column({
    type: "integer",
    nullable: true
  })
  salaryMonth?: number;

  @Column({ type: "varchar" })
  experienceName: string;

  @Column({
    type: "datetime",
    nullable: true
  })
  publishDate?: Date;

  @Column({
    type: "varchar",
    nullable: true
  })
  degreeName?: string;

  @Column({
    type: "varchar",
    nullable: true
  })
  address?: string;

  @Column({ type: "varchar" })
  description: string;

  @Column({ type: "varchar" })
  encryptBossId: string;

  @Column({ type: "varchar" })
  encryptCompanyId: string;
}
