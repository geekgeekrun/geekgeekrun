import * as typeorm from 'typeorm';
const { Entity, PrimaryGeneratedColumn, Column, Index } = typeorm

@Entity()
@Index(["providerCompleteApiUrl", "model", "providerApiSecret"])
export class LlmModelUsageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  providerCompleteApiUrl: string

  @Column({ type: "varchar" })
  model: string

  @Column({
    type: "varchar",
    nullable: true
  })
  providerApiSecret: string

  @Column({
    type: "integer",
    nullable: true
  })
  completionTokens?: number;

  @Column({
    type: "integer",
    nullable: true
  })
  promptTokens?: number;

  @Column({
    type: "integer",
    nullable: true
  })
  promptCacheHitTokens?: number

  @Column({
    type: "integer",
    nullable: true
  })
  promptCacheMissTokens?: number

  @Column({
    type: "integer",
    nullable: true
  })
  totalTokens?: number;

  @Column({ type: "datetime" })
  requestStartTime: Date

  @Column({
    type: "datetime",
    nullable: true
  })
  requestEndTime?: Date

  @Column({ type: "boolean" })
  hasError: boolean

  @Column({ type: "varchar" })
  errorMessage: string

  @Column({
    type: "integer",
    nullable: true
  })
  requestScene?: number
}
