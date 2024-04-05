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

export const parseSalary = (str: string): { low: null | number, high: null | number, month: null | number } => {
  const result = {
    high: null,
    low: null,
    month: null
  }
  if (!str) {
    return result
  }

  const baseMatchResult = str.match(
    /([\.\d]+)-([\.\d]+)k/i
  );
  if (baseMatchResult) {
    const arr = [...baseMatchResult];
    arr.shift();
    Object.assign(
      result,
      {
        low: Number(arr[0]),
        high: Number(arr[1]),
      }
    )
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
