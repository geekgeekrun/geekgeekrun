import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity()
export class UserInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index("e-user-id-idx", { unique: true })
  @Column()
  encryptedUserId: string;

  @Column()
  name: string;
}
