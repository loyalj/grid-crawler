import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Modal, Stack, Text, Group, Button, TextInput, Textarea, NumberInput,
  UnstyledButton, Slider, ColorInput, Combobox, InputBase, useCombobox
} from '@mantine/core'
import { nanoid } from 'nanoid'
import { ObjectDefinition, TokenDefinition, PropDefinition, ObjectProperty } from '../types/map'
import { CatalogSnapshot } from './types'
import classes from './NewObjectWizard.module.css'

const api = window.catalogAPI!

const STEPS = ['Kind', 'Details', 'Visual', 'Properties'] as const
type Step = 0 | 1 | 2 | 3

interface Props {
  snapshot:  CatalogSnapshot
  onCreated: (id: string) => void
  onClose:   () => void
}

export function NewObjectWizard({ snapshot, onCreated, onClose }: Props) {
  const [step, setStep] = useState<Step>(0)

  // Step 1: Kind
  const [kind, setKind] = useState<'token' | 'prop' | null>(null)

  // Step 2: Details
  const [name,        setName]        = useState('')
  const [category,    setCategory]    = useState('')
  const [description, setDescription] = useState('')
  const [gridW,       setGridW]       = useState(1)
  const [gridH,       setGridH]       = useState(1)

  // Step 3: Visual — token
  const [bgColor,      setBgColor]      = useState('#1c3d5a')
  const [fgColor,      setFgColor]      = useState('#7ee8fa')
  const [borderColor,  setBorderColor]  = useState('#4db8d6')
  const [iconContent,  setIconContent]  = useState('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>')
  const [iconName,     setIconName]     = useState('')

  // Step 3: Visual — prop
  const [textureSrc,   setTextureSrc]   = useState<string | null>(null)
  const [cropDone,     setCropDone]     = useState(false)
  const [textureDataUrl, setTextureDataUrl] = useState<string | null>(null)

  // Step 4: Properties
  const [properties, setProperties] = useState<ObjectProperty[]>([])

  // Category combobox
  const catOptions = kind === 'token'
    ? [...new Set([...snapshot.appTokenCategories, ...snapshot.projectTokenCategories])]
    : [...new Set([...snapshot.appPropCategories, ...snapshot.projectPropCategories])]
  const [newCatInput, setNewCatInput] = useState('')
  const combobox = useCombobox()
  const catList = newCatInput
    ? [...catOptions, ...(catOptions.includes(newCatInput) ? [] : [newCatInput])]
    : catOptions

  // ── Navigation ────────────────────────────────────────────────────────────────

  function canNext(): boolean {
    if (step === 0) return kind !== null
    if (step === 1) return name.trim().length > 0 && category.trim().length > 0
    return true
  }

  function next() { setStep((s) => Math.min(s + 1, 3) as Step) }
  function back() { setStep((s) => Math.max(s - 1, 0) as Step) }

  async function finish() {
    if (!kind) return
    const id = nanoid()
    const catDir = category.toLowerCase().replace(/\s+/g, '-')

    let obj: ObjectDefinition
    if (kind === 'token') {
      const tok: TokenDefinition = {
        id, name, description, tier: 'project', kind: 'token', category,
        properties,
        visual: {
          icon:        `tokens/${catDir}/${iconName || id + '.svg'}`,
          iconContent,
          bgColor,
          fgColor,
          borderColor
        }
      }
      obj = tok
    } else {
      const texName = `props/${catDir}/${nanoid(8)}.png`
      const pr: PropDefinition = {
        id, name, description, tier: 'project', kind: 'prop', category,
        properties,
        visual: {
          texture:      texName,
          textureUrl:   textureDataUrl ?? '',
          naturalWidth:  gridW,
          naturalHeight: gridH
        }
      }
      obj = pr
    }

    await api.saveObject(obj)
    onCreated(id)
  }

  // ── SVG upload ────────────────────────────────────────────────────────────────

  async function pickSvg() {
    const result = await api.pickSvgFile()
    if (!result) return
    setIconContent(result.content)
    setIconName(result.name)
  }

  // ── Prop image ────────────────────────────────────────────────────────────────

  async function pickImage() {
    const result = await api.pickImageFile()
    if (!result) return
    setTextureSrc(result.dataUrl)
    setCropDone(false)
    setTextureDataUrl(null)
  }

  function onCropConfirm(dataUrl: string) {
    setTextureDataUrl(dataUrl)
    setTextureSrc(null)
    setCropDone(true)
  }

  // ── Properties ────────────────────────────────────────────────────────────────

  function addProp() {
    setProperties((p) => [...p, { name: 'New property', control: { kind: 'short-text' }, defaultValue: '' }])
  }
  function removeProp(i: number) { setProperties((p) => p.filter((_, idx) => idx !== i)) }
  function updateProp(i: number, updates: Partial<ObjectProperty>) {
    setProperties((p) => p.map((item, idx) => idx === i ? { ...item, ...updates } : item))
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Modal opened onClose={onClose} title="New Object" size="md" centered>
        {/* Step indicator */}
        <Group gap={4} mb={16}>
          {STEPS.map((label, i) => (
            <div key={i} className={classes.stepDot} data-active={i === step || undefined} data-done={i < step || undefined}>
              <Text size="xs">{label}</Text>
            </div>
          ))}
        </Group>

        {/* ── Step 0: Kind ── */}
        {step === 0 && (
          <Stack gap={10}>
            <Text size="sm" c="dimmed">What kind of object do you want to create?</Text>
            <Group grow gap={10}>
              <UnstyledButton className={classes.kindCard} data-active={kind === 'token' || undefined} onClick={() => setKind('token')}>
                <Text fw={600} size="sm">Token</Text>
                <Text size="xs" c="dimmed">A creature, NPC, or interactive entity. Uses an SVG icon with color customization.</Text>
              </UnstyledButton>
              <UnstyledButton className={classes.kindCard} data-active={kind === 'prop' || undefined} onClick={() => setKind('prop')}>
                <Text fw={600} size="sm">Prop</Text>
                <Text size="xs" c="dimmed">A piece of scenery or furniture. Uses a sprite image sized to a grid area.</Text>
              </UnstyledButton>
            </Group>
          </Stack>
        )}

        {/* ── Step 1: Details ── */}
        {step === 1 && (
          <Stack gap={8}>
            <TextInput label="Name" size="xs" placeholder="e.g. Chest of Holding" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
            <div>
              <Text size="xs" fw={500} mb={4}>Category</Text>
              <Combobox store={combobox} onOptionSubmit={(val) => { setCategory(val); combobox.closeDropdown() }}>
                <Combobox.Target>
                  <InputBase
                    size="xs"
                    placeholder={kind === 'token' ? 'e.g. creature' : 'e.g. furniture'}
                    value={category}
                    onChange={(e) => { setCategory(e.currentTarget.value); setNewCatInput(e.currentTarget.value); combobox.openDropdown() }}
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => { combobox.closeDropdown(); setNewCatInput('') }}
                  />
                </Combobox.Target>
                <Combobox.Dropdown>
                  <Combobox.Options>
                    {catList.map((c) => <Combobox.Option key={c} value={c}>{c}</Combobox.Option>)}
                    {newCatInput && !catOptions.includes(newCatInput) && (
                      <Combobox.Option value={newCatInput}>Create "{newCatInput}"</Combobox.Option>
                    )}
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>
            </div>
            <Textarea label="Description" size="xs" minRows={2} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
            {kind === 'prop' && (
              <Group grow gap={8}>
                <NumberInput label="Width (cells)" size="xs" min={1} max={20} value={gridW} onChange={(v) => setGridW(Number(v) || 1)} />
                <NumberInput label="Height (cells)" size="xs" min={1} max={20} value={gridH} onChange={(v) => setGridH(Number(v) || 1)} />
              </Group>
            )}
          </Stack>
        )}

        {/* ── Step 2: Visual ── */}
        {step === 2 && kind === 'token' && (
          <Stack gap={10}>
            <Text size="sm" c="dimmed">Set up the token's icon and colors. You can change these later.</Text>
            <Group align="flex-start" gap={16}>
              {/* Preview */}
              <div
                className={classes.tokenPreview}
                style={{ background: bgColor, border: `3px solid ${borderColor}`, color: fgColor }}
                dangerouslySetInnerHTML={{ __html: iconContent }}
              />
              <Stack gap={6} style={{ flex: 1 }}>
                <Button size="xs" variant="outline" onClick={pickSvg}>Upload SVG icon…</Button>
                <ColorInput label="Background" size="xs" value={bgColor}     onChange={setBgColor}     />
                <ColorInput label="Foreground" size="xs" value={fgColor}     onChange={setFgColor}     />
                <ColorInput label="Border"     size="xs" value={borderColor} onChange={setBorderColor} />
              </Stack>
            </Group>
          </Stack>
        )}
        {step === 2 && kind === 'prop' && (
          <Stack gap={10}>
            <Text size="sm" c="dimmed">
              Upload an image for this prop ({gridW}×{gridH} cells). You'll crop it to the right aspect ratio.
            </Text>
            <Group align="center" gap={12}>
              {cropDone && textureDataUrl
                ? <img src={textureDataUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--mantine-color-dark-4)' }} />
                : <div className={classes.propThumbEmpty}><Text size="xs" c="dimmed">No image</Text></div>
              }
              <Stack gap={6}>
                <Button size="xs" variant="outline" onClick={pickImage}>
                  {cropDone ? 'Replace image…' : 'Upload image…'}
                </Button>
                {cropDone && <Text size="xs" c="teal">Image set — {gridW}×{gridH} cells</Text>}
              </Stack>
            </Group>
          </Stack>
        )}

        {/* ── Step 3: Properties ── */}
        {step === 3 && (
          <Stack gap={8}>
            <Text size="sm" c="dimmed">Add optional tracked properties (HP, charges, etc.). These can be filled in per-instance on the map.</Text>
            {properties.map((p, i) => (
              <Group key={i} gap={6} wrap="nowrap">
                <TextInput
                  size="xs" style={{ flex: 1 }}
                  value={p.name}
                  onChange={(e) => updateProp(i, { name: e.currentTarget.value })}
                />
                <Button size="xs" variant="subtle" color="red" onClick={() => removeProp(i)}>✕</Button>
              </Group>
            ))}
            <Button size="xs" variant="subtle" onClick={addProp}>+ Add property</Button>
          </Stack>
        )}

        {/* Footer nav */}
        <Group justify="space-between" mt={20}>
          {step > 0
            ? <Button size="xs" variant="subtle" color="gray" onClick={back}>Back</Button>
            : <Button size="xs" variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          }
          {step < 3
            ? <Button size="xs" color="teal" disabled={!canNext()} onClick={next}>Next</Button>
            : <Button size="xs" color="teal" onClick={finish}>Create object</Button>
          }
        </Group>
      </Modal>

      {/* Prop crop flow: opened when textureSrc is set */}
      {textureSrc && (
        <PropCropModal
          src={textureSrc}
          gridW={gridW}
          gridH={gridH}
          onConfirm={onCropConfirm}
          onClose={() => setTextureSrc(null)}
        />
      )}
    </>
  )
}

// ── Inline crop modal ──────────────────────────────────────────────────────────

const CROP_MAX_PX = 400
const PX_PER_CELL = 128

interface CropProps {
  src:       string
  gridW:     number
  gridH:     number
  onConfirm: (dataUrl: string) => void
  onClose:   () => void
}

function PropCropModal({ src, gridW, gridH, onConfirm, onClose }: CropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef  = useRef<HTMLImageElement | null>(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  const aspect   = gridW / gridH
  const previewH = Math.round(Math.min(CROP_MAX_PX, CROP_MAX_PX / aspect))
  const previewW = Math.round(previewH * aspect)

  const [imgW,    setImgW]    = useState(1)
  const [imgH,    setImgH]    = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [zoom,    setZoom]    = useState(1)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      setImgW(img.naturalWidth); setImgH(img.naturalHeight)
      const imgAspect = img.naturalWidth / img.naturalHeight
      if (imgAspect > aspect) {
        const cw = img.naturalHeight * aspect
        setOffsetX((img.naturalWidth - cw) / 2); setOffsetY(0)
      } else {
        const ch = img.naturalWidth / aspect
        setOffsetX(0); setOffsetY((img.naturalHeight - ch) / 2)
      }
      setZoom(1)
    }
    img.src = src
  }, [src, aspect])

  const getCropSize = useCallback(() => {
    const baseW = Math.min(imgW, imgH * aspect)
    return { cw: baseW / zoom, ch: (baseW / aspect) / zoom }
  }, [imgW, imgH, aspect, zoom])

  const draw = useCallback(() => {
    const canvas = canvasRef.current; const img = imageRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, previewW, previewH)
    const { cw, ch } = getCropSize()
    const sx = Math.max(0, Math.min(offsetX, imgW - cw))
    const sy = Math.max(0, Math.min(offsetY, imgH - ch))
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, previewW, previewH)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
    for (let c = 1; c < gridW; c++) {
      const x = (c / gridW) * previewW
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, previewH); ctx.stroke()
    }
    for (let r = 1; r < gridH; r++) {
      const y = (r / gridH) * previewH
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(previewW, y); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(45,212,191,0.7)'; ctx.lineWidth = 2
    ctx.strokeRect(1, 1, previewW - 2, previewH - 2)
  }, [offsetX, offsetY, zoom, imgW, imgH, previewW, previewH, gridW, gridH, getCropSize])

  useEffect(() => { draw() }, [draw])

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offsetX, oy: offsetY }
    e.preventDefault()
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    const { cw, ch } = getCropSize()
    const rx = cw / previewW; const ry = ch / previewH
    const { mx, my, ox, oy } = dragStart.current
    setOffsetX(Math.max(0, Math.min(ox - (e.clientX - mx) * rx, imgW - cw)))
    setOffsetY(Math.max(0, Math.min(oy - (e.clientY - my) * ry, imgH - ch)))
  }
  function onMouseUp() { dragging.current = false }

  function handleConfirm() {
    const img = imageRef.current; if (!img) return
    const outW = gridW * PX_PER_CELL; const outH = gridH * PX_PER_CELL
    const out = document.createElement('canvas')
    out.width = outW; out.height = outH
    const ctx = out.getContext('2d')!
    const { cw, ch } = getCropSize()
    const sx = Math.max(0, Math.min(offsetX, imgW - cw))
    const sy = Math.max(0, Math.min(offsetY, imgH - ch))
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, outW, outH)
    onConfirm(out.toDataURL('image/png'))
  }

  return (
    <Modal opened onClose={onClose} title="Crop image" centered size="auto" zIndex={310}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">Drag to pan · Scroll to zoom · Grid lines show cell boundaries</Text>
        <canvas
          ref={canvasRef} width={previewW} height={previewH}
          style={{ display: 'block', width: previewW, height: previewH, cursor: 'grab', userSelect: 'none', margin: '0 auto' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        />
        <Stack gap={4}>
          <Text size="xs" c="dimmed">Zoom</Text>
          <Slider min={1} max={4} step={0.05} value={zoom} onChange={(v) => {
            const { cw: oldCw, ch: oldCh } = getCropSize()
            setZoom(v)
            const baseW = Math.min(imgW, imgH * aspect) / v
            const newCw = baseW; const newCh = baseW / aspect
            setOffsetX((ox) => Math.max(0, Math.min(ox + (oldCw - newCw) / 2, imgW - newCw)))
            setOffsetY((oy) => Math.max(0, Math.min(oy + (oldCh - newCh) / 2, imgH - newCh)))
          }} color="teal" />
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          <Button color="teal" onClick={handleConfirm}>Use this crop</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
