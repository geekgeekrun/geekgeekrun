import { Entity, PrimaryGeneratedColumn, Column, Index, PrimaryColumn } from "typeorm";

@Entity()
export class UserInfo {
  @PrimaryColumn()
  encryptedUserId: string;

  @Column()
  name: string;
}
