import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity()
export class BossInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index("e-boss-id-idx", { unique: true })
  @Column()
  encryptedBossId: string;

  @Column()
  encryptedCompanyId: string;

  @Column()
  name: string;

  @Column()
  date: Date;

  @Column()
  title: Date;
}
