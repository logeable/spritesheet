import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { GridConfig } from '../sprite/types'
import { defaultGrid } from '../sprite/types'
import {
  frameRect,
  gridOverflows,
  inferCellSizeFromGridCounts,
  inferCounts,
} from '../sprite/geometry'
import { normalizeRowFrameCounts } from '../sprite/rowFrames'
import {
  panToCenterImage,
  reduceViewportWheel,
  type ViewportState,
} from '../sprite/viewport'
import {
  exportFramePng,
  exportManifestJson,
  exportRowPngs,
} from '../sprite/export'
import { SpriteCanvas } from './SpriteCanvas'
import './SpriteStudio.css'

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url
}

export default function SpriteStudio() {
  const [file, setFile] = useState<File | null>(null)
  const objectUrl = useObjectUrl(file)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [grid, setGrid] = useState<GridConfig>(defaultGrid)
  const [showGrid, setShowGrid] = useState(true)
  const [selectedCol, setSelectedCol] = useState(0)
  const [selectedRow, setSelectedRow] = useState(0)
  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const { zoom, panX, panY } = viewport
  const [dragOver, setDragOver] = useState(false)
  const [fps, setFps] = useState(12)
  const [playing, setPlaying] = useState(false)
  const [playFrame, setPlayFrame] = useState(0)
  const [rowFrameCounts, setRowFrameCounts] = useState<number[]>([])
  const playRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  const rowFrameCountsRef = useRef(rowFrameCounts)
  const selectedRowRef = useRef(selectedRow)
  rowFrameCountsRef.current = rowFrameCounts
  selectedRowRef.current = selectedRow

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const q = params.get('url')

    const clear = (img: HTMLImageElement) => {
      img.onload = null
      img.onerror = null
    }

    if (file && objectUrl) {
      const img = new Image()
      img.onload = () => {
        if (!cancelled) setImage(img)
      }
      img.onerror = () => {
        if (!cancelled) setImage(null)
      }
      img.src = objectUrl
      return () => {
        cancelled = true
        clear(img)
      }
    }

    if (!file && q) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (!cancelled) setImage(img)
      }
      img.onerror = () => {
        if (!cancelled) setImage(null)
      }
      img.src = q
      return () => {
        cancelled = true
        clear(img)
      }
    }

    setImage(null)
    return () => {
      cancelled = true
    }
  }, [file, objectUrl])

  const imgW = image?.naturalWidth ?? 0
  const imgH = image?.naturalHeight ?? 0

  const overflows = useMemo(
    () => (image ? gridOverflows(grid, imgW, imgH) : false),
    [image, grid, imgW, imgH],
  )

  const setPan = useCallback((x: number, y: number) => {
    setViewport((v) => ({ ...v, panX: x, panY: y }))
  }, [])

  const onWheelZoom = useCallback(
    (e: WheelEvent, sx: number, sy: number, viewH: number) => {
      setViewport((prev) => {
        const next = reduceViewportWheel(prev, sx, sy, e, viewH)
        return next ?? prev
      })
    },
    [],
  )

  const onSelectCell = useCallback((col: number, row: number) => {
    const n =
      rowFrameCountsRef.current[row] ?? grid.colCount
    const cap = Math.max(1, n)
    setSelectedRow(row)
    setSelectedCol(clamp(col, 0, cap - 1))
    setPlayFrame(clamp(col, 0, cap - 1))
  }, [grid.colCount])

  const fitView = useCallback(() => {
    if (!image || !imgW || !imgH) return
    const wrap = document.querySelector('.sprite-canvas-wrap')
    if (!wrap) return
    const rw = wrap.clientWidth
    const rh = wrap.clientHeight
    if (rw < 10 || rh < 10) return
    const pad = 24
    const zx = (rw - pad * 2) / imgW
    const zy = (rh - pad * 2) / imgH
    const z = Math.min(zx, zy, 8)
    setViewport({
      zoom: z,
      panX: (rw - imgW * z) / 2,
      panY: (rh - imgH * z) / 2,
    })
  }, [image, imgW, imgH])

  /** 保持当前缩放，仅把贴图中心移到视口中心 */
  const focusCenter = useCallback(() => {
    if (!image || !imgW || !imgH) return
    const wrap = document.querySelector('.sprite-canvas-wrap')
    if (!wrap) return
    const rw = wrap.clientWidth
    const rh = wrap.clientHeight
    if (rw < 10 || rh < 10) return
    setViewport((v) => ({
      ...v,
      ...panToCenterImage(v.zoom, imgW, imgH, rw, rh),
    }))
  }, [image, imgW, imgH])

  useEffect(() => {
    if (!image) return
    const t = window.setTimeout(fitView, 50)
    return () => window.clearTimeout(t)
  }, [image, fitView])

  useEffect(() => {
    setRowFrameCounts((prev) =>
      normalizeRowFrameCounts(grid.rowCount, grid.colCount, prev),
    )
  }, [grid.rowCount, grid.colCount])

  useEffect(() => {
    setSelectedRow((r) => clamp(r, 0, Math.max(0, grid.rowCount - 1)))
  }, [grid.rowCount])

  useEffect(() => {
    const n = rowFrameCounts[selectedRow] ?? grid.colCount
    const cap = Math.max(1, n)
    setSelectedCol((c) => clamp(c, 0, cap - 1))
    setPlayFrame((f) => clamp(f, 0, cap - 1))
  }, [selectedRow, rowFrameCounts, grid.colCount])

  useEffect(() => {
    if (!playing || !image) {
      if (playRef.current) cancelAnimationFrame(playRef.current)
      playRef.current = null
      return
    }
    const frameMs = 1000 / Math.max(1, fps)
    const loop = (t: number) => {
      if (!lastTickRef.current) lastTickRef.current = t
      if (t - lastTickRef.current >= frameMs) {
        lastTickRef.current = t
        setPlayFrame((f) => {
          const r = selectedRowRef.current
          const n =
            rowFrameCountsRef.current[r] ?? grid.colCount
          return (f + 1) % Math.max(1, n)
        })
      }
      playRef.current = requestAnimationFrame(loop)
    }
    playRef.current = requestAnimationFrame(loop)
    return () => {
      if (playRef.current) cancelAnimationFrame(playRef.current)
    }
  }, [playing, fps, grid.colCount, image])

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = previewCanvasRef.current
    if (!c || !image) return
    const r = frameRect(grid, playFrame, selectedRow)
    c.width = Math.max(1, Math.round(r.w))
    c.height = Math.max(1, Math.round(r.h))
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(
      image,
      r.x,
      r.y,
      r.w,
      r.h,
      0,
      0,
      c.width,
      c.height,
    )
  }, [image, grid, playFrame, selectedRow])

  const inferFromImage = () => {
    if (!image) return
    const { colCount, rowCount } = inferCounts(imgW, imgH, grid)
    setGrid((g) => ({ ...g, colCount, rowCount }))
  }

  const inferCellFromCounts = () => {
    if (!image) return
    const r = inferCellSizeFromGridCounts(imgW, imgH, grid)
    if (!r) return
    setGrid((g) => ({ ...g, cellW: r.cellW, cellH: r.cellH }))
  }

  const onFiles = (list: FileList | null) => {
    const f = list?.[0]
    if (!f) return
    setFile(f)
    setPlaying(false)
    setPlayFrame(0)
  }

  const baseName =
    file?.name.replace(/\.[^.]+$/, '') ?? 'spritesheet'

  return (
    <div className="sprite-studio">
      <header className="sprite-studio__header">
        <div>
          <h1>Spritesheet 工作台</h1>
          <p>
            面向「每行一条动作、横向多帧」的均匀网格：校对尺寸、预览动画、导出单帧或整行
            PNG，并生成 JSON 清单便于引擎接入。
          </p>
        </div>
      </header>

      <div className="sprite-studio__body">
        <aside className="sprite-panel">
          <section>
            <h2>贴图</h2>
            <label
              className={`sprite-drop ${dragOver ? 'sprite-drop--active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                onFiles(e.dataTransfer.files)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/webp,image/png,image/*"
                onChange={(e) => onFiles(e.target.files)}
              />
              <span className="sprite-drop__line">拖拽到此处或点击选择</span>
              <span className="sprite-drop__hint">WebP、PNG 等栅格图</span>
            </label>
            {image && (
              <p className="sprite-muted">
                {file?.name ?? '远程/URL'}
                <br />
                {imgW} × {imgH}px
              </p>
            )}
          </section>

          <section>
            <h2>网格</h2>
            <div className="sprite-grid2">
              <div className="sprite-field">
                <label htmlFor="cw">单元宽</label>
                <input
                  id="cw"
                  type="number"
                  min={1}
                  value={grid.cellW}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      cellW: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="ch">单元高</label>
                <input
                  id="ch"
                  type="number"
                  min={1}
                  value={grid.cellH}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      cellH: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="ox">原点 X</label>
                <input
                  id="ox"
                  type="number"
                  min={0}
                  value={grid.originX}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      originX: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="oy">原点 Y</label>
                <input
                  id="oy"
                  type="number"
                  min={0}
                  value={grid.originY}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      originY: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="gx">列间距</label>
                <input
                  id="gx"
                  type="number"
                  min={0}
                  value={grid.gapX}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      gapX: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="gy">行间距</label>
                <input
                  id="gy"
                  type="number"
                  min={0}
                  value={grid.gapY}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      gapY: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="cols">列数（网格列上限）</label>
                <input
                  id="cols"
                  type="number"
                  min={1}
                  value={grid.colCount}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      colCount: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </div>
              <div className="sprite-field">
                <label htmlFor="rows">行数（动作条数）</label>
                <input
                  id="rows"
                  type="number"
                  min={1}
                  value={grid.rowCount}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      rowCount: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                />
              </div>
            </div>
            <div className="sprite-row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="sprite-btn sprite-btn--primary"
                onClick={inferFromImage}
                disabled={!image}
              >
                按贴图推算行列
              </button>
              <button
                type="button"
                className="sprite-btn"
                onClick={inferCellFromCounts}
                disabled={!image}
                title="用贴图宽高减去原点后，按当前列/行数与间距均分，反推单元宽高（向下取整）"
              >
                按行列推算单元
              </button>
              <button
                type="button"
                className="sprite-btn"
                onClick={fitView}
                disabled={!image}
              >
                适配窗口
              </button>
              <button
                type="button"
                className="sprite-btn"
                onClick={focusCenter}
                disabled={!image}
                title="保持当前缩放，将贴图中心对齐到画布中心"
              >
                聚焦中心
              </button>
            </div>
            {overflows && (
              <p className="sprite-warn">
                部分格子超出贴图边界，请检查原点、间距或行列数。
              </p>
            )}
            <p className="sprite-muted">
              每行实际参与播放/导出的帧数可在下方「播放区域」按行单独设置（可少于列数）。
            </p>
            <p className="sprite-muted">
              「按行列推算单元」：在 (原点→贴图右下) 的可用区域内，把剩余宽度按列数、高度按行数均分（扣除列/行间距），得到单元宽高。
            </p>
          </section>

          <section>
            <h2>导出</h2>
            <div className="sprite-row">
              <button
                type="button"
                className="sprite-btn"
                disabled={!image}
                onClick={() =>
                  image &&
                  exportFramePng(
                    image,
                    grid,
                    selectedCol,
                    selectedRow,
                    `${baseName}_r${selectedRow}_f${selectedCol}.png`,
                  )
                }
              >
                当前帧 PNG
              </button>
              <button
                type="button"
                className="sprite-btn"
                disabled={!image}
                onClick={() =>
                  image &&
                  exportRowPngs(
                    image,
                    grid,
                    selectedRow,
                    baseName,
                    rowFrameCounts[selectedRow] ?? grid.colCount,
                  )
                }
              >
                当前行动画（逐帧）
              </button>
              <button
                type="button"
                className="sprite-btn"
                disabled={!image}
                onClick={() =>
                  exportManifestJson(
                    grid,
                    file?.name ?? 'sheet.webp',
                    `${baseName}_grid.json`,
                    normalizeRowFrameCounts(
                      grid.rowCount,
                      grid.colCount,
                      rowFrameCounts,
                    ),
                  )
                }
              >
                JSON 清单
              </button>
            </div>
            <p className="sprite-muted">
              逐帧导出会短时间连续触发多次下载；可将 `spritesheet.webp` 放到{' '}
              <code>public/</code> 后用 <code>?url=/spritesheet.webp</code>{' '}
              打开。
            </p>
          </section>
        </aside>

        <main className="sprite-main">
          <SpriteCanvas
            image={image}
            grid={grid}
            showGrid={showGrid}
            selectedCol={selectedCol}
            selectedRow={selectedRow}
            onSelectCell={onSelectCell}
            zoom={zoom}
            panX={panX}
            panY={panY}
            setPan={setPan}
            onWheelZoom={onWheelZoom}
          />
          <div className="sprite-toolbar">
            <label className="sprite-check">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              显示网格线
            </label>
            <button
              type="button"
              className="sprite-btn"
              disabled={!image}
              onClick={focusCenter}
              title="保持当前缩放，将贴图中心对齐到画布中心"
            >
              聚焦中心
            </button>
            <span className="sprite-muted">
              缩放 {zoom.toFixed(2)}× · 选中 行 {selectedRow} / 列{' '}
              {selectedCol}
            </span>
          </div>
        </main>

        <section className="sprite-filmstrip">
          <div className="sprite-filmstrip__head">
            <h2>当前行胶片条 · 播放预览</h2>
            <div className="sprite-preview">
              <label className="sprite-field sprite-field--row-frames">
                <span>当前行帧数</span>
                <input
                  id="row-frame-count"
                  type="number"
                  min={1}
                  max={grid.colCount}
                  disabled={!image}
                  value={rowFrameCounts[selectedRow] ?? grid.colCount}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    const v = clamp(
                      Math.round(Number.isFinite(raw) ? raw : grid.colCount),
                      1,
                      grid.colCount,
                    )
                    setRowFrameCounts((arr) => {
                      const base = normalizeRowFrameCounts(
                        grid.rowCount,
                        grid.colCount,
                        arr,
                      )
                      const next = [...base]
                      next[selectedRow] = v
                      return next
                    })
                  }}
                />
              </label>
              <label className="sprite-field">
                <span>FPS</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={fps}
                  onChange={(e) =>
                    setFps(clamp(Number(e.target.value) || 12, 1, 60))
                  }
                />
              </label>
              <div className="sprite-preview-col">
                <div className="sprite-preview-box">
                  {image ? (
                    <canvas ref={previewCanvasRef} />
                  ) : (
                    <span className="sprite-muted">无贴图</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`sprite-btn ${playing ? 'sprite-btn--primary' : ''}`}
                  disabled={!image}
                  tabIndex={image ? 0 : -1}
                  onClick={() => setPlaying((p) => !p)}
                  title={playing ? '暂停预览' : '播放预览'}
                >
                  {playing ? '暂停' : '播放'}
                </button>
              </div>
            </div>
          </div>
          <FilmstripRow
            image={image}
            grid={grid}
            row={selectedRow}
            frameCount={rowFrameCounts[selectedRow] ?? grid.colCount}
            activeCol={playing ? playFrame : selectedCol}
            onPick={(col) => {
              setSelectedCol(col)
              setPlayFrame(col)
              setPlaying(false)
            }}
          />
        </section>
      </div>
    </div>
  )
}

function FilmstripRow({
  image,
  grid,
  row,
  frameCount,
  activeCol,
  onPick,
}: {
  image: HTMLImageElement | null
  grid: GridConfig
  row: number
  frameCount: number
  activeCol: number
  onPick: (col: number) => void
}) {
  if (!image) {
    return <p className="sprite-muted">加载贴图后显示该行所有帧缩略图。</p>
  }
  const n = Math.max(1, frameCount)
  return (
    <div className="sprite-filmstrip__frames">
      {Array.from({ length: n }, (_, col) => (
        <ThumbCell
          key={col}
          image={image}
          grid={grid}
          col={col}
          row={row}
          on={col === activeCol}
          onClick={() => onPick(col)}
        />
      ))}
    </div>
  )
}

function ThumbCell({
  image,
  grid,
  col,
  row,
  on,
  onClick,
}: {
  image: HTMLImageElement
  grid: GridConfig
  col: number
  row: number
  on: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const r = frameRect(grid, col, row)
    c.width = Math.max(1, Math.round(r.w))
    c.height = Math.max(1, Math.round(r.h))
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      image,
      r.x,
      r.y,
      r.w,
      r.h,
      0,
      0,
      c.width,
      c.height,
    )
  }, [image, grid, col, row])

  return (
    <button
      type="button"
      className={`sprite-thumb ${on ? 'sprite-thumb--on' : ''}`}
      title={`帧 ${col}`}
      onClick={onClick}
    >
      <canvas ref={ref} />
    </button>
  )
}
