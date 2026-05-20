export function getFixationRadiusPx(
  distance: number,
  diameter: number,
  hres: number,
  vres: number,
  alpha: number
): number {
  const a = (alpha * Math.PI) / 180;
  const pixelSizeMm = (diameter * Math.sin(Math.atan(vres / hres)) * 25.4) / vres;
  const p = (distance * Math.tan(a)) / pixelSizeMm;
  return Math.round(p * 100) / 100;
}