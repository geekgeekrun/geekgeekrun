import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm

@Entity()
export class UserInfo {
  @PrimaryColumn()
  encryptUserId: string;

  @Column()
  name: string;
}
