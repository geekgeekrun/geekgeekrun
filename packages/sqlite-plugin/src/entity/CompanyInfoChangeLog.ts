import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class CompanyInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedCompanyId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
