import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryGeneratedColumn } = requireTypeorm()

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
}
