/** 每行实际参与播放/导出的帧数，不超过网格列数 */

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

/**
 * 与 grid.rowCount / grid.colCount 同步：多出的行默认 colCount，列数变化时把每行帧数压到 [1, colCount]。
 */
export function normalizeRowFrameCounts(
  rowCount: number,
  colCount: number,
  prev: readonly number[],
): number[] {
  const maxCol = Math.max(1, colCount)
  const next: number[] = []
  for (let r = 0; r < rowCount; r++) {
    const raw = prev[r]
    const base =
      raw != null && Number.isFinite(raw) && raw >= 1 ? raw : maxCol
    next.push(clampInt(base, 1, maxCol))
  }
  return next
}
