import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm

@Entity()
export class UserInfo {
  @PrimaryColumn({ type: "varchar" })
  encryptUserId: string;

  @Column({ type: "varchar" })
  name: string;
}
