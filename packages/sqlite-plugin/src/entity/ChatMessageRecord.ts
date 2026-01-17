import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

@Entity()
export class ChatMessageRecord {
  @PrimaryGeneratedColumn()
  mid: number;

  @Column()
  encryptFromUserId: string;
  
  @Column()
  encryptToUserId: string;

  @Column({
    nullable: true
  })
  time: Date | null;
  
  @Column({
    nullable: true
  })
  type?: 'text' | 'image' | 'resume';

  @Column({
    nullable: true
  })
  style?: 'sent' | 'received';

  @Column({
    nullable: true
  })
  text: string;

  @Column({
    nullable: true
  })
  imageUrl?: string;

  @Column({
    nullable: true
  })
  imageWidth?: number;

  @Column({
    nullable: true
  })
  imageHeight?: number;
}
