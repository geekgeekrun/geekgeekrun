import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm;

@Entity()
export class BossActiveStatusRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptBossId: string;

  @Column({
    nullable: true
  })
  lastActiveStatus?: string;
  
  @Column()
  updateTime: Date;
}