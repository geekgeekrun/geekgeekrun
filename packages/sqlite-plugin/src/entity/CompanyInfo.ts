import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class CompanyInfo {
  @PrimaryGeneratedColumn()
  id: number;

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
