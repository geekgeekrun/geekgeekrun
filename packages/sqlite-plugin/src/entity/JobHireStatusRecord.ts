import { JobHireStatus } from "../enums";
import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryColumn } = requireTypeorm();

@Entity()
export class JobHireStatusRecord {
  @PrimaryColumn()
  encryptJobId: string;

  @Column()
  hireStatus: JobHireStatus;

  @Column()
  lastSeenDate: Date;
}