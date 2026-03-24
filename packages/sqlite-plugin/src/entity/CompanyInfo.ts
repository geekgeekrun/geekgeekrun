import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm

@Entity()
export class CompanyInfo {
  @PrimaryColumn({ type: "varchar" })
  encryptCompanyId: string;
  
  @Column({ type: "varchar" })
  name: string;
  
  @Column({ type: "varchar" })
  brandName: string;

  @Column({
    type: "integer",
    nullable: true
  })
  scaleLow?: number;
  
  @Column({
    type: "integer",
    nullable: true
  })
  scaleHigh?: number;

  @Column({
    type: "varchar",
    nullable: true
  })
  stageName?: string;
  
  @Column({
    type: "varchar",
    nullable: true
  })
  industryName?: string;
}
