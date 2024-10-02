//# region get all combinations
export function* combineFiltersWithConstraintsGenerator(selectedFilters) {
  const {
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  // 使用迭代生成组合
  function combine(arr, min, max) {
    const result = []
    const n = arr.length

    // 生成长度在[min, max]范围内的所有组合
    for (let r = min; r <= Math.min(max, n); r++) {
      const indices = Array(r)
        .fill(0)
        .map((_, i) => i) // 初始化索引
      result.push(indices.map((i) => arr[i])) // 保存初始组合

      while (true) {
        let i = r - 1

        // 从后往前找第一个未到达上界的索引
        while (i >= 0 && indices[i] === i + n - r) {
          i--
        }

        // 没有更多组合时退出
        if (i < 0) break

        indices[i]++

        // 更新接下来的所有索引
        for (let j = i + 1; j < r; j++) {
          indices[j] = indices[j - 1] + 1
        }

        result.push(indices.map((j) => arr[j]))
      }
    }

    return result
  }

  // 生成符合限制条件的组合
  const salaryComb = combine(salaryList, 0, 1) // Salary: 0-1 个
  const experienceComb = combine(experienceList, 0, experienceList.length) // Experience: 0 个或更多
  const degreeComb = combine(degreeList, 0, degreeList.length) // Degree: 0 个或更多
  const scaleComb = combine(scaleList, 0, scaleList.length) // Scale: 0 个或更多
  const industryComb = combine(industryList, 0, 3) // Industry: 0-3 个

  // 通过迭代生成所有组合，代替递归
  for (const salary of salaryComb) {
    for (const experience of experienceComb) {
      for (const degree of degreeComb) {
        for (const scale of scaleComb) {
          for (const industry of industryComb) {
            yield {
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
//#endregion

//#region get count of combinations
// 计算从 n 个元素中选 r 个的组合数 C(n, r)
function combination(n, r) {
  if (r > n) return 0
  let numerator = 1,
    denominator = 1
  for (let i = 0; i < r; i++) {
    numerator *= n - i
    denominator *= i + 1
  }
  return numerator / denominator
}

// 计算符合限制条件的组合数量
function calculateCombinationCount(arrLength, min, max) {
  let totalCombinations = 0
  for (let i = min; i <= Math.min(max, arrLength); i++) {
    totalCombinations += combination(arrLength, i)
  }
  return totalCombinations
}

export function calculateTotalCombinations(selectedFilters) {
  const {
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  // 计算每个条件的组合数量
  const salaryCombCount = calculateCombinationCount(salaryList.length, 0, 1) // Salary: 0-1 个
  const experienceCombCount = calculateCombinationCount(
    experienceList.length,
    0,
    experienceList.length
  ) // Experience: 0 个或更多
  const degreeCombCount = calculateCombinationCount(degreeList.length, 0, degreeList.length) // Degree: 0 个或更多
  const scaleCombCount = calculateCombinationCount(scaleList.length, 0, scaleList.length) // Scale: 0 个或更多
  const industryCombCount = calculateCombinationCount(industryList.length, 0, 3) // Industry: 0-3 个

  // 总组合数是每个条件的组合数量的乘积
  const totalCombinations =
    salaryCombCount * experienceCombCount * degreeCombCount * scaleCombCount * industryCombCount

  return totalCombinations
}
//#endregion
