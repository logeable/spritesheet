import type { GridConfig } from './types'

export function strideX(c: GridConfig): number {
  return c.cellW + c.gapX
}

export function strideY(c: GridConfig): number {
  return c.cellH + c.gapY
}

export type FrameRect = { x: number; y: number; w: number; h: number }

export function frameRect(c: GridConfig, col: number, row: number): FrameRect {
  return {
    x: c.originX + col * strideX(c),
    y: c.originY + row * strideY(c),
    w: c.cellW,
    h: c.cellH,
  }
}

/**
 * 根据贴图尺寸、原点、间距与行列数，反推单元格宽高（均分原点右下至贴图右下之间的区域）。
 *
 * 与 `frameRect` 一致：第 `colCount-1` 列右缘为
 * `originX + (colCount-1)*(cellW+gapX) + cellW = originX + colCount*cellW + (colCount-1)*gapX`，
 * 令其不超过贴图宽度，取整格向下取整以免越界。
 */
export function inferCellSizeFromGridCounts(
  imgW: number,
  imgH: number,
  c: Pick<
    GridConfig,
    'originX' | 'originY' | 'gapX' | 'gapY' | 'colCount' | 'rowCount'
  >,
): { cellW: number; cellH: number } | null {
  const { originX, originY, gapX, gapY, colCount, rowCount } = c
  if (
    colCount < 1 ||
    rowCount < 1 ||
    imgW <= 0 ||
    imgH <= 0 ||
    !Number.isFinite(originX) ||
    !Number.isFinite(originY)
  ) {
    return null
  }
  const availW = imgW - originX
  const availH = imgH - originY
  if (availW <= 0 || availH <= 0) return null
  const rawW = (availW - (colCount - 1) * gapX) / colCount
  const rawH = (availH - (rowCount - 1) * gapY) / rowCount
  if (
    !Number.isFinite(rawW) ||
    !Number.isFinite(rawH) ||
    rawW < 1 ||
    rawH < 1
  ) {
    return null
  }
  return {
    cellW: Math.max(1, Math.floor(rawW)),
    cellH: Math.max(1, Math.floor(rawH)),
  }
}

/** 根据贴图尺寸推算可容纳的行列数（不修改 origin / cell / gap） */
export function inferCounts(
  imgW: number,
  imgH: number,
  c: Pick<
    GridConfig,
    'originX' | 'originY' | 'cellW' | 'cellH' | 'gapX' | 'gapY'
  >,
): { colCount: number; rowCount: number } {
  const sx = strideX(c as GridConfig)
  const sy = strideY(c as GridConfig)
  const colCount =
    sx > 0
      ? Math.max(1, Math.floor((imgW - c.originX + c.gapX) / sx))
      : 1
  const rowCount =
    sy > 0
      ? Math.max(1, Math.floor((imgH - c.originY + c.gapY) / sy))
      : 1
  return { colCount, rowCount }
}

export function rectInsideImage(
  r: FrameRect,
  imgW: number,
  imgH: number,
): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= imgW && r.y + r.h <= imgH
}

/** 是否存在任意一帧超出贴图 */
export function gridOverflows(
  c: GridConfig,
  imgW: number,
  imgH: number,
): boolean {
  for (let row = 0; row < c.rowCount; row++) {
    for (let col = 0; col < c.colCount; col++) {
      if (!rectInsideImage(frameRect(c, col, row), imgW, imgH)) return true
    }
  }
  return false
}
