/** 画布视口：与 SpriteCanvas 中 translate + scale 一致，screen = pan + image * zoom */
export type ViewportState = {
  zoom: number
  panX: number
  panY: number
}

export const VIEW_ZOOM_MIN = 0.05
export const VIEW_ZOOM_MAX = 32

function normalizeWheelDeltaY(e: WheelEvent, viewH: number): number {
  let dy = e.deltaY
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    dy *= 18
  } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    dy *= Math.max(320, viewH)
  }
  return dy
}

function wheelScaleFactor(dy: number): number {
  const sensitivity = 0.00135
  return Math.exp(-sensitivity * dy)
}

/**
 * 以光标 (sx,sy) 为锚缩放：返回新视口；无需变化时返回 null。
 * 必须用「同一帧里的 prev」同时算 zoom 与 pan（函数式 setState），否则会整体漂移。
 */
export function reduceViewportWheel(
  prev: ViewportState,
  sx: number,
  sy: number,
  e: WheelEvent,
  viewH: number,
): ViewportState | null {
  const { zoom: z, panX: px, panY: py } = prev
  const dy = normalizeWheelDeltaY(e, viewH)
  if (dy === 0) return null
  const factor = wheelScaleFactor(dy)
  const nz = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, z * factor))
  if (nz === z) return null
  const ix = (sx - px) / z
  const iy = (sy - py) / z
  // sx = panX + ix * zoom ⇒ 缩放后仍让 (ix,iy) 落在 (sx,sy)：npx = sx - ix * nz
  return {
    zoom: nz,
    panX: sx - ix * nz,
    panY: sy - iy * nz,
  }
}

/**
 * 保持当前 zoom，将贴图中心对齐到视口中心。
 * 变换与画布一致：screen = pan + image * zoom（先 translate 再 scale）。
 */
export function panToCenterImage(
  zoom: number,
  imageW: number,
  imageH: number,
  viewW: number,
  viewH: number,
): { panX: number; panY: number } {
  if (
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    imageW <= 0 ||
    imageH <= 0 ||
    viewW < 1 ||
    viewH < 1
  ) {
    return { panX: 0, panY: 0 }
  }
  const cx = imageW / 2
  const cy = imageH / 2
  return {
    panX: viewW / 2 - cx * zoom,
    panY: viewH / 2 - cy * zoom,
  }
}
