import { requireTypeorm } from "../utils/module-loader";
const { Entity, PrimaryGeneratedColumn, Column, Index } = requireTypeorm()

@Entity()
@Index(["providerCompleteApiUrl", "model", "providerApiSecretMd5"])
export class LlmModelUsageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  providerCompleteApiUrl: string

  @Column()
  model: string

  @Column()
  providerApiSecretMd5: string

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
