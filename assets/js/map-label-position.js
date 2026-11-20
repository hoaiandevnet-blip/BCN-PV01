(function () {
  'use strict';

  const MAX_CELLS = 4096;
  const PRECISION_DIVISOR = 256;

  function ringArea(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    if (ring.some(point => !Array.isArray(point) || point.length < 2
      || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null;
    const origin = ring[0];
    const last = ring[ring.length - 1];
    if (origin[0] !== last[0] || origin[1] !== last[1]) return null;
    let area = 0;
    for (let index = 1; index < ring.length; index += 1) {
      const previous = ring[index - 1];
      const current = ring[index];
      area += (previous[0] - origin[0]) * (current[1] - origin[1])
        - (current[0] - origin[0]) * (previous[1] - origin[1]);
    }
    return Number.isFinite(area) && area !== 0 ? Math.abs(area) / 2 : null;
  }

  function polygonArea(polygon) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    const areas = polygon.map(ringArea);
    if (areas.some(area => area === null)) return null;
    const area = areas[0] - areas.slice(1).reduce((sum, hole) => sum + hole, 0);
    return area > 0 && Number.isFinite(area) ? area : null;
  }

  function segmentDistanceSquared(x, y, first, second) {
    let nearestX = first[0];
    let nearestY = first[1];
    const dx = second[0] - nearestX;
    const dy = second[1] - nearestY;
    const length = dx * dx + dy * dy;
    if (length > 0) {
      const fraction = Math.max(0, Math.min(1, ((x - nearestX) * dx + (y - nearestY) * dy) / length));
      nearestX += fraction * dx;
      nearestY += fraction * dy;
    }
    return (x - nearestX) ** 2 + (y - nearestY) ** 2;
  }

  function distance(x, y, polygon) {
    let insideOuter = false;
    let insideHole = false;
    let minimum = Infinity;
    polygon.forEach((ring, ringIndex) => {
      let inside = false;
      for (let index = 1; index < ring.length; index += 1) {
        const first = ring[index - 1];
        const second = ring[index];
        if ((first[1] > y) !== (second[1] > y)
          && x < (second[0] - first[0]) * (y - first[1]) / (second[1] - first[1]) + first[0]) {
          inside = !inside;
        }
        minimum = Math.min(minimum, segmentDistanceSquared(x, y, first, second));
      }
      if (ringIndex === 0) insideOuter = inside;
      else if (inside) insideHole = true;
    });
    return (insideOuter && !insideHole ? 1 : -1) * Math.sqrt(minimum);
  }

  function cell(x, y, half, polygon) {
    const clearance = distance(x, y, polygon);
    return { x, y, half, clearance, maximum: clearance + half * Math.SQRT2 };
  }

  function push(queue, value) {
    let index = queue.length;
    queue.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent].maximum >= value.maximum) break;
      queue[index] = queue[parent];
      index = parent;
    }
    queue[index] = value;
  }

  function pop(queue) {
    const result = queue[0];
    const last = queue.pop();
    if (queue.length === 0) return result;
    let index = 0;
    while (index * 2 + 1 < queue.length) {
      let child = index * 2 + 1;
      if (child + 1 < queue.length && queue[child + 1].maximum > queue[child].maximum) child += 1;
      if (queue[child].maximum <= last.maximum) break;
      queue[index] = queue[child];
      index = child;
    }
    queue[index] = last;
    return result;
  }

  // A scanline between vertex heights seeds an interior point even for very thin polygons.
  function interiorSeed(polygon, centerY) {
    const heights = [...new Set(polygon.flatMap(ring => ring.map(point => point[1])))];
    heights.sort((first, second) => first - second);
    let lower = 0;
    while (lower + 2 < heights.length && heights[lower + 1] < centerY) lower += 1;
    const y = heights[lower] + (heights[lower + 1] - heights[lower]) / 2;
    const crossings = [];
    polygon.forEach(ring => {
      for (let index = 1; index < ring.length; index += 1) {
        const first = ring[index - 1];
        const second = ring[index];
        if ((first[1] > y) !== (second[1] > y)) {
          crossings.push(first[0] + (y - first[1]) * (second[0] - first[0]) / (second[1] - first[1]));
        }
      }
    });
    crossings.sort((first, second) => first - second);
    let best = null;
    for (let index = 1; index < crossings.length; index += 1) {
      const x = crossings[index - 1] + (crossings[index] - crossings[index - 1]) / 2;
      const candidate = cell(x, y, 0, polygon);
      if (candidate.clearance > 0 && (!best || candidate.clearance > best.clearance)) best = candidate;
    }
    return best;
  }

  function labelPoint(polygon) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    polygon[0].forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    const width = maxX - minX;
    const height = maxY - minY;
    const size = Math.max(width, height);
    if (!Number.isFinite(size) || width <= 0 || height <= 0) return null;
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    let best = cell(centerX, centerY, 0, polygon);
    const seed = interiorSeed(polygon, centerY);
    if (seed && seed.clearance > best.clearance) best = seed;
    const queue = [cell(centerX, centerY, size / 2, polygon)];
    const precision = size / PRECISION_DIVISOR;
    let visits = 0;
    while (queue.length > 0 && visits < MAX_CELLS) {
      const current = pop(queue);
      visits += 1;
      if (current.clearance > best.clearance) best = current;
      if (current.maximum - best.clearance <= precision) continue;
      const half = current.half / 2;
      if (half === 0 || current.x + half === current.x || current.y + half === current.y) continue;
      for (const dx of [-half, half]) {
        for (const dy of [-half, half]) push(queue, cell(current.x + dx, current.y + dy, half, polygon));
      }
    }
    return best.clearance > 0 && Number.isFinite(best.x) && Number.isFinite(best.y) ? [best.y, best.x] : null;
  }

  function getLabelPoint(feature) {
    const geometry = feature && feature.type === 'Feature' && feature.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) return null;
    let polygons;
    if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
    else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
    else return null;
    let largest = null;
    let largestArea = 0;
    polygons.forEach(polygon => {
      const area = polygonArea(polygon);
      if (area !== null && area > largestArea) {
        largest = polygon;
        largestArea = area;
      }
    });
    return largest ? labelPoint(largest) : null;
  }

  window.MapLabelPosition = Object.freeze({ getLabelPoint });
}());
