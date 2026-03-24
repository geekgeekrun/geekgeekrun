import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm;

@Entity()
export class BossActiveStatusRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  encryptBossId: string;

  @Column({
    type: "varchar",
    nullable: true
  })
  lastActiveStatus?: string;
  
  @Column({ type: "datetime" })
  updateTime: Date;
}
