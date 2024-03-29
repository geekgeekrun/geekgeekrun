import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryColumn } = requireTypeorm()

@Entity()
export class UserInfo {
  @PrimaryColumn()
  encryptUserId: string;

  @Column()
  name: string;
}
