import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

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
