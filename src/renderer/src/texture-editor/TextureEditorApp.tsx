import { useState, useEffect, useCallback } from 'react'
import { Group, Text, ActionIcon, Tooltip, SegmentedControl, TextInput, Select } from '@mantine/core'
import { TextureDefinition } from '../types/map'
import { TextureCatalogSnapshot, TierFilter, emptySnapshot } from './types'
import { TextureBrowser } from './TextureBrowser'
import { TextureEditorPanel } from './TextureEditorPanel'
import { NewTextureWizard } from './NewTextureWizard'
import classes from './TextureEditorApp.module.css'

const api = window.textureAPI!

export function TextureEditorApp() {
  const [snapshot,      setSnapshot]      = useState<TextureCatalogSnapshot>(emptySnapshot())
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [tierFilter,    setTierFilter]    = useState<TierFilter>('all')
  const [surfaceFilter, setSurfaceFilter] = useState('all')
  const [search,        setSearch]        = useState('')
  const [wizardOpen,    setWizardOpen]    = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    api.getSnapshot().then((raw) => setSnapshot(raw as TextureCatalogSnapshot))
    const handler = (raw: unknown) => setSnapshot(raw as TextureCatalogSnapshot)
    api.onSnapshot(handler)
    return () => api.offSnapshot(handler)
  }, [])

  const allTextures: TextureDefinition[] = [
    ...snapshot.appTextures,
    ...snapshot.projectTextures
  ]

  const visible = allTextures.filter((t) => {
    const tierOk    = tierFilter === 'all' || t.tier === tierFilter
    const surfaceOk = surfaceFilter === 'all' || t.surface === surfaceFilter
    const searchOk  = !search || t.name.toLowerCase().includes(search.toLowerCase())
    return tierOk && surfaceOk && searchOk
  })

  const selectedTex = allTextures.find((t) => t.id === selectedId) ?? null

  const allCategories = [...new Set(allTextures.map((t) => t.category).filter(Boolean))]

  const handleSave = useCallback(async (tex: TextureDefinition) => {
    await api.saveTexture(tex)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const tex = allTextures.find((t) => t.id === id)
    if (!tex) return
    await api.deleteTexture(id, tex.tier)
    setSelectedId(null)
    setDeleteConfirm(null)
  }, [allTextures]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreated = useCallback((id: string) => {
    setWizardOpen(false)
    setSelectedId(id)
  }, [])

  return (
    <div className={classes.root}>
      {/* Left panel */}
      <div className={classes.sidebar}>
        <div className={classes.sidebarHeader}>
          <SegmentedControl
            size="xs" fullWidth
            value={tierFilter}
            onChange={(v) => setTierFilter(v as TierFilter)}
            data={[
              { label: 'All',     value: 'all' },
              { label: 'App',     value: 'app' },
              { label: 'Project', value: 'project', disabled: !snapshot.projectOpen }
            ]}
          />
          <Select
            size="xs" mt={6}
            value={surfaceFilter}
            onChange={(v) => setSurfaceFilter(v ?? 'all')}
            allowDeselect={false}
            data={[
              { value: 'all',   label: 'All surfaces' },
              { value: 'floor', label: 'Floor only'   },
              { value: 'wall',  label: 'Wall only'    },
              { value: 'both',  label: 'Both'         },
            ]}
            comboboxProps={{ withinPortal: false }}
          />
          <TextInput
            size="xs" mt={6}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>

        <div className={classes.sidebarList}>
          <TextureBrowser
            textures={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className={classes.sidebarFooter}>
          <Tooltip label="New texture">
            <ActionIcon variant="filled" color="teal" onClick={() => setWizardOpen(true)}>+</ActionIcon>
          </Tooltip>
          <Tooltip label={selectedTex ? `Delete "${selectedTex.name}"` : 'Select a texture to delete'}>
            <ActionIcon
              variant="subtle" color="red"
              disabled={!selectedTex}
              onClick={() => selectedTex && setDeleteConfirm(selectedTex.id)}
            >✕</ActionIcon>
          </Tooltip>
        </div>
      </div>

      {/* Right panel */}
      <div className={classes.main}>
        {selectedTex ? (
          <TextureEditorPanel
            key={selectedTex.id}
            texture={selectedTex}
            categories={allCategories}
            onSave={handleSave}
          />
        ) : (
          <div className={classes.empty}>
            <Text c="dimmed" size="sm">Select a texture to edit, or create a new one.</Text>
          </div>
        )}
      </div>

      {wizardOpen && (
        <NewTextureWizard
          snapshot={snapshot}
          onCreated={handleCreated}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {deleteConfirm && (
        <div className={classes.overlay}>
          <div className={classes.confirmDialog}>
            <Text mb={12}>
              Delete <strong>{allTextures.find((t) => t.id === deleteConfirm)?.name}</strong>? This cannot be undone.
            </Text>
            <Group justify="flex-end">
              <ActionIcon variant="subtle" color="gray" size="md" onClick={() => setDeleteConfirm(null)}>Cancel</ActionIcon>
              <ActionIcon variant="filled" color="red"  size="md" onClick={() => handleDelete(deleteConfirm)}>Delete</ActionIcon>
            </Group>
          </div>
        </div>
      )}
    </div>
  )
}
