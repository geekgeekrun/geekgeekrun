import { JobSource, MarkAsNotSuitOp, MarkAsNotSuitReason } from "../enums";
import * as typeorm from 'typeorm';
import { ChatStartupFrom } from "./ChatStartupLog";
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

@Entity()
export class MarkAsNotSuitLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  encryptJobId: string;

  @Column({ type: "varchar" })
  encryptCurrentUserId: string;

  @Column({ type: "datetime" })
  date: Date;

  @Column({
    type: "integer",
    nullable: true
  })
  markFrom?: ChatStartupFrom;

  @Column({
    type: "integer",
    nullable: true
  })
  markReason?: MarkAsNotSuitReason

  @Column({
    type: "integer",
    nullable: true
  })
  markOp?: MarkAsNotSuitOp

  @Column({
    type: "varchar",
    nullable: true
  })
  extInfo?: string

  @Column({
    type: "integer",
    nullable: true
  })
  autoStartupChatRecordId?: number;

  @Column({
    type: "integer",
    nullable: true
  })
  jobSource?: JobSource;
}
