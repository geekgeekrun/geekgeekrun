import { JobHireStatus } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm;

@Entity()
export class JobHireStatusRecord {
  @PrimaryColumn({ type: "varchar" })
  encryptJobId: string;

  @Column({ type: "integer" })
  hireStatus: JobHireStatus;

  @Column({ type: "datetime" })
  lastSeenDate: Date;
}
