import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryGeneratedColumn } = requireTypeorm();

@Entity()
export class AutoStartChatRunRecord {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  date: Date;
}