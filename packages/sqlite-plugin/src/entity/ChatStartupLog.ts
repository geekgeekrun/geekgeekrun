import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class ChatStartupLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedPositionId: string;

  @Column()
  date: Date;
}
