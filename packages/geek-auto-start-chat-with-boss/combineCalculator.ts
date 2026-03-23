function combine(arr: number[], min: number, max: number): number[][] {
  const result: number[][] = []
  const n = arr.length

  for (let r = min; r <= Math.min(max, n); r++) {
    const indices = Array(r)
      .fill(0)
      .map((_, i) => i)
    result.push(indices.map((i) => arr[i]))

    while (true) {
      let i = r - 1

      while (i >= 0 && indices[i] === i + n - r) {
        i--
      }

      if (i < 0) break

      indices[i]++

      for (let j = i + 1; j < r; j++) {
        indices[j] = indices[j - 1] + 1
      }

      result.push(indices.map((j) => arr[j]))
    }
  }

  return result
}

function combineWithZero(arr: number[], min: number, max: number): number[][] {
  let combineResult: number[][];
  if (!Array.isArray(arr)) {
    arr = []
  }
  if (arr.includes(0)) {
    combineResult = [].concat(
      combine(
        arr.filter((x) => x !== 0),
        min,
        max
      )
    );
  } else {
    combineResult = [].concat(combine(arr, min, max));
  }
  return combineResult;
}

export function* combineFiltersWithConstraintsGenerator(selectedFilters: {
  cityList: number[]
  salaryList: number[]
  experienceList: number[]
  degreeList: number[]
  scaleList: number[]
  industryList: number[]
}): Generator<{
  cityList: number[]
  salaryList: number[]
  experienceList: number[]
  degreeList: number[]
  scaleList: number[]
  industryList: number[]
}> {
  const { cityList, salaryList, experienceList, degreeList, scaleList, industryList } =
    selectedFilters;

  const cityComb = combineWithZero(cityList, 0, 1)
  const salaryComb = combineWithZero(salaryList, 0, 1)
  const experienceComb = combineWithZero(experienceList, 0, experienceList.length)
  const degreeComb = combineWithZero(degreeList, 0, degreeList.length)
  const scaleComb = combineWithZero(scaleList, 0, scaleList.length)
  const industryComb = combineWithZero(industryList, 0, 3)

  for (const city of cityComb) {
    for (const salary of salaryComb) {
      for (const experience of experienceComb) {
        for (const degree of degreeComb) {
          for (const scale of scaleComb) {
            for (const industry of industryComb) {
              yield {
                cityList: city,
                salaryList: salary,
                experienceList: experience,
                degreeList: degree,
                scaleList: scale,
                industryList: industry
              }
            }
          }
        }
      }
    }
  }
}

export function calculateTotalCombinations(selectedFilters: {
  cityList?: number[]
  salaryList?: number[]
  experienceList?: number[]
  degreeList?: number[]
  scaleList?: number[]
  industryList?: number[]
}, includeEmptyCondition?: boolean): number {
  const {
    cityList = [],
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  const cityComb = combineWithZero(cityList, 0, 1)
  const salaryComb = combineWithZero(salaryList, 0, 1)
  const experienceComb = combineWithZero(experienceList, 0, experienceList.length)
  const degreeComb = combineWithZero(degreeList, 0, degreeList.length)
  const scaleComb = combineWithZero(scaleList, 0, scaleList.length)
  const industryComb = combineWithZero(industryList, 0, 3)

  let result = [cityComb, salaryComb, experienceComb, degreeComb, scaleComb, industryComb].reduce((accu, cur) => {
    return accu * cur.length
  }, 1)
  if (!includeEmptyCondition) {
    result -= 1
  }
  return result
}

export function checkAnyCombineBossRecommendFilterHasCondition(value: any): boolean {
  if (!Object.keys(value ?? {}).length) {
    return false
  }
  return Object.keys(value).some((k) => {
    return !!value[k]?.length
  })
}

export function getStaticCombineFilterKey(condition: any): string {
  const kAsO: Record<string, any> = {}
  for (const key of Object.keys(condition ?? []).sort()) {
    if (condition[key] === null || condition[key] === undefined) {
      continue
    }
    kAsO[key] = condition[key]
  }
  return JSON.stringify(kAsO)
}

export function formatStaticCombineFilters(rawStaticCombineRecommendJobFilterConditions: any[]): any[] {
  rawStaticCombineRecommendJobFilterConditions = JSON.parse(JSON.stringify(rawStaticCombineRecommendJobFilterConditions))
  const map = new Map<string, any>()
  for (const condition of rawStaticCombineRecommendJobFilterConditions ?? []) {    
    const key = getStaticCombineFilterKey(condition)
    map.set(key, condition)
  }
  const conditions = Array.from(map.values())
  const result = conditions.map((condition) => {
    return {
      cityList: condition.city ? [condition.city] : [],
      salaryList: condition.salary ? [condition.salary] : [],
      experienceList: condition.experience ? [condition.experience] : [],
      degreeList: condition.degree ? [condition.degree] : [],
      scaleList: condition.scale ? [condition.scale] : [],
      industryList: condition.industry ? [condition.industry] : []
    }
  })
  if (!result.length) {
    result.push({
      cityList: [],
      salaryList: [],
      experienceList: [],
      degreeList: [],
      scaleList: [],
      industryList: []
    })
  }
  return result
}
