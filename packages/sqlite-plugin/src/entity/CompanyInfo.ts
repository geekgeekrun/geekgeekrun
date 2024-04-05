import { requireTypeorm } from "../utils/module-loader";
const { Entity, Column, PrimaryColumn } = requireTypeorm()

@Entity()
export class CompanyInfo {
  @PrimaryColumn()
  encryptCompanyId: string;
  
  @Column()
  name: string;
  
  @Column()
  brandName: string;

  @Column({
    nullable: true
  })
  scaleLow?: number;
  
  @Column({
    nullable: true
  })
  scaleHigh?: number;

  @Column({
    nullable: true
  })
  stageName?: string;
  
  @Column({
    nullable: true
  })
  industryName?: string;
}
