import { useState, useCallback } from 'react'
import {
  Stack, Text, TextInput, Textarea, Select, Group,
  Button, Divider, ActionIcon, NumberInput, ColorInput, Combobox, useCombobox, InputBase
} from '@mantine/core'
import { ObjectDefinition, TokenDefinition, PropDefinition, ObjectProperty, PropertyControl } from '../types/map'
import { nanoid } from 'nanoid'
import classes from './ObjectEditorPanel.module.css'

const api = window.catalogAPI!

const CONTROL_LABELS: Record<PropertyControl['kind'], string> = {
  'short-text': 'Short text',
  'long-text':  'Long text',
  'number':     'Number',
  'slider':     'Slider',
  'dropdown':   'Dropdown',
  'checkbox':   'Checkbox'
}

const CONTROL_KINDS = Object.keys(CONTROL_LABELS) as PropertyControl['kind'][]

interface Props {
  object:           ObjectDefinition
  tokenCategories:  string[]
  propCategories:   string[]
  onSave:           (obj: ObjectDefinition) => Promise<void>
}

export function ObjectEditorPanel({ object, tokenCategories, propCategories, onSave }: Props) {
  const [draft, setDraft] = useState<ObjectDefinition>(() => JSON.parse(JSON.stringify(object)))
  const [saving, setSaving] = useState(false)
  const [newCatInput, setNewCatInput] = useState('')

  const isDirty = JSON.stringify(draft) !== JSON.stringify(object)

  function patch(updates: Partial<ObjectDefinition>) {
    setDraft((d) => ({ ...d, ...updates } as ObjectDefinition))
  }

  function patchVisual(updates: Record<string, unknown>) {
    setDraft((d) => ({ ...d, visual: { ...(d.visual as object), ...updates } } as ObjectDefinition))
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(draft) }
    finally { setSaving(false) }
  }

  // ── Token visual ──────────────────────────────────────────────────────────────
  async function replaceIcon() {
    const result = await api.pickSvgFile()
    if (!result) return
    const { name, content } = result
    const kindPath = `tokens/${draft.category}`
    patchVisual({ icon: `${kindPath}/${name}`, iconContent: content })
  }

  // ── Prop visual ───────────────────────────────────────────────────────────────
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  async function replaceTexture() {
    const result = await api.pickImageFile()
    if (!result) return
    setCropSrc(result.dataUrl)
  }

  function onCropConfirm(dataUrl: string, w: number, h: number) {
    const prop  = draft as PropDefinition
    const name  = `props/${draft.category}/${nanoid(8)}.png`
    patchVisual({
      texture:        name,
      textureUrl:     dataUrl,
      textureDataUrl: dataUrl,
      naturalWidth:   w,
      naturalHeight:  h
    })
    setCropSrc(null)
  }

  // ── Properties ────────────────────────────────────────────────────────────────
  function updateProp(idx: number, updates: Partial<ObjectProperty>) {
    const props = draft.properties.map((p, i) => i === idx ? { ...p, ...updates } : p)
    patch({ properties: props } as Partial<ObjectDefinition>)
  }

  function removeProp(idx: number) {
    patch({ properties: draft.properties.filter((_, i) => i !== idx) } as Partial<ObjectDefinition>)
  }

  function addProp() {
    const newProp: ObjectProperty = { name: 'New property', control: { kind: 'short-text' }, defaultValue: '' }
    patch({ properties: [...draft.properties, newProp] } as Partial<ObjectDefinition>)
  }

  function updateControl(idx: number, kind: PropertyControl['kind']) {
    let control: PropertyControl
    switch (kind) {
      case 'slider':   control = { kind, min: 0, max: 100 }; break
      case 'number':   control = { kind }; break
      case 'dropdown': control = { kind, options: [''] }; break
      default:         control = { kind }
    }
    updateProp(idx, { control, defaultValue: '' })
  }

  // ── Category combobox with create option ─────────────────────────────────────
  const catOptions = draft.kind === 'token' ? tokenCategories : propCategories
  const combobox   = useCombobox()

  const cats = newCatInput
    ? [...catOptions, ...(catOptions.includes(newCatInput) ? [] : [newCatInput])]
    : catOptions

  // ── Prop crop ─────────────────────────────────────────────────────────────────
  const prop        = draft.kind === 'prop' ? draft as PropDefinition : null
  const cropW       = prop?.visual.naturalWidth  ?? 1
  const cropH       = prop?.visual.naturalHeight ?? 1

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Text className={classes.title}>{draft.name || 'Untitled'}</Text>
        <Text size="xs" c="dimmed">{draft.tier === 'app' ? 'App' : 'Project'} · {draft.kind === 'token' ? 'Token' : 'Prop'}</Text>
      </div>

      <Stack gap={0} p={12}>
        {/* Identity */}
        <Text className={classes.sectionLabel}>Identity</Text>
        <LabeledRow label="Name">
          <TextInput size="xs" value={draft.name} onChange={(e) => patch({ name: e.currentTarget.value })} />
        </LabeledRow>
        <LabeledRow label="Category">
          <Combobox store={combobox} onOptionSubmit={(val) => { patch({ category: val }); combobox.closeDropdown() }}>
            <Combobox.Target>
              <InputBase
                size="xs"
                value={draft.category}
                onChange={(e) => { patch({ category: e.currentTarget.value }); setNewCatInput(e.currentTarget.value); combobox.openDropdown() }}
                onFocus={() => combobox.openDropdown()}
                onBlur={() => { combobox.closeDropdown(); setNewCatInput('') }}
              />
            </Combobox.Target>
            <Combobox.Dropdown>
              <Combobox.Options>
                {cats.map((c) => (
                  <Combobox.Option key={c} value={c}>{c}</Combobox.Option>
                ))}
                {newCatInput && !catOptions.includes(newCatInput) && (
                  <Combobox.Option value={newCatInput}>Create "{newCatInput}"</Combobox.Option>
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </LabeledRow>
        <LabeledRow label="Description">
          <Textarea size="xs" minRows={2} value={draft.description} onChange={(e) => patch({ description: e.currentTarget.value })} />
        </LabeledRow>

        <Divider my={10} />

        {/* Visual — Token */}
        {draft.kind === 'token' && (() => {
          const tok = draft as TokenDefinition
          return (
            <>
              <Text className={classes.sectionLabel}>Visual</Text>
              <div className={classes.tokenPreview}>
                <div
                  className={classes.tokenIcon}
                  style={{ background: tok.visual.bgColor, border: `3px solid ${tok.visual.borderColor}`, color: tok.visual.fgColor }}
                  dangerouslySetInnerHTML={{ __html: tok.visual.iconContent }}
                />
                <Button size="xs" variant="subtle" onClick={replaceIcon}>Replace SVG…</Button>
              </div>
              <LabeledRow label="Background"><ColorInput size="xs" value={tok.visual.bgColor}     onChange={(v) => patchVisual({ bgColor:     v })} /></LabeledRow>
              <LabeledRow label="Foreground"><ColorInput size="xs" value={tok.visual.fgColor}     onChange={(v) => patchVisual({ fgColor:     v })} /></LabeledRow>
              <LabeledRow label="Border">    <ColorInput size="xs" value={tok.visual.borderColor} onChange={(v) => patchVisual({ borderColor: v })} /></LabeledRow>
            </>
          )
        })()}

        {/* Visual — Prop */}
        {draft.kind === 'prop' && (() => {
          const pr = draft as PropDefinition
          return (
            <>
              <Text className={classes.sectionLabel}>Visual</Text>
              <div className={classes.propPreview}>
                {pr.visual.textureUrl
                  ? <img className={classes.propThumb} src={pr.visual.textureUrl} alt="" />
                  : <div className={classes.propThumbPlaceholder}><Text size="xs" c="dimmed">No image</Text></div>
                }
                <Button size="xs" variant="subtle" onClick={replaceTexture}>Replace image…</Button>
              </div>
              <LabeledRow label="Width (cells)">
                <NumberInput size="xs" min={1} max={20} value={pr.visual.naturalWidth}
                  onChange={(v) => patchVisual({ naturalWidth: Number(v) || 1 })} />
              </LabeledRow>
              <LabeledRow label="Height (cells)">
                <NumberInput size="xs" min={1} max={20} value={pr.visual.naturalHeight}
                  onChange={(v) => patchVisual({ naturalHeight: Number(v) || 1 })} />
              </LabeledRow>
            </>
          )
        })()}

        <Divider my={10} />

        {/* Properties */}
        <Text className={classes.sectionLabel}>Properties</Text>
        {draft.properties.map((prop, idx) => (
          <PropertyRow key={idx} prop={prop} idx={idx} onUpdate={updateProp} onRemove={removeProp} onControlChange={updateControl} />
        ))}
        <Button size="xs" variant="subtle" mt={4} onClick={addProp}>+ Add property</Button>
      </Stack>

      <div className={classes.footer}>
        <Button size="xs" color="teal" disabled={!isDirty || saving} loading={saving} onClick={handleSave}>Save changes</Button>
      </div>

      {/* Prop crop modal */}
      {cropSrc && prop && (
        <PropImageCropModal
          src={cropSrc}
          gridW={cropW}
          gridH={cropH}
          onConfirm={onCropConfirm}
          onClose={() => setCropSrc(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap={8} wrap="nowrap" mb={6} align="flex-start">
      <Text className={classes.rowLabel}>{label}</Text>
      <div style={{ flex: 1 }}>{children}</div>
    </Group>
  )
}

function PropertyRow({ prop, idx, onUpdate, onRemove, onControlChange }: {
  prop: ObjectProperty
  idx:  number
  onUpdate: (i: number, updates: Partial<ObjectProperty>) => void
  onRemove: (i: number) => void
  onControlChange: (i: number, kind: PropertyControl['kind']) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const ctrl = prop.control

  return (
    <div className={classes.propRow}>
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs" style={{ flex: 1 }}
          value={prop.name}
          onChange={(e) => onUpdate(idx, { name: e.currentTarget.value })}
        />
        <Select
          size="xs" style={{ width: 120 }}
          data={CONTROL_KINDS.map((k) => ({ value: k, label: CONTROL_LABELS[k] }))}
          value={ctrl.kind}
          onChange={(v) => v && onControlChange(idx, v as PropertyControl['kind'])}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
        <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setExpanded((e) => !e)}>⚙</ActionIcon>
        <ActionIcon size="xs" variant="subtle" color="red"  onClick={() => onRemove(idx)}>✕</ActionIcon>
      </Group>

      {expanded && (
        <div className={classes.propConfig}>
          {/* Default value */}
          <Group gap={6} align="center" mb={4}>
            <Text size="xs" c="dimmed" style={{ width: 80 }}>Default</Text>
            {ctrl.kind === 'checkbox' ? (
              <Select size="xs" data={['true','false']} value={prop.defaultValue || 'false'}
                onChange={(v) => onUpdate(idx, { defaultValue: v ?? 'false' })} allowDeselect={false} comboboxProps={{ withinPortal: true }} />
            ) : ctrl.kind === 'dropdown' ? (
              <Select size="xs" data={ctrl.options} value={prop.defaultValue}
                onChange={(v) => onUpdate(idx, { defaultValue: v ?? '' })} comboboxProps={{ withinPortal: true }} />
            ) : (
              <TextInput size="xs" style={{ flex: 1 }} value={prop.defaultValue}
                onChange={(e) => onUpdate(idx, { defaultValue: e.currentTarget.value })} />
            )}
          </Group>
          {/* Control-specific config */}
          {(ctrl.kind === 'number' || ctrl.kind === 'slider') && (
            <Group gap={6} mb={4}>
              <Text size="xs" c="dimmed" style={{ width: 80 }}>Min / Max</Text>
              <NumberInput size="xs" style={{ width: 70 }} value={ctrl.min ?? ''} placeholder="min"
                onChange={(v) => onUpdate(idx, { control: { ...ctrl, min: v === '' ? undefined : Number(v) } as PropertyControl })} />
              <NumberInput size="xs" style={{ width: 70 }} value={ctrl.max ?? ''} placeholder="max"
                onChange={(v) => onUpdate(idx, { control: { ...ctrl, max: v === '' ? undefined : Number(v) } as PropertyControl })} />
            </Group>
          )}
          {ctrl.kind === 'dropdown' && (
            <div>
              <Text size="xs" c="dimmed" mb={4}>Options (one per line)</Text>
              <Textarea size="xs" minRows={3}
                value={ctrl.options.join('\n')}
                onChange={(e) => onUpdate(idx, { control: { kind: 'dropdown', options: e.currentTarget.value.split('\n').map((s) => s.trim()).filter(Boolean) } })} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Prop image crop (inline, not a modal import to keep bundle clean) ──────────

const CROP_MAX_PX = 480
const PX_PER_CELL = 128

interface CropProps {
  src:       string
  gridW:     number
  gridH:     number
  onConfirm: (dataUrl: string, w: number, h: number) => void
  onClose:   () => void
}

import { useRef, useEffect } from 'react'
import { Modal, Slider } from '@mantine/core'

function PropImageCropModal({ src, gridW, gridH, onConfirm, onClose }: CropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef  = useRef<HTMLImageElement | null>(null)
  const dragging  = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  const aspect     = gridW / gridH
  const previewH   = Math.round(Math.min(CROP_MAX_PX, CROP_MAX_PX / aspect))
  const previewW   = Math.round(previewH * aspect)

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
      // Initial crop: letterbox the image to the grid aspect ratio
      const imgAspect = img.naturalWidth / img.naturalHeight
      if (imgAspect > aspect) {
        const cropW = img.naturalHeight * aspect
        setOffsetX((img.naturalWidth - cropW) / 2); setOffsetY(0)
      } else {
        const cropH = img.naturalWidth / aspect
        setOffsetX(0); setOffsetY((img.naturalHeight - cropH) / 2)
      }
      setZoom(1)
    }
    img.src = src
  }, [src, aspect])

  const getCropSize = useCallback(() => {
    const baseW = Math.min(imgW, imgH * aspect)
    const baseH = baseW / aspect
    return { cw: baseW / zoom, ch: baseH / zoom }
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
    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
    for (let c = 1; c < gridW; c++) {
      const x = (c / gridW) * previewW
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, previewH); ctx.stroke()
    }
    for (let r = 1; r < gridH; r++) {
      const y = (r / gridH) * previewH
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(previewW, y); ctx.stroke()
    }
    // Frame border
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
    onConfirm(out.toDataURL('image/png'), gridW, gridH)
  }

  return (
    <Modal opened onClose={onClose} title="Crop prop image" centered size="auto">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">Drag to pan · Scroll to zoom · Grid lines show cell boundaries</Text>
        <canvas ref={canvasRef} width={previewW} height={previewH}
          style={{ display: 'block', width: previewW, height: previewH, cursor: 'grab', userSelect: 'none', margin: '0 auto' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} />
        <Stack gap={4}>
          <Text size="xs" c="dimmed">Zoom</Text>
          <Slider min={1} max={4} step={0.05} value={zoom} onChange={(v) => {
            const { cw: oldCw, ch: oldCh } = getCropSize()
            setZoom(v)
            const newBase = Math.min(imgW, imgH * aspect) / v
            const newCw = newBase; const newCh = newBase / aspect
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
