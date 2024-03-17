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
