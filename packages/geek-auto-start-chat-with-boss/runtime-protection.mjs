import { ReliabilityRejectReason } from '@geekgeekrun/sqlite-plugin/dist/enums.js'

export { ReliabilityRejectReason }

export class RuntimeProtectionManager {
  constructor(options = {}) {
    this.sourceUnreliableCounter = new Map()
    this.keywordStats = new Map()
    this.strictCityMode = options.strictCityMode ?? false
    this.targetCityList = options.targetCityList ?? []
    this.unreliableThreshold = options.unreliableThreshold ?? 5
    this.unreliableAction = options.unreliableAction ?? 'skipSource'
    this.keywordDegradationThreshold = options.keywordDegradationThreshold ?? 10
    this.keywordDegradationAction = options.keywordDegradationAction ?? 'skipKeyword'
    this.degradedSources = new Set()
    this.degradedKeywords = new Set()
    this.currentKeyword = null
    this.currentSourceType = null
    this.strictCityViolationCounter = new Map()
    this.strictCityViolationThreshold = options.strictCityViolationThreshold ?? 3
    this._shouldStopRun = false
    this._stopRunReason = null
  }

  setStrictCityMode(enabled) {
    this.strictCityMode = enabled
  }

  setTargetCityList(cityList) {
    this.targetCityList = cityList ?? []
  }

  setCurrentSource(sourceType) {
    this.currentSourceType = sourceType
    if (!this.sourceUnreliableCounter.has(sourceType)) {
      this.sourceUnreliableCounter.set(sourceType, 0)
    }
  }

  setCurrentKeyword(keyword) {
    if (keyword !== this.currentKeyword) {
      if (this.currentKeyword) {
        this.logKeywordTransition(this.currentKeyword, keyword)
      }
      this.currentKeyword = keyword
      if (keyword && !this.keywordStats.has(keyword)) {
        this.keywordStats.set(keyword, {
          seen: 0,
          rejected: 0,
          reliabilityRejected: 0,
          greeted: 0
        })
      }
    }
  }

  logKeywordTransition(fromKeyword, toKeyword) {
    const fromStats = this.keywordStats.get(fromKeyword)
    if (fromStats) {
      console.log(`[Keyword Transition] Leaving keyword "${fromKeyword}":`, {
        seen: fromStats.seen,
        rejected: fromStats.rejected,
        reliabilityRejected: fromStats.reliabilityRejected,
        greeted: fromStats.greeted
      })
    }
    if (toKeyword) {
      console.log(`[Keyword Transition] Switching to keyword "${toKeyword}"`)
    }
  }

  validateJobReliability(listJobData, selectedJobData, detailPayload) {
    const rejectReasons = []

    if (!detailPayload?.jobInfo?.jobName?.trim()) {
      rejectReasons.push({
        reason: ReliabilityRejectReason.MISSING_TITLE,
        message: 'Job title is missing or empty in detail payload'
      })
    }

    if (!detailPayload?.jobInfo?.postDescription?.trim()) {
      rejectReasons.push({
        reason: ReliabilityRejectReason.MISSING_DESCRIPTION,
        message: 'Job description is missing or empty in detail payload'
      })
    }

    if (this.isMalformedDetail(detailPayload)) {
      rejectReasons.push({
        reason: ReliabilityRejectReason.MALFORMED_DETAIL,
        message: 'Job detail appears malformed'
      })
    }

    if (listJobData && selectedJobData && detailPayload?.jobInfo) {
      const listTitle = (listJobData.jobName ?? '').toLowerCase().trim()
      const detailTitle = (detailPayload.jobInfo.jobName ?? '').toLowerCase().trim()
      const selectedTitle = (selectedJobData.jobName ?? '').toLowerCase().trim()

      if (listTitle && detailTitle && listTitle !== detailTitle) {
        rejectReasons.push({
          reason: ReliabilityRejectReason.LIST_DETAIL_TITLE_MISMATCH,
          message: `Title mismatch: list="${listJobData.jobName}" vs detail="${detailPayload.jobInfo.jobName}"`
        })
      }

      if (selectedTitle && detailTitle && selectedTitle !== detailTitle) {
        rejectReasons.push({
          reason: ReliabilityRejectReason.LIST_DETAIL_TITLE_MISMATCH,
          message: `Title mismatch: selected="${selectedJobData.jobName}" vs detail="${detailPayload.jobInfo.jobName}"`
        })
      }

      const listCompany = (listJobData.brandName ?? '').toLowerCase().trim()
      const detailCompany = (detailPayload.brandName ?? '').toLowerCase().trim()
      const selectedCompany = (selectedJobData.brandName ?? '').toLowerCase().trim()

      if (listCompany && detailCompany && listCompany !== detailCompany) {
        rejectReasons.push({
          reason: ReliabilityRejectReason.LIST_DETAIL_COMPANY_MISMATCH,
          message: `Company mismatch: list="${listJobData.brandName}" vs detail="${detailPayload.brandName}"`
        })
      }

      if (selectedCompany && detailCompany && selectedCompany !== detailCompany) {
        rejectReasons.push({
          reason: ReliabilityRejectReason.LIST_DETAIL_COMPANY_MISMATCH,
          message: `Company mismatch: selected="${selectedJobData.brandName}" vs detail="${detailPayload.brandName}"`
        })
      }

      const listCity = (listJobData.cityName ?? '').toLowerCase().trim()
      const detailCity = (detailPayload.jobInfo.cityName ?? selectedJobData.cityName ?? '').toLowerCase().trim()

      if (listCity && detailCity && listCity !== detailCity) {
        rejectReasons.push({
          reason: ReliabilityRejectReason.LIST_DETAIL_CITY_MISMATCH,
          message: `City mismatch: list="${listJobData.cityName}" vs detail="${detailCity}"`
        })
      }
    }

    return {
      isReliable: rejectReasons.length === 0,
      rejectReasons
    }
  }

  isMalformedDetail(detailPayload) {
    if (!detailPayload?.jobInfo) {
      return true
    }

    const desc = detailPayload.jobInfo.postDescription ?? ''
    if (desc.length > 100) {
      const repeatedPattern = /^(.{20,})\1{2,}$/
      if (repeatedPattern.test(desc.replace(/\s/g, ''))) {
        return true
      }
    }

    return false
  }

  recordUnreliableResult(sourceType, reason) {
    const currentCount = this.sourceUnreliableCounter.get(sourceType) ?? 0
    const newCount = currentCount + 1
    this.sourceUnreliableCounter.set(sourceType, newCount)

    console.log(`[Reliability] Source "${sourceType}" unreliable count: ${newCount}/${this.unreliableThreshold}`, {
      reason
    })

    if (this.currentKeyword) {
      const stats = this.keywordStats.get(this.currentKeyword)
      if (stats) {
        stats.reliabilityRejected++
      }
    }

    if (newCount >= this.unreliableThreshold) {
      this.degradedSources.add(sourceType)
      console.warn(`[Protection] Source "${sourceType}" has entered protection mode due to repeated unreliable results`)

      if (this.unreliableAction === 'stopRun') {
        this._shouldStopRun = true
        this._stopRunReason = `Source "${sourceType}" exceeded unreliable threshold (${newCount}/${this.unreliableThreshold})`
        console.warn(`[Protection] Run will be stopped: ${this._stopRunReason}`)
      }

      return true
    }

    return false
  }

  recordJobSeen() {
    if (this.currentKeyword) {
      const stats = this.keywordStats.get(this.currentKeyword)
      if (stats) {
        stats.seen++
      }
    }
  }

  recordJobRejected() {
    if (this.currentKeyword) {
      const stats = this.keywordStats.get(this.currentKeyword)
      if (stats) {
        stats.rejected++
      }
    }
  }

  recordJobGreeted() {
    if (this.currentKeyword) {
      const stats = this.keywordStats.get(this.currentKeyword)
      if (stats) {
        stats.greeted++
      }
    }
  }

  isSourceDegraded(sourceType) {
    return this.degradedSources.has(sourceType)
  }

  /**
   * Returns true if the run should be stopped entirely.
   */
  shouldStopRun() {
    return this._shouldStopRun
  }

  getStopRunReason() {
    return this._stopRunReason
  }

  checkKeywordDegradation() {
    if (!this.currentKeyword) {
      return false
    }

    const stats = this.keywordStats.get(this.currentKeyword)
    if (!stats) {
      return false
    }

    const totalSeen = stats.seen

    if (totalSeen >= this.keywordDegradationThreshold && stats.greeted === 0) {
      this.degradedKeywords.add(this.currentKeyword)
      console.warn(`[Protection] Keyword "${this.currentKeyword}" has degraded - no successful greetings after ${totalSeen} jobs`)

      if (this.keywordDegradationAction === 'stopRun') {
        this._shouldStopRun = true
        this._stopRunReason = `Keyword "${this.currentKeyword}" exceeded degradation threshold`
        console.warn(`[Protection] Run will be stopped: ${this._stopRunReason}`)
      }

      return true
    }

    if (totalSeen >= this.keywordDegradationThreshold) {
      const successRate = stats.greeted / totalSeen
      if (successRate < 0.05) {
        this.degradedKeywords.add(this.currentKeyword)
        console.warn(`[Protection] Keyword "${this.currentKeyword}" has degraded - low success rate: ${(successRate * 100).toFixed(1)}%`)

        if (this.keywordDegradationAction === 'stopRun') {
          this._shouldStopRun = true
          this._stopRunReason = `Keyword "${this.currentKeyword}" exceeded degradation threshold (success rate: ${(successRate * 100).toFixed(1)}%)`
          console.warn(`[Protection] Run will be stopped: ${this._stopRunReason}`)
        }

        return true
      }
    }

    return false
  }

  markCurrentKeywordDegraded(reason = 'unknown') {
    if (!this.currentKeyword) {
      return false
    }

    this.degradedKeywords.add(this.currentKeyword)
    console.warn(`[Protection] Keyword "${this.currentKeyword}" has degraded - ${reason}`)

    if (this.keywordDegradationAction === 'stopRun') {
      this._shouldStopRun = true
      this._stopRunReason = `Keyword "${this.currentKeyword}" degraded due to ${reason}`
      console.warn(`[Protection] Run will be stopped: ${this._stopRunReason}`)
    }

    return true
  }

  isKeywordDegraded(keyword) {
    return this.degradedKeywords.has(keyword)
  }

  validateStrictCity(jobData) {
    if (!this.strictCityMode || !this.targetCityList.length) {
      return { isValid: true }
    }

    const jobCity = (jobData.cityName ?? '').toLowerCase().trim()
    const isTargetCity = this.targetCityList.some(
      targetCity => targetCity.toLowerCase().trim() === jobCity
    )

    if (!isTargetCity) {
      return {
        isValid: false,
        reason: `City "${jobData.cityName}" is not in target city list: ${this.targetCityList.join(', ')}`
      }
    }

    return { isValid: true }
  }

  recordStrictCityViolation(sourceType) {
    const currentCount = this.strictCityViolationCounter.get(sourceType) ?? 0
    const newCount = currentCount + 1
    this.strictCityViolationCounter.set(sourceType, newCount)

    console.log(`[StrictCity] Source "${sourceType}" violation count: ${newCount}`)

    if (newCount >= this.strictCityViolationThreshold) {
      console.warn(`[Protection] Source "${sourceType}" is drifting into out-of-scope cities`)
      this.degradedSources.add(sourceType)
      return true
    }

    return false
  }

  getKeywordStats(keyword) {
    return this.keywordStats.get(keyword ?? this.currentKeyword)
  }

  getAllKeywordStats() {
    const result = {}
    for (const [keyword, stats] of this.keywordStats) {
      result[keyword] = { ...stats }
    }
    return result
  }

  getSourceStats() {
    const result = {}
    for (const [source, count] of this.sourceUnreliableCounter) {
      result[source] = {
        unreliableCount: count,
        isDegraded: this.degradedSources.has(source)
      }
    }
    return result
  }

  resetSourceCounter(sourceType) {
    this.sourceUnreliableCounter.set(sourceType, 0)
    this.degradedSources.delete(sourceType)
    this.strictCityViolationCounter.delete(sourceType)
  }

  resetKeywordStats(keyword) {
    if (keyword) {
      this.keywordStats.delete(keyword)
      this.degradedKeywords.delete(keyword)
    }
  }

  logSummary() {
    console.log('=== Runtime Protection Summary ===')
    console.log('Source Stats:', this.getSourceStats())
    console.log('Keyword Stats:', this.getAllKeywordStats())
    console.log('Degraded Sources:', Array.from(this.degradedSources))
    console.log('Degraded Keywords:', Array.from(this.degradedKeywords))
    if (this._shouldStopRun) {
      console.log('Stop Run Requested:', this._stopRunReason)
    }
    console.log('=================================')
  }
}

export function createRuntimeProtectionManager(options = {}) {
  return new RuntimeProtectionManager(options)
}
