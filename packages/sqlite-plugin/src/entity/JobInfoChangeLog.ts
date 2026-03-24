import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column } = typeorm

@Entity()
export class JobInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  encryptJobId: string;

  @Column({ type: "datetime" })
  updateTime: Date;

  @Column({ type: "varchar" })
  dataAsJson: string;
}
