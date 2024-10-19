import { requireTypeorm } from "../utils/module-loader";
import { ChatStartupFrom } from "./ChatStartupLog";
const { Entity, Column, PrimaryGeneratedColumn } = requireTypeorm()

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
  autoStartupChatRecordId?: number;
}
