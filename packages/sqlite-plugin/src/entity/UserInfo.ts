import { Entity, PrimaryGeneratedColumn, Column, Index, PrimaryColumn } from "typeorm";

@Entity()
export class UserInfo {
  @PrimaryColumn()
  encryptUserId: string;

  @Column()
  name: string;
}
