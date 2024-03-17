import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class JobInfoChangeLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptedJobId: string;

  @Column()
  updateTime: Date;

  @Column()
  dataAsJson: string;
}
