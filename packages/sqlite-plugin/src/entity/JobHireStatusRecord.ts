import { JobHireStatus } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm;

@Entity()
export class JobHireStatusRecord {
  @PrimaryColumn()
  encryptJobId: string;

  @Column()
  hireStatus: JobHireStatus;

  @Column()
  lastSeenDate: Date;
}