import { useRef, useState, useCallback, useEffect } from 'react'
import { Modal, Button, Slider, Group, Text, Stack } from '@mantine/core'

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTPUT_SIZE  = 256
const PREVIEW_SIZE = 240  // display size of the crop window in pixels

// ── Component ─────────────────────────────────────────────────────────────────

interface PortraitCropModalProps {
  opened:   boolean
  imageUrl: string         // object URL or data URL of the source image
  onConfirm: (dataUrl: string) => void
  onClose:   () => void
}

export function PortraitCropModal({ opened, imageUrl, onConfirm, onClose }: PortraitCropModalProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imageRef   = useRef<HTMLImageElement | null>(null)

  // Pan offset: (offsetX, offsetY) = top-left of the crop square in image pixels
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [zoom,    setZoom]    = useState(1)   // 1 = fit to square, up to 3

  // Natural image dimensions
  const [imgW, setImgW] = useState(1)
  const [imgH, setImgH] = useState(1)

  // Drag state (not React state to avoid re-renders during drag)
  const dragging   = useRef(false)
  const dragStart  = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  // ── Load image ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!opened || !imageUrl) return
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      setImgW(img.naturalWidth)
      setImgH(img.naturalHeight)
      // Center the initial crop
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      setZoom(1)
      setOffsetX((img.naturalWidth  - side) / 2)
      setOffsetY((img.naturalHeight - side) / 2)
    }
    img.src = imageUrl
  }, [opened, imageUrl])

  // ── Draw preview ────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imageRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)

    // Crop square side in image pixels (zoom > 1 = show fewer pixels = zoom in)
    const cropSide = Math.min(imgW, imgH) / zoom
    const sx = Math.max(0, Math.min(offsetX, imgW - cropSide))
    const sy = Math.max(0, Math.min(offsetY, imgH - cropSide))

    // Draw with rounded rect clip
    ctx.save()
    const r = PREVIEW_SIZE * 0.06   // ~6% radius
    ctx.beginPath()
    ctx.roundRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE, r)
    ctx.clip()
    ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    ctx.restore()

    // Border ring
    ctx.save()
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.6)'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.roundRect(1, 1, PREVIEW_SIZE - 2, PREVIEW_SIZE - 2, r)
    ctx.stroke()
    ctx.restore()
  }, [offsetX, offsetY, zoom, imgW, imgH])

  useEffect(() => { draw() }, [draw])

  // ── Drag to pan ─────────────────────────────────────────────────────────────

  const cropSide = () => Math.min(imgW, imgH) / zoom

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offsetX, oy: offsetY }
    e.preventDefault()
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    const { mx, my, ox, oy } = dragStart.current
    // Canvas pixels → image pixels ratio
    const ratio = cropSide() / PREVIEW_SIZE
    const newOx = ox - (e.clientX - mx) * ratio
    const newOy = oy - (e.clientY - my) * ratio
    const side  = cropSide()
    setOffsetX(Math.max(0, Math.min(newOx, imgW - side)))
    setOffsetY(Math.max(0, Math.min(newOy, imgH - side)))
  }

  function onMouseUp() { dragging.current = false }

  // ── Confirm: render to 256×256 output canvas ────────────────────────────────

  function handleConfirm() {
    const img = imageRef.current
    if (!img) return
    const out = document.createElement('canvas')
    out.width  = OUTPUT_SIZE
    out.height = OUTPUT_SIZE
    const ctx  = out.getContext('2d')!
    const side = cropSide()
    const sx   = Math.max(0, Math.min(offsetX, imgW - side))
    const sy   = Math.max(0, Math.min(offsetY, imgH - side))

    // Round-rect clip on output (matches token shape)
    const r = OUTPUT_SIZE * 0.06
    ctx.beginPath()
    ctx.roundRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE, r)
    ctx.clip()
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    onConfirm(out.toDataURL('image/png'))
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Crop portrait"
      centered
      size="xs"
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">Drag to pan · Use slider to zoom</Text>

        {/* Crop preview canvas */}
        <canvas
          ref={canvasRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          style={{
            display: 'block',
            width:   PREVIEW_SIZE,
            height:  PREVIEW_SIZE,
            cursor:  'grab',
            borderRadius: 6,
            userSelect: 'none',
            margin: '0 auto'
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        <Stack gap={4}>
          <Text size="xs" c="dimmed">Zoom</Text>
          <Slider
            min={1} max={4} step={0.05}
            value={zoom}
            onChange={(v) => {
              setZoom(v)
              // Keep crop centered when zooming
              const newSide = Math.min(imgW, imgH) / v
              const oldSide = cropSide()
              setOffsetX((ox) => Math.max(0, Math.min(ox + (oldSide - newSide) / 2, imgW - newSide)))
              setOffsetY((oy) => Math.max(0, Math.min(oy + (oldSide - newSide) / 2, imgH - newSide)))
            }}
            color="teal"
          />
        </Stack>

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          <Button color="teal" onClick={handleConfirm}>Use this crop</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
