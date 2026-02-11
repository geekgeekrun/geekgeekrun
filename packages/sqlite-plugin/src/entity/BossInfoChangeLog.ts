import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm

@Entity()
export class BossInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptBossId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
