import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

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
