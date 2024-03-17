import "reflect-metadata";
import { DataSource } from "typeorm";

import { BossInfo } from "./entity/BossInfo";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";
import { ChatStartupLog } from "./entity/ChatStartupLog";
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { UserInfo } from "./entity/UserInfo";

async function initDb() {
  const appDataSource = new DataSource({
    type: "sqlite",
    synchronize: true,
    logging: true,
    logger: "simple-console",
    database: "database.sqlite",
    entities: [
      ChatStartupLog,
      BossInfo,
      BossInfoChangeLog,
      CompanyInfo,
      CompanyInfoChangeLog,
      JobInfo,
      JobInfoChangeLog,
      BossActiveStatusRecord,
      UserInfo
    ],
  });
  return appDataSource.initialize();
}

export default class SqlitePlugin {
  initPromise: Promise<DataSource>

  constructor () {
    this.initPromise = initDb()
  }
  apply (hooks) {
    hooks.userInfoResponse.tapPromise(
      'SqlitePlugin',
      (userInfo) => new Promise((resolve, reject) => {
        console.log(userInfo)
      })
    )
  }
}
