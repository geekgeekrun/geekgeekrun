import { DataSource, Raw } from "typeorm";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { BossInfo } from "./entity/BossInfo";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { parseCompanyScale, parseSalary } from "./utils/parser";
import { ChatStartupLog } from "./entity/ChatStartupLog";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog";
import { MarkAsNotSuitLog } from "./entity/MarkAsNotSuitLog";
import { ChatMessageRecord } from "./entity/ChatMessageRecord";
import { LlmModelUsageRecord } from "./entity/LlmModelUsageRecord";
import { JobHireStatusRecord } from "./entity/JobHireStatusRecord";

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

function getCompanyInfoIfIsEqual (savedOne, currentOne) {
  if (savedOne === currentOne) {
    return true
  }
  if (
    (savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)
  ) {
    return false;
  }
  if (['brandName', 'stage', 'scale', 'industry', 'introduce'].some(key => savedOne[key] !== currentOne[key])) {
    return false;
  }
  if (
    [...currentOne.labels ?? []].sort().join('-') !==
    [...savedOne.labels ?? []].sort().join('-')
  ) {
    return false
  }
  return true;
}

function cleanMultiLineTextForCompare (input: string) {
  return input
    // 去掉连续空行
    .replace(/\n\s*\n+/g, '\n')
    // 去掉连续的空白字符
    .replace(/\s+/g, ' ')
    // 去掉每行开头、结尾的空白字符
    .replace(/^\s+|\s+$/gm, '');
}
function getJobInfoIfIsEqual (savedOne, currentOne) {
  if (savedOne === currentOne) {
    return true
  }
  if (
    (savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)
  ) {
    return false;
  }
  if ([
    'encryptUserId',
    'invalidStatus',
    'jobName',
    'positionName',
    'locationName',
    'experienceName',
    'degreeName',
    'salaryDesc',
    'payTypeDesc',
    'address',
    'jobStatusDesc'
  ].some(key => savedOne[key] !== currentOne[key])) {
    return false;
  }
  if (
    cleanMultiLineTextForCompare(savedOne.postDescription?.trim() ?? '') !== 
    cleanMultiLineTextForCompare(currentOne.postDescription?.trim() ?? '')
  ) {
    return false
  }
  if (
    [...currentOne.showSkills ?? []].sort().join('-') !==
    [...savedOne.showSkills ?? []].sort().join('-')
  ) {
    return false
  }
  return true;
}

export async function saveJobInfoFromRecommendPage(ds: DataSource, _jobInfo) {
  const { bossInfo, brandComInfo, jobInfo } = _jobInfo;

  bossInfo['__ggr_encryptBrandId'] = brandComInfo.encryptBrandId
  bossInfo['__ggr_encryptBossId'] = jobInfo.encryptUserId
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
  // get origin
  const companyInfoChangeLogRepository = ds.getRepository(CompanyInfoChangeLog)
  let lastSavedCompanyInfo
  try {
    lastSavedCompanyInfo = JSON.parse((await companyInfoChangeLogRepository.findOne({
      where: { encryptCompanyId: brandComInfo.encryptBrandId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedCompanyInfo = null
  }
  const isCompanyInfoEqual = getCompanyInfoIfIsEqual(lastSavedCompanyInfo, brandComInfo)
  if (!isCompanyInfoEqual) {
    const changeLog = new CompanyInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(brandComInfo)
    changeLog.encryptCompanyId = brandComInfo.encryptBrandId
    changeLog.updateTime = new Date()
    await companyInfoChangeLogRepository.save(changeLog)
  }

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
  const jobInfoChangeLogRepository = ds.getRepository(JobInfoChangeLog);
  let lastSavedJobInfo
  try {
    lastSavedJobInfo = JSON.parse((await jobInfoChangeLogRepository.findOne({
      where: { encryptJobId: jobInfo.encryptId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedJobInfo = null
  }
  const isJobInfoEqual = getJobInfoIfIsEqual(lastSavedJobInfo, jobInfo)
  if (!isJobInfoEqual) {
    const changeLog = new JobInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(jobInfo)
    changeLog.encryptJobId = jobInfo.encryptId
    changeLog.updateTime = new Date()
    await jobInfoChangeLogRepository.save(changeLog)
  }

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

export async function saveChatStartupRecord(
  ds: DataSource,
  _jobInfo,
  { encryptUserId },
  { autoStartupChatRecordId = undefined, chatStartupFrom = undefined, jobSource = undefined } = {}
) {
  const { jobInfo } = _jobInfo;

  //#region chat-startup-log
  const chatStartupLog = new ChatStartupLog()
  const chatStartupLogPayload: Partial<ChatStartupLog> = {
    date: new Date(),
    encryptCurrentUserId: encryptUserId,
    encryptJobId: jobInfo.encryptId,
    autoStartupChatRecordId,
    chatStartupFrom,
    jobSource,
  }
  Object.assign(chatStartupLog, chatStartupLogPayload)

  const chatStartupLogRepository = ds.getRepository(ChatStartupLog);
  await chatStartupLogRepository.save(chatStartupLog);
  //#endregion
  return
}

export async function saveMarkAsNotSuitRecord(
  ds: DataSource,
  _jobInfo,
  { encryptUserId },
  { autoStartupChatRecordId = undefined, markFrom = undefined, extInfo = undefined, markReason = undefined, markOp = undefined, jobSource = undefined } = {}
) {
  const { jobInfo } = _jobInfo;

  //#region mark-as-not-suit-log
  const markAsNotSuitLog = new MarkAsNotSuitLog()
  const markAsNotSuitLogPayload: Partial<MarkAsNotSuitLog> = {
    date: new Date(),
    encryptCurrentUserId: encryptUserId,
    encryptJobId: jobInfo.encryptId,
    autoStartupChatRecordId,
    markFrom,
    markReason,
    extInfo: extInfo ? JSON.stringify(extInfo) : undefined,
    markOp,
    jobSource,
  }
  Object.assign(markAsNotSuitLog, markAsNotSuitLogPayload)

  const markAsNotSuitLogRepository = ds.getRepository(MarkAsNotSuitLog);
  await markAsNotSuitLogRepository.save(markAsNotSuitLog);
  //#endregion
  return
}

export async function saveChatMessageRecord(
  ds: DataSource,
  records: ChatMessageRecord[]
) {
  //#region mark-as-not-suit-log
  const chatMessageRecordList = records.map(it => {
    const o = new ChatMessageRecord()
    Object.assign(o, it)
    return o
  })
  const chatMessageRecordRepository = ds.getRepository(ChatMessageRecord);
  await chatMessageRecordRepository.save(chatMessageRecordList);
  //#endregion
  return
}

export async function saveGptCompletionRequestRecord(
  ds: DataSource,
  records: LlmModelUsageRecord[]
) {
  //#region mark-as-not-suit-log
  const list = records.map(it => {
    const o = new LlmModelUsageRecord()
    for (const k of Object.keys(it)) {
      o[k] = it[k]
    }
    return o
  })
  const chatMessageRecordRepository = ds.getRepository(LlmModelUsageRecord);
  await chatMessageRecordRepository.save(list);
  //#endregion
  return
}

export async function getNotSuitMarkRecordsInLastSomeDays (ds: DataSource, days = 0) {
  const repo = ds.getRepository(MarkAsNotSuitLog)
  const result = await repo.findBy({
    date: Raw(alias => `DATE(${alias}) >= DATE('${
      new Date(
        Number(new Date()) - days * 24 * 60 * 60 * 1000
      ).toISOString()
    }')`)
  })
  return result
}

export async function getChatStartupRecordsInLastSomeDays (ds: DataSource, days = 0) {
  const repo = ds.getRepository(ChatStartupLog)
  const result = await repo.findBy({
    date: Raw(alias => `DATE(${alias}) >= DATE('${
      new Date(
        Number(new Date()) - days * 24 * 60 * 60 * 1000
      ).toISOString()
    }')`)
  })
  return result
}

export async function getBossIdsByJobIds (ds: DataSource, jobIds: string[] = []) {
  const repo = ds.getRepository(JobInfo)
  const result = await repo.find({
    where: jobIds.map(
      id => ({
        encryptJobId: id
      })
    )
  })
  return result
}

export async function saveJobHireStatusRecord(
  ds: DataSource,
  record: JobHireStatusRecord
) {
  const jobHireStatusRecordRepository = ds.getRepository(JobHireStatusRecord);
  await jobHireStatusRecordRepository.save(record);
  return
}

export async function getJobHireStatusRecord(
  ds: DataSource,
  encryptJobId: string
) {
  const repo = ds.getRepository(JobHireStatusRecord)
  const result = await repo.findOne({
    where: {
      encryptJobId
    }
  })
  return result
}