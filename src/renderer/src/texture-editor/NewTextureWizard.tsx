import { useState } from 'react'
import {
  Modal, Stack, Text, TextInput, Group, Button, Divider,
  NumberInput, ColorInput, SegmentedControl, Combobox, useCombobox, InputBase
} from '@mantine/core'
import { TextureDefinition } from '../types/map'
import { TextureCatalogSnapshot } from './types'
import { nanoid } from 'nanoid'

const api = window.textureAPI!

interface Props {
  snapshot:  TextureCatalogSnapshot
  onCreated: (id: string) => void
  onClose:   () => void
}

interface Draft {
  surface:        TextureDefinition['surface']
  name:           string
  category:       string
  layoutColor:    string
  tileSize:       number
  texture:        string
  textureUrl:     string
  textureDataUrl: string
  rotation:       TextureDefinition['rotation']
  offsetX:        number
  offsetY:        number
}

const STEPS = ['Surface', 'Details', 'Visual', 'Transform']

export function NewTextureWizard({ snapshot, onCreated, onClose }: Props) {
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [draft,  setDraft]  = useState<Draft>({
    surface:        'both',
    name:           '',
    category:       '',
    layoutColor:    '#4b5a75',
    tileSize:       2,
    texture:        '',
    textureUrl:     '',
    textureDataUrl: '',
    rotation:       0,
    offsetX:        0,
    offsetY:        0,
  })

  function patch(updates: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...updates }))
  }

  const allCategories = [...new Set([
    ...snapshot.appTextures.map((t) => t.category),
    ...snapshot.projectTextures.map((t) => t.category)
  ].filter(Boolean))]

  const combobox = useCombobox()
  const catOptions = newCat
    ? [...allCategories, ...(allCategories.includes(newCat) ? [] : [newCat])]
    : allCategories

  async function pickImage() {
    const result = await api.pickImageFile()
    if (!result) return
    const ext      = result.name.split('.').pop() ?? 'jpg'
    const filename = `${nanoid(8)}.${ext}`
    patch({ texture: filename, textureUrl: result.dataUrl, textureDataUrl: result.dataUrl })
  }

  async function handleCreate() {
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      const id = nanoid()
      const tex: TextureDefinition & { textureDataUrl?: string } = {
        id,
        name:        draft.name.trim(),
        tier:        'project',
        surface:     draft.surface,
        category:    draft.category,
        layoutColor: parseInt(draft.layoutColor.replace('#', ''), 16) || 0x4b5a75,
        texture:     draft.texture,
        textureUrl:  draft.textureUrl,
        tileSize:    draft.tileSize,
        rotation:    draft.rotation,
        offsetX:     draft.offsetX,
        offsetY:     draft.offsetY,
      }
      if (draft.textureDataUrl) tex.textureDataUrl = draft.textureDataUrl
      await api.saveTexture(tex)
      onCreated(id)
    } finally {
      setSaving(false)
    }
  }

  const canAdvance = [
    true,
    draft.name.trim().length > 0,
    true,
    true,
  ]

  return (
    <Modal opened onClose={onClose} title="New Texture" centered size="sm">
      {/* Step indicator */}
      <Group gap={4} mb={20}>
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: i === step
                ? 'var(--mantine-color-teal-6)'
                : i < step
                ? 'var(--mantine-color-teal-9)'
                : 'var(--mantine-color-dark-5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11,
              color: i <= step ? 'white' : 'var(--mantine-color-dimmed)',
              fontWeight: 600
            }}>{i + 1}</div>
            <Text size="xs" c={i === step ? 'teal' : 'dimmed'} mt={2}>{label}</Text>
          </div>
        ))}
      </Group>

      {/* Step 0 — Surface */}
      {step === 0 && (
        <Stack gap={8}>
          <Text size="sm" c="dimmed" mb={4}>Which surfaces will this texture apply to?</Text>
          {(['floor', 'wall', 'both'] as const).map((s) => (
            <div
              key={s}
              onClick={() => patch({ surface: s })}
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                border: `2px solid ${draft.surface === s ? 'var(--mantine-color-teal-5)' : 'var(--mantine-color-dark-4)'}`,
                cursor: 'pointer',
                background: draft.surface === s ? 'var(--mantine-color-teal-9)' : 'transparent',
              }}
            >
              <Text size="sm" fw={500} style={{ textTransform: 'capitalize' }}>{s}</Text>
              <Text size="xs" c="dimmed">
                {s === 'floor' ? 'Applied to floor surfaces only' :
                 s === 'wall'  ? 'Applied to wall surfaces only' :
                                 'Can be applied to both floors and walls'}
              </Text>
            </div>
          ))}
        </Stack>
      )}

      {/* Step 1 — Details */}
      {step === 1 && (
        <Stack gap={10}>
          <TextInput
            label="Name"
            placeholder="e.g. Marble Floor"
            value={draft.name}
            onChange={(e) => patch({ name: e.currentTarget.value })}
            data-autofocus
          />
          <div>
            <Text size="xs" mb={4}>Category <Text span c="dimmed">(optional)</Text></Text>
            <Combobox
              store={combobox}
              onOptionSubmit={(v) => { patch({ category: v }); combobox.closeDropdown() }}
            >
              <Combobox.Target>
                <InputBase
                  size="xs"
                  placeholder="e.g. stone"
                  value={draft.category}
                  onChange={(e) => {
                    patch({ category: e.currentTarget.value })
                    setNewCat(e.currentTarget.value)
                    combobox.openDropdown()
                  }}
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => { combobox.closeDropdown(); setNewCat('') }}
                />
              </Combobox.Target>
              <Combobox.Dropdown>
                <Combobox.Options>
                  {catOptions.map((c) => <Combobox.Option key={c} value={c}>{c}</Combobox.Option>)}
                  {newCat && !allCategories.includes(newCat) && (
                    <Combobox.Option value={newCat}>Create "{newCat}"</Combobox.Option>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
          </div>
        </Stack>
      )}

      {/* Step 2 — Visual */}
      {step === 2 && (
        <Stack gap={10}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {draft.textureUrl
              ? <img
                  src={draft.textureUrl}
                  alt=""
                  style={{
                    width: 128, height: 128, objectFit: 'cover',
                    borderRadius: 6, border: '1px solid var(--mantine-color-dark-4)'
                  }}
                />
              : <div style={{
                    width: 128, height: 128, borderRadius: 6,
                    border: '2px dashed var(--mantine-color-dark-4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: draft.layoutColor
                  }}>
                  <Text size="xs" c="dimmed">No image</Text>
                </div>
            }
            <Button size="xs" variant="subtle" onClick={pickImage}>Pick image…</Button>
          </div>
          <ColorInput
            label="Layout color"
            description="Color shown in 2D layout mode"
            value={draft.layoutColor}
            onChange={(v) => patch({ layoutColor: v })}
            format="hex"
          />
          <NumberInput
            label="Tile size (cells)"
            description="Grid cells per one texture repeat"
            min={1} max={32}
            value={draft.tileSize}
            onChange={(v) => patch({ tileSize: Number(v) || 1 })}
          />
        </Stack>
      )}

      {/* Step 3 — Transform */}
      {step === 3 && (
        <Stack gap={10}>
          <div>
            <Text size="xs" mb={6}>Rotation</Text>
            <SegmentedControl
              fullWidth
              value={String(draft.rotation)}
              onChange={(v) => patch({ rotation: Number(v) as TextureDefinition['rotation'] })}
              data={['0', '90', '180', '270']}
            />
          </div>
          <NumberInput
            label="Offset X"
            description="UV horizontal shift (0.0–1.0)"
            min={0} max={1} step={0.05} decimalScale={2}
            value={draft.offsetX}
            onChange={(v) => patch({ offsetX: Number(v) || 0 })}
          />
          <NumberInput
            label="Offset Y"
            description="UV vertical shift (0.0–1.0)"
            min={0} max={1} step={0.05} decimalScale={2}
            value={draft.offsetY}
            onChange={(v) => patch({ offsetY: Number(v) || 0 })}
          />
        </Stack>
      )}

      <Divider my={16} />
      <Group justify="space-between">
        <Button
          variant="subtle" color="gray"
          onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            color="teal"
            disabled={!canAdvance[step]}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            color="teal"
            loading={saving}
            disabled={saving || !draft.name.trim()}
            onClick={handleCreate}
          >
            Create
          </Button>
        )}
      </Group>
    </Modal>
  )
}
