import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column } = typeorm

@Entity()
export class JobInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptJobId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
