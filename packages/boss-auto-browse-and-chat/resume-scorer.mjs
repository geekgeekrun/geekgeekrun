/**
 * resume-scorer.mjs
 *
 * Rule-based candidate scoring module for boss-auto-browse-and-chat.
 * No AI / external dependencies — pure JS logic.
 *
 * Scoring breakdown (total 100 points):
 *   - educationLevel  :  0–20
 *   - experience      :  0–20
 *   - skills          :  0–30
 *   - city            :  0–10
 *   - salary          :  0–10
 *   - completeness    :  0–10
 *
 * Usage:
 *   If boss-recruiter.json contains { "scoring": { "enabled": true } },
 *   call rankCandidates() after filterCandidates() to sort matched candidates
 *   by score (descending) before deciding to initiate chat.
 */

// ---------------------------------------------------------------------------
// Default scoring configuration
// ---------------------------------------------------------------------------

/**
 * Default scoring configuration.
 * Can be overridden via boss-recruiter.json's "scoring" field.
 *
 * @type {ScoringConfig}
 */
export const defaultScoringConfig = {
  enabled: false,

  /** Minimum total score required to initiate chat (0 = no threshold). */
  minScoreToChat: 0,

  /**
   * Education level weights.
   * Keys are lowercase substrings matched against candidateInfo.educationLevel.
   */
  educationWeights: {
    博士: 20,
    硕士: 15,
    本科: 10,
    大专: 5,
  },

  /**
   * Maximum points for each scoring dimension.
   * Adjust to re-weight dimensions without changing the scoring logic.
   */
  maxScores: {
    education: 20,
    experience: 20,
    skills: 30,
    city: 10,
    salary: 10,
    completeness: 10,
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a work-experience string like "3年" / "3-5年" / "10年以上" into
 * a representative numeric year value (the lower bound).
 *
 * @param {string|null|undefined} workExpStr
 * @returns {number} years of experience (NaN if not parseable)
 */
function parseWorkExpYears(workExpStr) {
  if (!workExpStr) return NaN;
  // e.g. "3-5年" → 3,  "10年以上" → 10,  "3年" → 3,  "应届" → 0
  if (/应届/.test(workExpStr)) return 0;
  const match = workExpStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

/**
 * Parse a salary string like "8k-12k" / "15-25k" / "面议" into
 * a [min, max] tuple in units of 千元 (k).
 *
 * @param {string|null|undefined} salaryStr
 * @returns {[number, number]} [min, max], both NaN if not parseable
 */
function parseSalaryRange(salaryStr) {
  if (!salaryStr) return [NaN, NaN];
  if (/面议/.test(salaryStr)) return [NaN, NaN];
  // e.g. "8k-12k", "15-25K", "8000-12000"
  const match = salaryStr.toLowerCase().match(/(\d+)[k]?\s*[-~]\s*(\d+)[k]?/);
  if (!match) return [NaN, NaN];
  let min = parseInt(match[1], 10);
  let max = parseInt(match[2], 10);
  // Normalize to 千元: if values look like full yuan (> 1000), divide by 1000
  if (min > 1000) min = Math.round(min / 1000);
  if (max > 1000) max = Math.round(max / 1000);
  return [min, max];
}

// ---------------------------------------------------------------------------
// Individual dimension scorers
// ---------------------------------------------------------------------------

/**
 * Score education level (0 – maxScores.education).
 *
 * @param {string|null|undefined} educationLevel
 * @param {ScoringConfig} config
 * @returns {number}
 */
function scoreEducation(educationLevel, config) {
  const max = config.maxScores.education;
  if (!educationLevel) return 0;
  const level = educationLevel.trim();
  for (const [keyword, points] of Object.entries(config.educationWeights)) {
    if (level.includes(keyword)) {
      // Scale the configured weight to fit within maxScores.education
      const configuredMax = Math.max(...Object.values(config.educationWeights));
      return Math.round((points / configuredMax) * max);
    }
  }
  return 0;
}

/**
 * Score work experience against the filter's expectWorkExpRange
 * (0 – maxScores.experience).
 *
 * Full score if within range; linearly decreasing outside range.
 *
 * @param {string|null|undefined} workExpStr
 * @param {number[]} expectWorkExpRange  [min, max] years
 * @param {ScoringConfig} config
 * @returns {number}
 */
function scoreExperience(workExpStr, expectWorkExpRange, config) {
  const max = config.maxScores.experience;
  const years = parseWorkExpYears(workExpStr);
  if (isNaN(years)) return Math.round(max * 0.5); // unknown → neutral score

  const [expMin, expMax] = expectWorkExpRange;
  if (years >= expMin && years <= expMax) return max;

  // Distance-based decay: -2 pts per year outside range, floor at 0
  const distance = years < expMin ? expMin - years : years - expMax;
  return Math.max(0, max - distance * 2);
}

/**
 * Score skill keyword matches (0 – maxScores.skills).
 *
 * @param {string|null|undefined} skillsStr  comma/space-separated skills
 * @param {string[]} expectSkillKeywords
 * @param {ScoringConfig} config
 * @returns {number}
 */
function scoreSkills(skillsStr, expectSkillKeywords, config) {
  const max = config.maxScores.skills;
  if (!expectSkillKeywords || expectSkillKeywords.length === 0) {
    // No keywords configured → full score (no penalty)
    return max;
  }
  if (!skillsStr) return 0;

  const skillsLower = skillsStr.toLowerCase();
  let matched = 0;
  for (const kw of expectSkillKeywords) {
    if (skillsLower.includes(kw.toLowerCase())) matched++;
  }
  return Math.round((matched / expectSkillKeywords.length) * max);
}

/**
 * Score city match (0 – maxScores.city).
 *
 * @param {string|null|undefined} city
 * @param {string[]} expectCityList
 * @param {ScoringConfig} config
 * @returns {number}
 */
function scoreCity(city, expectCityList, config) {
  const max = config.maxScores.city;
  if (!expectCityList || expectCityList.length === 0) return max;
  if (!city) return 0;
  const cityLower = city.toLowerCase();
  const matched = expectCityList.some((c) => cityLower.includes(c.toLowerCase()));
  return matched ? max : 0;
}

/**
 * Score salary expectation against expectSalaryRange (0 – maxScores.salary).
 *
 * @param {string|null|undefined} salaryExpect
 * @param {number[]} expectSalaryRange  [min, max] in 千元; [0,0] means no constraint
 * @param {ScoringConfig} config
 * @returns {number}
 */
function scoreSalary(salaryExpect, expectSalaryRange, config) {
  const max = config.maxScores.salary;
  const [filterMin, filterMax] = expectSalaryRange;

  // No salary constraint configured
  if (filterMin === 0 && filterMax === 0) return max;

  const [candMin, candMax] = parseSalaryRange(salaryExpect);
  if (isNaN(candMin) || isNaN(candMax)) return Math.round(max * 0.5); // unknown → neutral

  // Check overlap: candidate range overlaps with expected range
  const effectiveFilterMax = filterMax === 0 ? Infinity : filterMax;
  const hasOverlap = candMin <= effectiveFilterMax && candMax >= filterMin;
  if (hasOverlap) return max;

  // Partial score based on proximity
  const gap = candMin > effectiveFilterMax
    ? candMin - effectiveFilterMax
    : filterMin - candMax;
  return Math.max(0, max - gap);
}

/**
 * Score resume completeness (0 – maxScores.completeness).
 *
 * Awards points based on which profile fields are present.
 *
 * @param {CandidateInfo} candidateInfo
 * @param {ScoringConfig} config
 * @returns {number}
 */
function scoreCompleteness(candidateInfo, config) {
  const max = config.maxScores.completeness;
  const fields = [
    candidateInfo.educationLevel,
    candidateInfo.workExpYears,
    candidateInfo.city,
    candidateInfo.jobTitle,
    candidateInfo.salaryExpect,
    candidateInfo.skills,
  ];
  const filled = fields.filter((v) => v && String(v).trim().length > 0).length;
  return Math.round((filled / fields.length) * max);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ScoringConfig
 * @property {boolean} enabled
 * @property {number} minScoreToChat
 * @property {Object.<string, number>} educationWeights
 * @property {Object.<string, number>} maxScores
 */

/**
 * @typedef {Object} CandidateInfo
 * @property {string} encryptGeekId
 * @property {string} geekName
 * @property {string|null} educationLevel
 * @property {string|null} workExpYears
 * @property {string|null} city
 * @property {string|null} jobTitle
 * @property {string|null} salaryExpect
 * @property {string|null} skills
 */

/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} education
 * @property {number} experience
 * @property {number} skills
 * @property {number} city
 * @property {number} salary
 * @property {number} completeness
 */

/**
 * @typedef {Object} ScoreResult
 * @property {number} totalScore   0–100
 * @property {ScoreBreakdown} breakdown
 */

/**
 * Score a single candidate using rule-based logic.
 *
 * The filterConfig (from candidate-filter.json) provides the target ranges /
 * lists; scoringConfig (from boss-recruiter.json's "scoring" field, merged
 * with defaultScoringConfig) controls weights.
 *
 * @param {CandidateInfo} candidateInfo
 * @param {string|null} resumeText  Raw resume text extracted via canvas / API
 *   (currently reserved for future keyword extraction; not yet used).
 * @param {Object} filterConfig     Contents of candidate-filter.json
 * @param {ScoringConfig} [scoringConfig]  Merged with defaultScoringConfig
 * @returns {ScoreResult}
 */
export function scoreCandidate(candidateInfo, resumeText, filterConfig, scoringConfig) {
  const cfg = Object.assign({}, defaultScoringConfig, scoringConfig, {
    maxScores: Object.assign({}, defaultScoringConfig.maxScores, scoringConfig?.maxScores),
    educationWeights: Object.assign(
      {},
      defaultScoringConfig.educationWeights,
      scoringConfig?.educationWeights
    ),
  });

  const fc = filterConfig || {};

  const education = scoreEducation(candidateInfo.educationLevel, cfg);
  const experience = scoreExperience(
    candidateInfo.workExpYears,
    fc.expectWorkExpRange || [0, 99],
    cfg
  );
  const skills = scoreSkills(
    candidateInfo.skills,
    fc.expectSkillKeywords || [],
    cfg
  );
  const city = scoreCity(candidateInfo.city, fc.expectCityList || [], cfg);
  const salary = scoreSalary(
    candidateInfo.salaryExpect,
    fc.expectSalaryRange || [0, 0],
    cfg
  );
  const completeness = scoreCompleteness(candidateInfo, cfg);

  const breakdown = { education, experience, skills, city, salary, completeness };
  const totalScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { totalScore, breakdown };
}

/**
 * Score and rank a list of candidates, returning them sorted by totalScore
 * descending.
 *
 * Each element in the returned array is the original candidate object
 * augmented with a `scoreResult` property.
 *
 * @param {CandidateInfo[]} candidates
 * @param {Object} filterConfig    Contents of candidate-filter.json
 * @param {ScoringConfig} [scoringConfig]
 * @returns {(CandidateInfo & { scoreResult: ScoreResult })[]}
 */
export function rankCandidates(candidates, filterConfig, scoringConfig) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      scoreResult: scoreCandidate(candidate, null, filterConfig, scoringConfig),
    }))
    .sort((a, b) => b.scoreResult.totalScore - a.scoreResult.totalScore);
}
