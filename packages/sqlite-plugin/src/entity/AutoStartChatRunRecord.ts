import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm;

@Entity()
export class AutoStartChatRunRecord {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  date: Date;
}