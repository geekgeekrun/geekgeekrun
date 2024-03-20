import { requireTypeorm } from "../utils/module-loader";
const { Entity, PrimaryGeneratedColumn, Column } = requireTypeorm()

@Entity()
export class JobInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptJobId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
