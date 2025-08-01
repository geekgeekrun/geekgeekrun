import "reflect-metadata";
import { type DataSource } from "typeorm";
import { requireTypeorm } from "./utils/module-loader";
import fs from 'node:fs'

import { BossInfo } from "./entity/BossInfo";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";
import { ChatStartupFrom, ChatStartupLog } from './entity/ChatStartupLog';
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { UserInfo } from "./entity/UserInfo";
import { AutoStartChatRunRecord } from './entity/AutoStartChatRunRecord';
import { MarkAsNotSuitLog } from "./entity/MarkAsNotSuitLog"
import { VChatStartupLog } from "./entity/VChatStartupLog";
import { VBossLibrary } from "./entity/VBossLibrary";
import { VJobLibrary } from "./entity/VJobLibrary";
import { VCompanyLibrary } from "./entity/VCompanyLibrary"
import { VMarkAsNotSuitLog } from "./entity/VMarkAsNotSuitLog"
import { ChatMessageRecord } from './entity/ChatMessageRecord'
import { LlmModelUsageRecord } from './entity/LlmModelUsageRecord'

import sqlite3 from 'sqlite3';
import {
  saveChatStartupRecord,
  saveJobInfoFromRecommendPage,
  saveMarkAsNotSuitRecord,
  getNotSuitMarkRecordsInLastSomeDays,
  getChatStartupRecordsInLastSomeDays,
  getBossIdsByJobIds
} from "./handlers";
import { UpdateChatStartupLogTable1729182577167 } from "./migrations/1729182577167-UpdateChatStartupLogTable";
import minimist from 'minimist'
import { UpdateBossInfoTable1732032381304 } from "./migrations/1732032381304-UpdateBossInfoTable";
import { MarkAsNotSuitOp, MarkAsNotSuitReason } from "./enums";
import { AddColumnForMarkAsNotSuitLog1746092370665 } from "./migrations/1746092370665-AddColumnForMarkAsNotSuitLog";
import { Init1000000000000 } from "./migrations/1000000000000-Init";
import { AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526 } from "./migrations/1752380078526-AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog";

export function initDb(dbFilePath) {
  const { DataSource } = requireTypeorm()
  const appDataSource = new DataSource({
    type: "sqlite",
    synchronize: false,
    logging: true,
    logger: "simple-console",
    database: dbFilePath,
    driver: sqlite3, // The important line
    entities: [
      ChatStartupLog,
      BossInfo,
      BossInfoChangeLog,
      CompanyInfo,
      CompanyInfoChangeLog,
      JobInfo,
      JobInfoChangeLog,
      BossActiveStatusRecord,
      UserInfo,
      AutoStartChatRunRecord,
      VChatStartupLog,
      VBossLibrary,
      VJobLibrary,
      VCompanyLibrary,
      MarkAsNotSuitLog,
      VMarkAsNotSuitLog,
      ChatMessageRecord,
      LlmModelUsageRecord,
    ],
    migrations: [
      Init1000000000000,
      UpdateChatStartupLogTable1729182577167,
      UpdateBossInfoTable1732032381304,
      AddColumnForMarkAsNotSuitLog1746092370665,
      AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526
    ],
    migrationsRun: true
  });
  return appDataSource.initialize();
}

export default class SqlitePlugin {
  initPromise: Promise<DataSource>;
  runRecordId: number;

  constructor(dbFilePath) {
    this.initPromise = initDb(dbFilePath);
    this.runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? 0
  }

  userInfo = null

  apply(hooks) {
    hooks.userInfoResponse.tapPromise(
      "SqlitePlugin",
      async (userInfoResponse) => {
        if (userInfoResponse.code !== 0) {
          return;
        }
        const { zpData: userInfo } = userInfoResponse;
        this.userInfo = userInfo
        console.log(userInfo);

        const ds = await this.initPromise;
        const userInfoRepository = ds.getRepository(UserInfo);

        const user = new UserInfo();
        user.encryptUserId = userInfo.encryptUserId;
        user.name = userInfo.name;

        return await userInfoRepository.save(user);
      }
    );
    hooks.mainFlowWillLaunch.tapPromise(
      "SqlitePlugin",
      async ({
        jobNotMatchStrategy,
        jobNotActiveStrategy,
        expectCityNotMatchStrategy,
        blockJobNotSuit,
        blockBossNotActive,
        blockBossNotNewChat
      }) => {
        if (
          jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
          jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
          expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
        ) {
          const ds = await this.initPromise;
          const last7DayMarkRecords = (await getNotSuitMarkRecordsInLastSomeDays(ds, 7)) ?? [];
          if (
            jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
            jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
          ) {
            last7DayMarkRecords
              .filter(it =>
                [
                  MarkAsNotSuitReason.JOB_NOT_SUIT,
                  MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON
                ].includes(it.markReason)
              )
              .map(
                it => it.encryptJobId
              )
              .forEach(
                id => blockJobNotSuit.add(id)
              )
          }
          if (
            jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
            jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
          ) {
            last7DayMarkRecords
              .filter(it => it.markReason === MarkAsNotSuitReason.BOSS_INACTIVE)
              .map(
                it => it.encryptJobId
              )
              .forEach(
                id => blockJobNotSuit.add(id)
              )
          }
          if (
            expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
            expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
          ) {
            last7DayMarkRecords
              .filter(it => it.markReason === MarkAsNotSuitReason.JOB_CITY_NOT_SUIT)
              .map(
                it => it.encryptJobId
              )
              .forEach(
                id => blockJobNotSuit.add(id)
              )
          }
          const last30DayChatStartupRecords = (await getChatStartupRecordsInLastSomeDays(ds, 30)) ?? [];
          const chattedJobIds = last30DayChatStartupRecords.map(it => it.encryptJobId)
          const chattedBossIds = ((await getBossIdsByJobIds(ds, chattedJobIds)) ?? []).map(it => it.encryptBossId)
          for (const id of chattedBossIds) {
            blockBossNotNewChat.add(id)
          }
        }
      }
    );

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async (_jobInfo) => {
      const ds = await this.initPromise;
      await saveJobInfoFromRecommendPage(ds, _jobInfo);
    });

    hooks.newChatStartup.tapPromise("SqlitePlugin", async (_jobInfo, { chatStartupFrom = ChatStartupFrom.AutoFromRecommendList, jobSource = undefined } = {}) => {
      const ds = await this.initPromise;
      return await saveChatStartupRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        chatStartupFrom,
        jobSource
      });
    });

    hooks.jobMarkedAsNotSuit.tapPromise("SqlitePlugin", async (_jobInfo, { markFrom = ChatStartupFrom.AutoFromRecommendList, markReason = undefined, extInfo = undefined, markOp = undefined, jobSource = undefined } = {}) => {
      const ds = await this.initPromise;
      return await saveMarkAsNotSuitRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        markFrom,
        markReason,
        extInfo,
        markOp,
        jobSource
      });
    });
  }
}
