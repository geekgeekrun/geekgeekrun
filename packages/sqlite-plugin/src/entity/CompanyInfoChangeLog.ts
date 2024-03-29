import { requireTypeorm } from "../utils/module-loader";
const { Entity, PrimaryGeneratedColumn, Column } = requireTypeorm()

@Entity()
export class CompanyInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptCompanyId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
