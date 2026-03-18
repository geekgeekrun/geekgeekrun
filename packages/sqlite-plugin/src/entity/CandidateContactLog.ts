import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm;

@Entity()
export class CandidateContactLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  encryptGeekId: string;

  @Column()
  contactType: string;

  @Column({
    nullable: true
  })
  message: string | null;

  @Column({
    nullable: true
  })
  result: string | null;

  @Column()
  contactTime: Date;

  @Column()
  createdAt: Date;
}
