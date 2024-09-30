import { DataSource } from "typeorm";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { BossInfo } from "./entity/BossInfo";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { parseCompanyScale, parseSalary } from "./utils/parser";
import { ChatStartupLog } from "./entity/ChatStartupLog";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";

function getBossInfoIfIsEqual (savedOne, currentOne) {
  if (savedOne === currentOne) {
    return true
  }
  if ((savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)) {
    return false;
  }
  if (
    ['__ggr_encryptBrandId', 'brandName', 'title', 'name'].some(key => savedOne[key] !== currentOne[key])
  ) {
    return false
  }
  return true
}

export async function saveJobInfoFromRecommendPage(ds: DataSource, _jobInfo) {
  const { bossInfo, brandComInfo, jobInfo } = _jobInfo;

  bossInfo['__ggr_encryptBrandId'] = brandComInfo.encryptBrandId
  //#region boss
  // get origin
  const bossInfoChangeLogRepository = ds.getRepository(BossInfoChangeLog)
  let lastSavedBossInfo
  try {
    lastSavedBossInfo = JSON.parse((await bossInfoChangeLogRepository.findOne({
      where: { encryptBossId: jobInfo.encryptUserId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedBossInfo = null
  }
  const isBossInfoEqual = getBossInfoIfIsEqual(lastSavedBossInfo, bossInfo)
  if (!isBossInfoEqual) {
    const changeLog = new BossInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(bossInfo)
    changeLog.encryptBossId = jobInfo.encryptUserId
    changeLog.updateTime = new Date()
    await bossInfoChangeLogRepository.save(changeLog)
  }
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
  const companyScale = parseCompanyScale(brandComInfo.scaleName);
  company.scaleLow = companyScale[0];
  company.scaleHigh = companyScale[1];

  const companyInfoRepository = ds.getRepository(CompanyInfo);
  await companyInfoRepository.save(company);
  //#endregion

  //#region job
  const job = new JobInfo();
  const jobSalary = parseSalary(jobInfo.salaryDesc);
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
    salaryHigh: jobSalary.high,
    salaryLow: jobSalary.low,
    salaryMonth: jobSalary.month,
  };

  Object.assign(job, jobUpdatePayload);

  const jobInfoRepository = ds.getRepository(JobInfo);
  await jobInfoRepository.save(job);
  //#endregion

  //#region save boss active status
  // look up if the lastActiveStatus of the newest one is equal to the current one.
  // if equal, just update the updateDate
  // else insert a new record

  const bossActiveStatusRecord = new BossActiveStatusRecord();
  bossActiveStatusRecord.encryptBossId = boss.encryptBossId;
  bossActiveStatusRecord.updateTime = new Date();
  bossActiveStatusRecord.lastActiveStatus = bossInfo.activeTimeDesc;

  const bossActiveStatusRecordRepository = ds.getRepository(
    BossActiveStatusRecord
  );
  const existNewestRecordByBossId =
    await bossActiveStatusRecordRepository.findOne({
      where: { encryptBossId: boss.encryptBossId },
      order: { updateTime: "DESC" },
    });
  if (
    existNewestRecordByBossId &&
    existNewestRecordByBossId.lastActiveStatus === bossInfo.activeTimeDesc
  ) {
    bossActiveStatusRecord.id = existNewestRecordByBossId.id;
  }
  await bossActiveStatusRecordRepository.save(bossActiveStatusRecord);
  //#endregion
  return;
}

export async function saveChatStartupRecord(ds: DataSource, _jobInfo, { encryptUserId }) {
  const { jobInfo } = _jobInfo;

  //#region chat-startup-log
  const chatStartupLog = new ChatStartupLog()
  const chatStartupLogPayload: Partial<ChatStartupLog> = {
    date: new Date(),
    encryptCurrentUserId: encryptUserId,
    encryptJobId: jobInfo.encryptId,
  }
  Object.assign(chatStartupLog, chatStartupLogPayload)

  const chatStartupLogRepository = ds.getRepository(ChatStartupLog);
  await chatStartupLogRepository.save(chatStartupLog);
  //#endregion
  return
}
