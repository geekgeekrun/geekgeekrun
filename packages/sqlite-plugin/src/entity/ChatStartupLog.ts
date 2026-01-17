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

  @Column()
  encryptJobId: string;

  @Column()
  encryptCurrentUserId: string;

  @Column()
  date: Date;

  @Column({
    nullable: true
  })
  chatStartupFrom?: ChatStartupFrom;

  @Column({
    nullable: true
  })
  autoStartupChatRecordId?: number;

  @Column({
    nullable: true
  })
  jobSource?: JobSource;
}
