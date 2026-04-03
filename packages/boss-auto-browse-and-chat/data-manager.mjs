/**
 * data-manager.mjs
 *
 * 数据统计与去重模块：
 * - 查询候选人是否已联系过（去重）
 * - 保存/更新候选人信息到数据库
 * - 插入联系记录日志
 * - 生成本次运行统计汇总
 * - 从候选人列表中去除已联系过的人
 *
 * 数据库调用约定：
 *   本模块通过 tapable hooks（由 sqlite-plugin 注册）异步写入数据库。
 *   调用方需在 hooks 上通过 SqlitePlugin.apply(hooks) 注册对应的 tap。
 *   直接查询（checkIfAlreadyContacted）则通过 hooks.queryCandidateByEncryptId.promise() 完成，
 *   该 hook 为 AsyncSeriesWaterfallHook，约定第一个返回非 null 的 tap 的返回值作为结果。
 */

/**
 * 查询数据库中是否已有该候选人的联系记录。
 *
 * 通过 `hooks.queryCandidateByEncryptId` hook 获取结果。
 * 如果 hook 未注册或查无记录，视为未联系过。
 *
 * @param {string} encryptGeekId - 候选人加密 ID
 * @param {{ queryCandidateByEncryptId?: import('tapable').AsyncSeriesWaterfallHook<[string]> }} hooks
 *   包含 queryCandidateByEncryptId hook 的 hooks 对象
 * @returns {Promise<{ contacted: boolean, lastContactTime: Date|null, contactCount: number }>}
 */
export async function checkIfAlreadyContacted (encryptGeekId, hooks) {
  try {
    const result = await hooks.queryCandidateByEncryptId?.promise?.(encryptGeekId)
    if (!result) {
      return { contacted: false, lastContactTime: null, contactCount: 0 }
    }
    const lastContactTime = result.lastContactTime ? new Date(result.lastContactTime) : null
    // CandidateInfo 实体上没有 contactCount 字段；以 lastContactTime 是否存在作为是否联系过的依据
    return {
      contacted: !!lastContactTime,
      lastContactTime,
      contactCount: lastContactTime ? 1 : 0
    }
  } catch (err) {
    console.warn('[data-manager] checkIfAlreadyContacted 查询失败，默认视为未联系过:', err.message)
    return { contacted: false, lastContactTime: null, contactCount: 0 }
  }
}

/**
 * 保存或更新候选人信息到数据库。
 *
 * 通过 `hooks.createOrUpdateCandidateInfo` hook 写入，hook 由 sqlite-plugin 注册。
 *
 * @param {{
 *   encryptGeekId: string,
 *   geekName: string,
 *   educationLevel?: string|null,
 *   workExpYears?: string|null,
 *   city?: string|null,
 *   jobTitle?: string|null,
 *   salaryExpect?: string|null,
 *   skills?: string|string[]|null,
 *   status?: string,
 *   rawData?: object|string|null
 * }} candidate - 候选人信息对象
 * @param {{ createOrUpdateCandidateInfo?: import('tapable').AsyncSeriesHook<[object]> }} hooks
 * @returns {Promise<void>}
 */
export async function saveCandidateInfo (candidate, hooks) {
  try {
    await hooks.createOrUpdateCandidateInfo?.promise?.({
      encryptGeekId: candidate.encryptGeekId,
      geekName: candidate.geekName,
      educationLevel: candidate.educationLevel ?? null,
      workExpYears: candidate.workExpYears ?? null,
      city: candidate.city ?? null,
      jobTitle: candidate.jobTitle ?? null,
      salaryExpect: candidate.salaryExpect ?? null,
      skills: Array.isArray(candidate.skills)
        ? candidate.skills.join(',')
        : (candidate.skills ?? null),
      status: candidate.status ?? 'new',
      rawData: candidate.rawData
        ? (typeof candidate.rawData === 'string'
            ? candidate.rawData
            : JSON.stringify(candidate.rawData))
        : null
    })
  } catch (err) {
    console.warn(`[data-manager] saveCandidateInfo 失败（${candidate.geekName}）:`, err.message)
  }
}

/**
 * 插入一条候选人联系记录日志。
 *
 * 通过 `hooks.insertCandidateContactLog` hook 写入，hook 由 sqlite-plugin 注册。
 *
 * @param {string} encryptGeekId - 候选人加密 ID
 * @param {string} contactType   - 联系类型，如 'chat_started'、'chat_failed'、'viewed' 等
 * @param {string|null} message  - 发送的消息内容（可为 null）
 * @param {string|null} result   - 结果描述，如 'success'、'DAILY_LIMIT_REACHED' 等（可为 null）
 * @param {{ insertCandidateContactLog?: import('tapable').AsyncSeriesHook<[object]> }} hooks
 * @returns {Promise<void>}
 */
export async function logContact (encryptGeekId, contactType, message, result, hooks) {
  const now = new Date()
  try {
    await hooks.insertCandidateContactLog?.promise?.({
      encryptGeekId,
      contactType,
      message: message ?? null,
      result: result ?? null,
      contactTime: now
    })
  } catch (err) {
    console.warn(`[data-manager] logContact 插入失败（${encryptGeekId}）:`, err.message)
  }
}

/**
 * 根据本次运行的所有处理结果生成统计汇总。
 *
 * @param {Array<{
 *   candidate?: { encryptGeekId?: string, geekName?: string },
 *   chatResult?: { success: boolean, reason?: string },
 *   skipped?: boolean,
 *   skipReason?: string
 * }>} results - 本次运行中每个候选人的处理结果
 * @returns {{
 *   totalBrowsed: number,
 *   totalMatched: number,
 *   totalSkipped: number,
 *   totalChatStarted: number,
 *   totalChatFailed: number,
 *   skipReasons: Record<string, number>
 * }}
 */
export function generateRunSummary (results) {
  const summary = {
    totalBrowsed: results.length,
    totalMatched: 0,
    totalSkipped: 0,
    totalChatStarted: 0,
    totalChatFailed: 0,
    skipReasons: {}
  }

  for (const item of results) {
    if (item.skipped) {
      summary.totalSkipped++
      const reason = item.skipReason || 'unknown'
      summary.skipReasons[reason] = (summary.skipReasons[reason] || 0) + 1
    } else {
      summary.totalMatched++
      if (item.chatResult?.success) {
        summary.totalChatStarted++
      } else if (item.chatResult && !item.chatResult.success) {
        summary.totalChatFailed++
        const reason = item.chatResult.reason || 'unknown'
        const key = `chat_failed:${reason}`
        summary.skipReasons[key] = (summary.skipReasons[key] || 0) + 1
      }
    }
  }

  return summary
}

/**
 * 从候选人列表中排除已联系过的人。
 *
 * @param {Array<{ encryptGeekId: string }>} candidates - 待去重的候选人列表
 * @param {Set<string>} contactedSet - 已联系过的 encryptGeekId 集合
 * @returns {Array<{ encryptGeekId: string }>} 去重后的候选人列表
 */
export function deduplicateCandidates (candidates, contactedSet) {
  if (!contactedSet || contactedSet.size === 0) {
    return candidates
  }
  return candidates.filter(c => !contactedSet.has(c.encryptGeekId))
}
