import type { GridConfig } from './types'
import { frameRect } from './geometry'

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function exportFramePng(
  source: CanvasImageSource,
  c: GridConfig,
  col: number,
  row: number,
  filename: string,
): void {
  const r = frameRect(c, col, row)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(r.w))
  canvas.height = Math.max(1, Math.round(r.h))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    source,
    r.x,
    r.y,
    r.w,
    r.h,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, filename)
  }, 'image/png')
}

/** 顺序下载一行所有帧（浏览器可能弹多文件保存确认） */
export function exportRowPngs(
  source: CanvasImageSource,
  c: GridConfig,
  row: number,
  basename: string,
  frameCount: number,
): void {
  const n = Math.max(1, Math.min(frameCount, c.colCount))
  for (let col = 0; col < n; col++) {
    const delay = col * 120
    window.setTimeout(() => {
      const name = `${basename}_r${row}_f${col}.png`
      exportFramePng(source, c, col, row, name)
    }, delay)
  }
}

export function exportManifestJson(
  c: GridConfig,
  imageName: string,
  filename: string,
  rowFrameCounts: readonly number[],
): void {
  const manifest = {
    version: 1,
    image: imageName,
    grid: c,
    rowsAreAnimations: true,
    /** 每行实际帧数，与 `grid.colCount`（网格列上限）配合使用 */
    rowFrameCounts: [...rowFrameCounts],
  }
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, filename)
}
