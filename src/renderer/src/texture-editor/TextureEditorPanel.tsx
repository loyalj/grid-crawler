import { useState } from 'react'
import {
  Stack, Text, TextInput, Select, Group, Button, Divider,
  NumberInput, ColorInput, SegmentedControl, Combobox, useCombobox, InputBase
} from '@mantine/core'
import { TextureDefinition } from '../types/map'
import classes from './TextureEditorPanel.module.css'

const api = window.textureAPI!

interface Props {
  texture:    TextureDefinition
  categories: string[]
  onSave:     (tex: TextureDefinition) => Promise<void>
}

// Extend draft to hold a pending image data URL before it's written to disk
type DraftTexture = TextureDefinition & { textureDataUrl?: string }

export function TextureEditorPanel({ texture, categories, onSave }: Props) {
  const [draft,  setDraft]  = useState<DraftTexture>(() => JSON.parse(JSON.stringify(texture)))
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')

  const isDirty = JSON.stringify(draft) !== JSON.stringify(texture)

  function patch(updates: Partial<DraftTexture>) {
    setDraft((d) => ({ ...d, ...updates }))
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(draft) }
    finally { setSaving(false) }
  }

  async function pickImage() {
    const result = await api.pickImageFile()
    if (!result) return
    const ext      = result.name.split('.').pop() ?? 'jpg'
    const filename = `${draft.id}-${Date.now()}.${ext}`
    patch({ texture: filename, textureUrl: result.dataUrl, textureDataUrl: result.dataUrl })
  }

  // Hex ↔ number helpers
  const colorHex = `#${draft.layoutColor.toString(16).padStart(6, '0')}`
  function onColorChange(hex: string) {
    const num = parseInt(hex.replace('#', ''), 16)
    if (!isNaN(num)) patch({ layoutColor: num })
  }

  // Category combobox
  const combobox = useCombobox()
  const catOptions = newCat
    ? [...categories, ...(categories.includes(newCat) ? [] : [newCat])]
    : categories

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Text className={classes.title}>{draft.name || 'Untitled'}</Text>
        <Text size="xs" c="dimmed">{draft.tier === 'app' ? 'App' : 'Project'} · {draft.surface}</Text>
      </div>

      <Stack gap={0} p={12}>
        <Text className={classes.sectionLabel}>Identity</Text>

        <LabeledRow label="Name">
          <TextInput
            size="xs"
            value={draft.name}
            onChange={(e) => patch({ name: e.currentTarget.value })}
          />
        </LabeledRow>

        <LabeledRow label="Category">
          <Combobox
            store={combobox}
            onOptionSubmit={(v) => { patch({ category: v }); combobox.closeDropdown() }}
          >
            <Combobox.Target>
              <InputBase
                size="xs"
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
                {catOptions.map((c) => (
                  <Combobox.Option key={c} value={c}>{c}</Combobox.Option>
                ))}
                {newCat && !categories.includes(newCat) && (
                  <Combobox.Option value={newCat}>Create "{newCat}"</Combobox.Option>
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </LabeledRow>

        <LabeledRow label="Surface">
          <Select
            size="xs"
            value={draft.surface}
            onChange={(v) => v && patch({ surface: v as TextureDefinition['surface'] })}
            allowDeselect={false}
            data={[
              { value: 'floor', label: 'Floor' },
              { value: 'wall',  label: 'Wall'  },
              { value: 'both',  label: 'Both'  },
            ]}
            comboboxProps={{ withinPortal: true }}
          />
        </LabeledRow>

        <Divider my={10} />
        <Text className={classes.sectionLabel}>Visual</Text>

        <div className={classes.previewArea}>
          {draft.textureUrl
            ? <img className={classes.previewImg} src={draft.textureUrl} alt="" />
            : <div className={classes.previewEmpty} style={{ background: colorHex }}>
                <Text size="xs" c="dimmed">No image</Text>
              </div>
          }
          <Button size="xs" variant="subtle" mt={6} onClick={pickImage}>
            Replace image…
          </Button>
        </div>

        <LabeledRow label="Layout color">
          <ColorInput size="xs" value={colorHex} onChange={onColorChange} format="hex" />
        </LabeledRow>

        <LabeledRow label="Tile size">
          <NumberInput
            size="xs" min={1} max={32}
            value={draft.tileSize}
            onChange={(v) => patch({ tileSize: Number(v) || 1 })}
            description="Grid cells per texture repeat"
          />
        </LabeledRow>

        <Divider my={10} />
        <Text className={classes.sectionLabel}>Transform</Text>

        <LabeledRow label="Rotation">
          <SegmentedControl
            size="xs"
            value={String(draft.rotation)}
            onChange={(v) => patch({ rotation: Number(v) as TextureDefinition['rotation'] })}
            data={['0', '90', '180', '270']}
          />
        </LabeledRow>

        <LabeledRow label="Offset X">
          <NumberInput
            size="xs" min={0} max={1} step={0.05} decimalScale={2}
            value={draft.offsetX}
            onChange={(v) => patch({ offsetX: Number(v) || 0 })}
          />
        </LabeledRow>

        <LabeledRow label="Offset Y">
          <NumberInput
            size="xs" min={0} max={1} step={0.05} decimalScale={2}
            value={draft.offsetY}
            onChange={(v) => patch({ offsetY: Number(v) || 0 })}
          />
        </LabeledRow>
      </Stack>

      <div className={classes.footer}>
        <Button
          size="xs" color="teal"
          disabled={!isDirty || saving}
          loading={saving}
          onClick={handleSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}

function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap={8} wrap="nowrap" mb={6} align="flex-start">
      <Text className={classes.rowLabel}>{label}</Text>
      <div style={{ flex: 1 }}>{children}</div>
    </Group>
  )
}
