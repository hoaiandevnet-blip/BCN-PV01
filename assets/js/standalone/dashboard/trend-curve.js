// Monotone cubic Hermite interpolation: exact samples, flat extrema, no invented peaks.
export function trendCurve(points, flatTangents = false) {
  const intervals = points.slice(1).map((point, index) => point[0] - points[index][0]);
  const slopes = intervals.map((width, index) => (points[index + 1][1] - points[index][1]) / width);
  const tangents = points.map((point, index) => {
    if (flatTangents) return 0;
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1);
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before * after <= 0) return 0;
    const beforeWeight = 2 * intervals[index] + intervals[index - 1];
    const afterWeight = intervals[index] + 2 * intervals[index - 1];
    return (beforeWeight + afterWeight) / (beforeWeight / before + afterWeight / after);
  });
  const segments = intervals.map((width, index) => {
    const start = points[index];
    const end = points[index + 1];
    const handle = width / 3;
    return `C ${start[0] + handle} ${start[1] + handle * tangents[index]}, `
      + `${end[0] - handle} ${end[1] - handle * tangents[index + 1]}, ${end[0]} ${end[1]}`;
  });
  return `M ${points[0][0]} ${points[0][1]} ${segments.join(' ')}`;
}
