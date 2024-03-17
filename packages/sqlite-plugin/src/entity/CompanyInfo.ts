import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity()
export class CompanyInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index("e-company-id-idx", { unique: true })
  @Column()
  encryptCompanyId: string;
  
  @Column()
  name: string;
  
  @Column()
  brandName: string;

  @Column()
  scaleLow?: string;
  
  @Column()
  scaleHeight?: string;

  @Column()
  stageName?: string;
  
  @Column()
  industryName?: string;
}
