import * as typeorm from 'typeorm';
const { Entity, Column, PrimaryGeneratedColumn } = typeorm;

@Entity()
export class CandidateInfo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true
  })
  encryptGeekId: string;

  @Column()
  geekName: string;

  @Column({
    nullable: true
  })
  educationLevel: string | null;

  @Column({
    nullable: true
  })
  workExpYears: string | null;

  @Column({
    nullable: true
  })
  city: string | null;

  @Column({
    nullable: true
  })
  jobTitle: string | null;

  @Column({
    nullable: true
  })
  salaryExpect: string | null;

  @Column({
    nullable: true
  })
  skills: string | null;

  @Column({
    nullable: true
  })
  firstContactTime: Date | null;

  @Column({
    nullable: true
  })
  lastContactTime: Date | null;

  @Column({
    default: 'new'
  })
  status: string;

  @Column({
    type: 'text',
    nullable: true
  })
  rawData: string | null;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;
}
