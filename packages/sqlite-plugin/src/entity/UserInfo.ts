import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class UserInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedUserId: string;

  @Column()
  name: string;
}
