import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryColumn } = typeorm;

@Entity()
export class BossInfo {
  @PrimaryColumn()
  encryptBossId: string;

  @Column({
    nullable: true
  })
  encryptCompanyId: string;

  @Column()
  name: string;

  @Column()
  date: Date;

  @Column()
  title: string;
}
