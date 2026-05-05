import { useCallback, useEffect, useRef } from 'react'
import type { GridConfig } from '../sprite/types'
import { frameRect, strideX, strideY } from '../sprite/geometry'

type Props = {
  image: HTMLImageElement | null
  grid: GridConfig
  showGrid: boolean
  selectedCol: number
  selectedRow: number
  onSelectCell: (col: number, row: number) => void
  zoom: number
  panX: number
  panY: number
  setPan: (x: number, y: number) => void
  /** 滚轮缩放：由父组件用函数式 setState 同时提交 zoom+pan，避免锚点漂移 */
  onWheelZoom: (
    e: WheelEvent,
    localX: number,
    localY: number,
    viewHeight: number,
  ) => void
}

export function SpriteCanvas({
  image,
  grid,
  showGrid,
  selectedCol,
  selectedRow,
  onSelectCell,
  zoom,
  panX,
  panY,
  setPan,
  onWheelZoom,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    mode: 'pan' | 'none'
    pointerId: number
    /** MouseEvent.buttons：左键 1，中键 4 */
    buttonsMask: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  const screenToImage = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - panX) / zoom,
      y: (sy - panY) / zoom,
    }),
    [zoom, panX, panY],
  )

  const pickCell = useCallback(
    (ix: number, iy: number) => {
      const sx = strideX(grid)
      const sy = strideY(grid)
      if (sx <= 0 || sy <= 0) return
      const lx = ix - grid.originX
      const ly = iy - grid.originY
      if (lx < 0 || ly < 0) return
      const col = Math.floor(lx / sx)
      const row = Math.floor(ly / sy)
      if (
        col >= 0 &&
        col < grid.colCount &&
        row >= 0 &&
        row < grid.rowCount
      ) {
        onSelectCell(col, row)
      }
    },
    [grid, onSelectCell],
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    canvas.width = Math.max(1, Math.floor(w * dpr))
    canvas.height = Math.max(1, Math.floor(h * dpr))
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    const bg =
      getComputedStyle(wrap).getPropertyValue('--canvas-bg').trim() ||
      '#0d0e12'
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    if (!image || !image.naturalWidth) return

    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)
    ctx.drawImage(image, 0, 0)

    if (showGrid) {
      const sx = strideX(grid)
      const sy = strideY(grid)
      if (sx > 0 && sy > 0) {
        const ox = grid.originX
        const oy = grid.originY
        const imgW = image.naturalWidth
        const imgH = image.naturalHeight
        const yTop = 0
        const yBot = imgH
        const xLeft = 0
        const xRight = imgW
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
        ctx.lineWidth = 1 / zoom
        ctx.lineJoin = 'miter'
        ctx.beginPath()
        for (let c = 0; c <= grid.colCount; c++) {
          const x = ox + c * sx
          ctx.moveTo(x, yTop)
          ctx.lineTo(x, yBot)
        }
        for (let r = 0; r <= grid.rowCount; r++) {
          const y = oy + r * sy
          ctx.moveTo(xLeft, y)
          ctx.lineTo(xRight, y)
        }
        ctx.stroke()
      }
    }

    const sel = frameRect(grid, selectedCol, selectedRow)
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.95)'
    ctx.lineWidth = 2 / zoom
    ctx.strokeRect(sel.x + 0.5 / zoom, sel.y + 0.5 / zoom, sel.w, sel.h)

    ctx.restore()
  }, [
    image,
    grid,
    showGrid,
    selectedCol,
    selectedRow,
    zoom,
    panX,
    panY,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    const ro = new ResizeObserver(() => redraw())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [redraw])

  useEffect(() => {
    if (!image) return
    const done = () => redraw()
    if (image.complete) done()
    else image.addEventListener('load', done)
    return () => image.removeEventListener('load', done)
  }, [image, redraw])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      if (!image?.naturalWidth) return
      const rect = wrap.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      onWheelZoom(e, sx, sy, rect.height)
    }
    wrap.addEventListener('wheel', onWheelNative, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheelNative)
  }, [image, onWheelZoom])

  const endDrag = () => {
    dragRef.current = null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const middleDown = e.button === 1 || (e.buttons & 4) !== 0
    const panning = middleDown || e.altKey
    if (panning) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      const rect = wrap.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      dragRef.current = {
        mode: 'pan',
        pointerId: e.pointerId,
        buttonsMask: middleDown ? 4 : 1,
        startX: sx,
        startY: sy,
        startPanX: panX,
        startPanY: panY,
      }
      return
    }
    if (e.button !== 0) return
    canvas.setPointerCapture(e.pointerId)
    const rect = wrap.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    dragRef.current = {
      mode: 'none',
      pointerId: e.pointerId,
      buttonsMask: 1,
      startX: sx,
      startY: sy,
      startPanX: panX,
      startPanY: panY,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const wrap = wrapRef.current
    if (!d || !wrap) return
    if (e.pointerId !== d.pointerId) return
    const rect = wrap.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    if (d.mode === 'pan') {
      if ((e.buttons & d.buttonsMask) === 0) {
        endDrag()
        try {
          canvasRef.current?.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        return
      }
      setPan(d.startPanX + sx - d.startX, d.startPanY + sy - d.startY)
      return
    }
    if ((e.buttons & 1) === 0) {
      endDrag()
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      return
    }
    const dx = sx - d.startX
    const dy = sy - d.startY
    if (d.mode === 'none' && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      d.mode = 'pan'
      d.buttonsMask = 1
      setPan(d.startPanX + dx, d.startPanY + dy)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    const wrap = wrapRef.current
    if (d && e.pointerId !== d.pointerId) return
    dragRef.current = null
    if (!d || !wrap) return
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const rect = wrap.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    if (d.mode === 'none' && e.button === 0) {
      const { x, y } = screenToImage(sx, sy)
      pickCell(x, y)
    }
  }

  const onLostPointerCapture = () => {
    endDrag()
  }

  return (
    <div ref={wrapRef} className="sprite-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="sprite-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onLostPointerCapture}
        onLostPointerCapture={onLostPointerCapture}
      />
      <p className="sprite-canvas-hint">
        滚轮缩放 · 左键点选格子 · 拖拽或中键 / Alt+拖拽平移
      </p>
    </div>
  )
}
