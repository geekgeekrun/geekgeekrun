import { JobSource, MarkAsNotSuitOp, MarkAsNotSuitReason } from "../enums";
import * as typeorm from 'typeorm';
import { ChatStartupFrom } from "./ChatStartupLog";
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

@Entity()
export class MarkAsNotSuitLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptJobId: string;

  @Column()
  encryptCurrentUserId: string;

  @Column()
  date: Date;

  @Column({
    nullable: true
  })
  markFrom?: ChatStartupFrom;

  @Column({
    nullable: true
  })
  markReason?: MarkAsNotSuitReason

  @Column({
    nullable: true
  })
  markOp?: MarkAsNotSuitOp

  @Column({
    nullable: true
  })
  extInfo?: string

  @Column({
    nullable: true
  })
  autoStartupChatRecordId?: number;

  @Column({
    nullable: true
  })
  jobSource?: JobSource;
}
