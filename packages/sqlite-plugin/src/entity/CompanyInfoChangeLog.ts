import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column } = typeorm

@Entity()
export class CompanyInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  encryptCompanyId: string;

  @Column({ type: "datetime" })
  updateTime: Date;

  @Column({ type: "varchar" })
  dataAsJson: string;
}
