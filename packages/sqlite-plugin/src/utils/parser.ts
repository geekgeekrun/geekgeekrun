export const parseCompanyScale = (str: string): [number| null, number | null] => {
  if (!str) {
    return [null, null]
  }

  const betweenRangeMatchResult = str.match(
    /(\d+)-(\d+)人/
  );
  if (betweenRangeMatchResult) {
    const arr = [...betweenRangeMatchResult];
    arr.shift();
    return arr.map(Number) as [number, number]
  }

  const gtRangeMatchResult = str.match(
    /(\d+)人以上/
  );
  if (gtRangeMatchResult) {
    const arr = [...gtRangeMatchResult];
    arr.shift();
    return [Number(arr[0]), null]
  }

  return [null, null]
}

export function formatCompanyScale(low, high) {
  if (low === null && high === null) {
    return ''
  }
  if (low === null && high !== null) {
    return `${high}人以下`
  }
  if (low !== null && high === null) {
    return `${low}人以上`
  }
  return `${low}-${high}人`
}

export const parseSalary = (str: string): {
  low: null | number,
  high: null | number,
  month: null | number,
  unit: 'month' | 'day' | 'hour' | 'negotiable' | 'unknown'
} => {
  const result = {
    high: null,
    low: null,
    month: null,
    unit: 'unknown' as 'month' | 'day' | 'hour' | 'negotiable' | 'unknown'
  }
  if (!str) {
    return result
  }

  const baseMatchResult = str.match(
    /([\.\d]+)\s*-\s*([\.\d]+)\s*k/i
  );
  if (baseMatchResult) {
    const arr = [...baseMatchResult];
    arr.shift();
    Object.assign(
      result,
      {
        low: Number(arr[0]),
        high: Number(arr[1]),
        unit: 'month'
      }
    )
  }

  const dailyMatchResult = str.match(/([\.\d]+)(?:\s*-\s*([\.\d]+))?\s*(?:元)?\s*\/?\s*(?:天|日)/)
  if (dailyMatchResult) {
    const low = Number(dailyMatchResult[1])
    Object.assign(result, {
      low,
      high: Number(dailyMatchResult[2] ?? low),
      unit: 'day'
    })
  }

  const hourlyMatchResult = str.match(/([\.\d]+)(?:\s*-\s*([\.\d]+))?\s*(?:元)?\s*\/?\s*(?:小时|时)/)
  if (hourlyMatchResult) {
    const low = Number(hourlyMatchResult[1])
    Object.assign(result, {
      low,
      high: Number(hourlyMatchResult[2] ?? low),
      unit: 'hour'
    })
  }

  if (result.unit === 'unknown' && /面议|薪资面议|待遇面议|实习补贴/.test(str)) {
    result.unit = 'negotiable'
  }

  const month = str.match(
    /([\.\d]+)薪/
  )
  if (month) {
    const arr = [...month];
    arr.shift();
    Object.assign(
      result,
      {
        month: Number(arr[0])
      }
    )
  }

  return result
}
