import { Entity, PrimaryGeneratedColumn, Column, Index, PrimaryColumn } from "typeorm";

@Entity()
export class CompanyInfo {
  @PrimaryColumn()
  encryptedCompanyId: string;
  
  @Column()
  name: string;
  
  @Column()
  brandName: string;

  @Column({
    nullable: true
  })
  scaleLow?: string;
  
  @Column({
    nullable: true
  })
  scaleHeight?: string;

  @Column({
    nullable: true
  })
  stageName?: string;
  
  @Column({
    nullable: true
  })
  industryName?: string;
}
