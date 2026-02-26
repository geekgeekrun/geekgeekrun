export function hasIntersection(interval1, interval2) {
    // 通用函数：将区间标准化，null转换为对应的无穷大
    const normalizeInterval = (interval) => {
        const [start, end] = interval;
        return [
            [null, undefined].includes(start) ? -Infinity : start,
            [null, undefined].includes(end) ? Infinity : end
        ];
    };
    
    const [norm1Start, norm1End] = normalizeInterval(interval1);
    const [norm2Start, norm2End] = normalizeInterval(interval2);
    
    // 判断交集
    return Math.max(norm1Start, norm2Start) <= Math.min(norm1End, norm2End);
}