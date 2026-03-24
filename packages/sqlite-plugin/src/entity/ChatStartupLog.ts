import { JobSource } from "../enums";
import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

export enum ChatStartupFrom {
  AutoFromRecommendList = null,
  ManuallyFromRecommendList = 1
}

@Entity()
export class ChatStartupLog {
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
  chatStartupFrom?: ChatStartupFrom;

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
