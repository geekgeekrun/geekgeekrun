import "reflect-metadata";
import { type DataSource } from "typeorm";
import { parseCompanyScale, parseSalary } from "./utils/parser";
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

function initDb(dbFilePath) {
  const { DataSource } = requireTypeorm()
  const appDataSource = new DataSource({
    type: "sqlite",
    synchronize: true,
    logging: true,
    logger: "simple-console",
    database: dbFilePath,
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

    hooks.newChatStartup.tapPromise("SqlitePlugin", async (_jobInfo) => {
      console.log(_jobInfo);
      debugger;
      const ds = await this.initPromise;

      const { bossInfo, brandComInfo, jobInfo } = _jobInfo;

      //#region boss
      const boss = new BossInfo();
      boss.encryptBossId = jobInfo.encryptUserId;
      boss.encryptCompanyId = brandComInfo.encryptBrandId;
      boss.name = bossInfo.name;
      boss.title = bossInfo.title;
      boss.date = new Date();
      const bossInfoRepository = ds.getRepository(BossInfo);
      await bossInfoRepository.save(boss);
      //#endregion

      //#region company
      const company = new CompanyInfo();
      company.encryptCompanyId = brandComInfo.encryptBrandId;
      company.brandName = brandComInfo.brandName;
      company.name = brandComInfo.customerBrandName;
      company.industryName = brandComInfo.industryName;
      company.stageName = brandComInfo.stageName;
      const companyScale = parseCompanyScale(brandComInfo.scaleName)
      company.scaleLow = companyScale[0]
      company.scaleHeight = companyScale[1]

      const companyInfoRepository = ds.getRepository(CompanyInfo);
      await companyInfoRepository.save(company);
      //#endregion

      //#region job
      const job = new JobInfo();
      const jobSalary = parseSalary(jobInfo.salaryDesc)
      const jobUpdatePayload: JobInfo = {
        address: jobInfo.address,
        degreeName: jobInfo.degreeName,
        description: jobInfo.postDescription,
        encryptBossId: jobInfo.encryptUserId,
        encryptCompanyId: brandComInfo.encryptBrandId,
        encryptJobId: jobInfo.encryptId,
        jobName: jobInfo.jobName,
        positionName: jobInfo.positionName,
        experienceName: jobInfo.experienceName,
        salaryHeight: jobSalary.heigh,
        salaryLow: jobSalary.low,
        salaryMonth: jobSalary.month,
      };

      Object.assign(job, jobUpdatePayload);

      const jobInfoRepository = ds.getRepository(JobInfo);
      await jobInfoRepository.save(job);
      //#endregion

      //#region chat-startup-log
      const chatStartupLog = new ChatStartupLog()
      const chatStartupLogPayload: Partial<ChatStartupLog> = {
        date: new Date(),
        encryptCurrentUserId: this.userInfo.encryptUserId,
        encryptJobId: jobInfo.encryptId,
      }
      Object.assign(chatStartupLog, chatStartupLogPayload)

      const chatStartupLogRepository = ds.getRepository(ChatStartupLog);
      await chatStartupLogRepository.save(chatStartupLog);
      //#endregion
      return
    });
  }
}
