import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class ChatStartupLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptPositionId: string;

  @Column()
  encryptCurrentUserId: string;

  @Column()
  date: Date;
}
