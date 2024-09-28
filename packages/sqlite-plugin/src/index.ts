import "reflect-metadata";
import { type DataSource } from "typeorm";
import { requireTypeorm } from "./utils/module-loader";

import { BossInfo } from "./entity/BossInfo";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";
import { ChatStartupLog } from './entity/ChatStartupLog';
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { UserInfo } from "./entity/UserInfo";
import { VChatStartupLog } from "./entity/VChatStartupLog";

import sqlite3 from 'sqlite3';
import * as cliHighlight from 'cli-highlight';
import { saveJobInfoFromRecommendPage } from "./handlers";
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
      VChatStartupLog
    ],
  });
  return appDataSource.initialize();
}

export default class SqlitePlugin {
  initPromise: Promise<DataSource>;

  constructor(dbFilePath) {
    this.initPromise = initDb(dbFilePath);
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

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async (_jobInfo) => {
      const ds = await this.initPromise;
      saveJobInfoFromRecommendPage(ds, _jobInfo);
    });

    hooks.newChatStartup.tapPromise("SqlitePlugin", async (_jobInfo) => {
      const { jobInfo } = _jobInfo;

      //#region chat-startup-log
      const chatStartupLog = new ChatStartupLog()
      const chatStartupLogPayload: Partial<ChatStartupLog> = {
        date: new Date(),
        encryptCurrentUserId: this.userInfo.encryptUserId,
        encryptJobId: jobInfo.encryptId,
      }
      Object.assign(chatStartupLog, chatStartupLogPayload)

      const ds = await this.initPromise;
      const chatStartupLogRepository = ds.getRepository(ChatStartupLog);
      await chatStartupLogRepository.save(chatStartupLog);
      //#endregion
      return
    });
  }
}
