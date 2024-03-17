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
      UserInfo,
    ],
  });
  return appDataSource.initialize();
}

export default class SqlitePlugin {
  initPromise: Promise<DataSource>;

  constructor() {
    this.initPromise = initDb();
  }
  apply(hooks) {
    hooks.userInfoResponse.tapPromise("SqlitePlugin", async (userInfoResponse) => {
      if (userInfoResponse.code !== 0) {
        return
      }
      const { zpData: userInfo } = userInfoResponse
      console.log(userInfo);
      const ds = await this.initPromise;
      const userInfoRepository = ds.getRepository(UserInfo);

      const user = new UserInfo();
      user.encryptUserId = userInfo.encryptUserId
      user.name = userInfo.name

      return await userInfoRepository.save(user)
    });
  }
}
