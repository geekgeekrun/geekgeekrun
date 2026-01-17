import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column, Index } = typeorm

@Entity()
@Index(["providerCompleteApiUrl", "model", "providerApiSecret"])
export class LlmModelUsageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  providerCompleteApiUrl: string

  @Column()
  model: string

  @Column({
    nullable: true
  })
  providerApiSecret: string

  @Column({
    nullable: true
  })
  completionTokens?: number;

  @Column({
    nullable: true
  })
  promptTokens?: number;

  @Column({
    nullable: true
  })
  promptCacheHitTokens?: number

  @Column({
    nullable: true
  })
  promptCacheMissTokens?: number

  @Column({
    nullable: true
  })
  totalTokens?: number;

  @Column()
  requestStartTime: Date

  @Column({
    nullable: true
  })
  requestEndTime?: Date

  @Column()
  hasError: boolean

  @Column()
  errorMessage: string

  @Column({
    nullable: true
  })
  requestScene?: number
}
