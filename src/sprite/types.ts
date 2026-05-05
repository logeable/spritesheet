/** 均匀网格：每行一条动画序列，从左到右为帧 */
export type GridConfig = {
  originX: number
  originY: number
  cellW: number
  cellH: number
  gapX: number
  gapY: number
  colCount: number
  rowCount: number
}

export const defaultGrid = (): GridConfig => ({
  originX: 0,
  originY: 0,
  cellW: 64,
  cellH: 64,
  gapX: 0,
  gapY: 0,
  colCount: 8,
  rowCount: 4,
})
