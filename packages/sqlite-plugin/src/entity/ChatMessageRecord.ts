import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

@Entity()
export class ChatMessageRecord {
  @PrimaryGeneratedColumn()
  mid: number;

  @Column({ type: "varchar" })
  encryptFromUserId: string;
  
  @Column({ type: "varchar" })
  encryptToUserId: string;

  @Column({
    type: "datetime",
    nullable: true
  })
  time: Date | null;
  
  @Column({
    type: "varchar",
    nullable: true
  })
  type?: 'text' | 'image' | 'resume';

  @Column({
    type: "varchar",
    nullable: true
  })
  style?: 'sent' | 'received';

  @Column({
    type: "varchar",
    nullable: true
  })
  text: string;

  @Column({
    type: "varchar",
    nullable: true
  })
  imageUrl?: string;

  @Column({
    type: "integer",
    nullable: true
  })
  imageWidth?: number;

  @Column({
    type: "integer",
    nullable: true
  })
  imageHeight?: number;
}
