/**
 * Compact world city table for the data_globe preset (cat16).
 * Derived from the motion-launch-videos motion-globe world dataset (Natural
 * Earth, public domain); only the busiest hubs are kept so the preset source
 * stays small. Fields: [name, lat, lon, value].
 */
export type WorldCity = [name: string, lat: number, lon: number, value: number];

export const WORLD_CITIES: WorldCity[] = [
  ["San Francisco", 37.77, -122.42, 92],
  ["New York", 40.71, -74.01, 88],
  ["London", 51.51, -0.13, 84],
  ["Berlin", 52.52, 13.4, 71],
  ["Paris", 48.86, 2.35, 69],
  ["Madrid", 40.42, -3.7, 58],
  ["Stockholm", 59.33, 18.07, 44],
  ["Lisbon", 38.72, -9.14, 39],
  ["Lagos", 6.52, 3.38, 47],
  ["Nairobi", -1.29, 36.82, 52],
  ["Dubai", 25.2, 55.27, 66],
  ["Mumbai", 19.08, 72.88, 79],
  ["Singapore", 1.35, 103.82, 81],
  ["Tokyo", 35.68, 139.69, 90],
  ["Seoul", 37.57, 126.98, 76],
  ["Shanghai", 31.23, 121.47, 87],
  ["Sydney", -33.87, 151.21, 63],
  ["São Paulo", -23.55, -46.63, 74],
  ["Mexico City", 19.43, -99.13, 61],
  ["Toronto", 43.65, -79.38, 57],
  ["Reykjavík", 64.15, -21.94, 28],
  ["Cape Town", -33.92, 18.42, 41],
];

/** Arc routes used by data_globe: [fromIndex, toIndex, value]. */
export const WORLD_ARCS: Array<[number, number, number]> = [
  [0, 13, 88],
  [1, 2, 76],
  [15, 4, 64],
  [16, 12, 58],
  [17, 3, 52],
  [10, 11, 61],
  [13, 12, 49],
  [19, 1, 43],
  [8, 2, 37],
];
