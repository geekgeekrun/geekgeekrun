import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryGeneratedColumn } = requireTypeorm()

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
  style?: 'sent' | 'receive';

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
