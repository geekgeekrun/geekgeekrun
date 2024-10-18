import "reflect-metadata";
import { type DataSource } from "typeorm";
import { requireTypeorm } from "./utils/module-loader";

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
import { VChatStartupLog } from "./entity/VChatStartupLog";
import { VBossLibrary } from "./entity/VBossLibrary";
import { VJobLibrary } from "./entity/VJobLibrary";
import { VCompanyLibrary } from "./entity/VCompanyLibrary"

import sqlite3 from 'sqlite3';
import * as cliHighlight from 'cli-highlight';
import { saveChatStartupRecord, saveJobInfoFromRecommendPage } from "./handlers";
import { UpdateChatStartupLogTable1729182577167 } from "./migrations/1729182577167-UpdateChatStartupLogTable";

Boolean(cliHighlight);

export function initDb(dbFilePath) {
  const { DataSource } = requireTypeorm()
  const appDataSource = new DataSource({
    type: "sqlite",
    synchronize: true,
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
      VCompanyLibrary
    ],
    migrations: [
      UpdateChatStartupLogTable1729182577167
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
  }

  userInfo = null

  apply(hooks) {
    hooks.daemonInitialized.tapPromise(
      "SqlitePlugin",
      async () => {
        const ds = await this.initPromise;

        const autoStartChatRunRecord = new AutoStartChatRunRecord();
        autoStartChatRunRecord.date = new Date();

        const autoStartChatRunRecordRepository = ds.getRepository(AutoStartChatRunRecord)
        const result = await autoStartChatRunRecordRepository.save(autoStartChatRunRecord);

        this.runRecordId = result.id;
      }
    );
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

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async (_jobInfo) => {
      const ds = await this.initPromise;
      await saveJobInfoFromRecommendPage(ds, _jobInfo);
    });

    hooks.newChatStartup.tapPromise("SqlitePlugin", async (_jobInfo, { chatStartupFrom = ChatStartupFrom.AutoFromRecommendList } = {}) => {
      const ds = await this.initPromise;
      return await saveChatStartupRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        chatStartupFrom
      });
    });
  }
}
