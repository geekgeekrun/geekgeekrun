import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column } = typeorm

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
