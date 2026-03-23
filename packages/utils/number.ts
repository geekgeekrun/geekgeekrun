export type Interval = [number | null | undefined, number | null | undefined]

export function hasIntersection(interval1: Interval, interval2: Interval): boolean {
  const normalizeInterval = (interval: Interval): [number, number] => {
    const [start, end] = interval
    return [
      [null, undefined].includes(start) ? -Infinity : start!,
      [null, undefined].includes(end) ? Infinity : end!
    ]
  }

  const [norm1Start, norm1End] = normalizeInterval(interval1)
  const [norm2Start, norm2End] = normalizeInterval(interval2)

  return Math.max(norm1Start, norm2Start) <= Math.min(norm1End, norm2End)
}
