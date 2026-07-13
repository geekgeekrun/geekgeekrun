import { computed, reactive } from 'vue'
import type {
  CityGroupsDto,
  IndustryFilterGroupDto,
  JobFilterConditionsDto,
  PresentationDataResourcesDto
} from '@geekgeekrun/ggr-protocol'

export enum MarkAsNotSuitReason {
  UNKNOWN = 0,
  BOSS_INACTIVE = 1,
  USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON = 2,
  JOB_NOT_SUIT = 3,
  JOB_CITY_NOT_SUIT = 4,
  JOB_WORK_EXP_NOT_SUIT = 5,
  JOB_SALARY_NOT_SUIT = 6,
  COMPANY_NAME_NOT_SUIT = 7
}

export enum MarkAsNotSuitOp {
  MARK_AS_NOT_SUIT_ON_BOSS = 1,
  MARK_AS_NOT_SUIT_ON_LOCAL = 2,
  NO_OP = 3
}

export enum StrategyScopeOptionWhenMarkJobNotMatch {
  ALL_JOB = 1,
  ONLY_COMPANY_MATCHED_JOB = 2
}

export enum SalaryCalculateWay {
  MONTH_SALARY = 1,
  ANNUAL_PACKAGE = 2
}

export enum JobDetailRegExpMatchLogic {
  EVERY = 1,
  SOME = 2
}

export enum JobSource {
  expect = 1,
  recommend = 2,
  search = 3
}

export enum CombineRecommendJobFilterType {
  ANY_COMBINE = 1,
  STATIC_COMBINE = 2
}

const emptyFilterConditions: JobFilterConditionsDto = {
  salaryList: [],
  experienceList: [],
  degreeList: [],
  scaleList: []
}

export const filterConditions = reactive<JobFilterConditionsDto>({ ...emptyFilterConditions })
export const industryFilterExemptions = reactive<IndustryFilterGroupDto[]>([])
export const cityGroups = reactive<CityGroupsDto>({ zpData: { hotCityList: [], cityGroup: [] } })
export const presentationDataState = reactive({
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: ''
})
export const presentationDataReady = computed(() => presentationDataState.status === 'ready')
export const isPresentationDataLoading = computed(() => !presentationDataReady.value)

export function beginPresentationDataLoad() {
  presentationDataState.status = 'loading'
  presentationDataState.error = ''
}

export function setPresentationData(config: PresentationDataResourcesDto) {
  Object.assign(filterConditions, config['job-filter-conditions'])
  industryFilterExemptions.splice(
    0,
    industryFilterExemptions.length,
    ...config['industry-filter-exemptions']
  )
  Object.assign(cityGroups, config['city-groups'])
  presentationDataState.status = 'ready'
  presentationDataState.error = ''
}

export function failPresentationDataLoad(error: unknown) {
  presentationDataState.status = 'error'
  presentationDataState.error = error instanceof Error ? error.message : '动态筛选数据加载失败'
}

export const activeDescList = [
  '',
  '半年前活跃',
  '近半年活跃',
  '5月内活跃',
  '4月内活跃',
  '3月内活跃',
  '2月内活跃',
  '本月活跃',
  '2周内活跃',
  '本周活跃',
  '3日内活跃',
  '昨日活跃',
  '今日活跃',
  '刚刚活跃'
]

export const sampleCompanyList = ['青钱', '软通动力', '南天', '睿服', '中电金信', '佰钧成']

export function checkAnyCombineBossRecommendFilterHasCondition(value: Record<string, unknown>) {
  return Object.values(value ?? {}).some((item) => Array.isArray(item) && item.length > 0)
}

function combinationCount(values: unknown, maximum: number) {
  const selected = Array.isArray(values) ? values.filter((value) => value !== 0) : []
  let count = 1
  for (let size = 1; size <= Math.min(maximum, selected.length); size++) {
    let numerator = 1
    for (let index = 0; index < size; index++) numerator *= (selected.length - index) / (index + 1)
    count += numerator
  }
  return count
}

export function calculateTotalCombinations(
  selectedFilters: Record<string, unknown>,
  includeEmptyCondition: boolean
) {
  const result = [
    combinationCount(selectedFilters.cityList, 1),
    combinationCount(selectedFilters.salaryList, 1),
    combinationCount(selectedFilters.experienceList, Number.MAX_SAFE_INTEGER),
    combinationCount(selectedFilters.degreeList, Number.MAX_SAFE_INTEGER),
    combinationCount(selectedFilters.scaleList, Number.MAX_SAFE_INTEGER),
    combinationCount(selectedFilters.industryList, 3)
  ].reduce((total, count) => total * count, 1)
  return includeEmptyCondition ? result : result - 1
}

export function getStaticCombineFilterKey(condition: Record<string, unknown>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(condition ?? {})
        .filter(([, value]) => value !== null && value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
    )
  )
}

export function formatStaticCombineFilters(conditions: Array<Record<string, unknown>> = []) {
  const uniqueConditions = [
    ...new Map(
      conditions.map((condition) => [getStaticCombineFilterKey(condition), condition])
    ).values()
  ]
  const result = uniqueConditions.map((condition) => ({
    cityList: condition.city ? [condition.city] : [],
    salaryList: condition.salary ? [condition.salary] : [],
    experienceList: condition.experience ? [condition.experience] : [],
    degreeList: condition.degree ? [condition.degree] : [],
    scaleList: condition.scale ? [condition.scale] : [],
    industryList: condition.industry ? [condition.industry] : []
  }))
  return result.length
    ? result
    : [
        {
          cityList: [],
          salaryList: [],
          experienceList: [],
          degreeList: [],
          scaleList: [],
          industryList: []
        }
      ]
}

export function formatCompanyScale(
  low: number | null | undefined,
  high: number | null | undefined
) {
  if (low == null && high == null) return ''
  if (low == null) return `${high}人以下`
  if (high == null) return `${low}人以上`
  return `${low}-${high}人`
}
