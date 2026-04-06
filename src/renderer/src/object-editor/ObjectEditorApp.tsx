import { useState, useEffect, useCallback } from 'react'
import { Group, Text, ActionIcon, Tooltip, SegmentedControl, TextInput, Menu, Button } from '@mantine/core'
import { ObjectDefinition } from '../types/map'
import { CatalogSnapshot, TierFilter, emptySnapshot } from './types'
import { CatalogBrowser } from './CatalogBrowser'
import { ObjectEditorPanel } from './ObjectEditorPanel'
import { NewObjectWizard } from './NewObjectWizard'
import classes from './ObjectEditorApp.module.css'

const api = window.catalogAPI!

export function ObjectEditorApp() {
  const [snapshot,    setSnapshot]    = useState<CatalogSnapshot>(emptySnapshot())
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [tierFilter,  setTierFilter]  = useState<TierFilter>('all')
  const [search,      setSearch]      = useState('')
  const [wizardOpen,  setWizardOpen]  = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Load initial snapshot
  useEffect(() => {
    api.getSnapshot().then((raw) => setSnapshot(raw as CatalogSnapshot))

    const handler = (raw: unknown) => setSnapshot(raw as CatalogSnapshot)
    api.onSnapshot(handler)
    return () => api.offSnapshot(handler)
  }, [])

  const allObjects: ObjectDefinition[] = [
    ...snapshot.appObjects,
    ...snapshot.projectObjects
  ]

  const visibleObjects = allObjects.filter((o) => {
    const tierOk = tierFilter === 'all' || o.tier === tierFilter
    const searchOk = !search || o.name.toLowerCase().includes(search.toLowerCase())
    return tierOk && searchOk
  })

  const selectedObj = allObjects.find((o) => o.id === selectedId) ?? null

  const tokenCategories = [...new Set([
    ...snapshot.appTokenCategories,
    ...snapshot.projectTokenCategories
  ])]
  const propCategories = [...new Set([
    ...snapshot.appPropCategories,
    ...snapshot.projectPropCategories
  ])]

  const handleSave = useCallback(async (obj: ObjectDefinition) => {
    await api.saveObject(obj)
    // Snapshot will be pushed back via onSnapshot
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const obj = allObjects.find((o) => o.id === id)
    if (!obj) return
    await api.deleteObject(id, obj.tier)
    setSelectedId(null)
    setDeleteConfirm(null)
  }, [allObjects])

  const handleCreated = useCallback((id: string) => {
    setWizardOpen(false)
    setSelectedId(id)
  }, [])

  const handleExport = useCallback(async (filter: 'all' | 'app' | 'project') => {
    await api.exportZip(filter)
  }, [])

  const handleImport = useCallback(async (mode: 'merge' | 'replace', tier: 'app' | 'project') => {
    await api.importZip(mode, tier)
  }, [])

  return (
    <div className={classes.root}>
      {/* Left panel */}
      <div className={classes.sidebar}>
        <div className={classes.sidebarHeader}>
          <SegmentedControl
            size="xs"
            fullWidth
            value={tierFilter}
            onChange={(v) => setTierFilter(v as TierFilter)}
            data={[
              { label: 'All',     value: 'all'     },
              { label: 'App',     value: 'app'     },
              { label: 'Project', value: 'project', disabled: !snapshot.projectOpen }
            ]}
          />
          <TextInput
            size="xs"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            mt={6}
          />
        </div>

        <div className={classes.sidebarList}>
          <CatalogBrowser
            objects={visibleObjects}
            tokenCategories={tokenCategories}
            propCategories={propCategories}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className={classes.sidebarFooter}>
          <Tooltip label="New object">
            <ActionIcon variant="filled" color="teal" onClick={() => setWizardOpen(true)}>+</ActionIcon>
          </Tooltip>
          <Tooltip label={selectedObj ? `Delete "${selectedObj.name}"` : 'Select an object to delete'}>
            <ActionIcon
              variant="subtle" color="red"
              disabled={!selectedObj}
              onClick={() => selectedObj && setDeleteConfirm(selectedObj.id)}
            >✕</ActionIcon>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Menu shadow="md" width={200} position="top-end">
            <Menu.Target>
              <Tooltip label="Import / Export">
                <ActionIcon variant="subtle" color="gray">⬆⬇</ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Export</Menu.Label>
              <Menu.Item onClick={() => handleExport('all')}>Export all as ZIP…</Menu.Item>
              <Menu.Item onClick={() => handleExport('app')}>Export app objects…</Menu.Item>
              <Menu.Item onClick={() => handleExport('project')} disabled={!snapshot.projectOpen}>Export project objects…</Menu.Item>
              <Menu.Divider />
              <Menu.Label>Import</Menu.Label>
              <Menu.Item onClick={() => handleImport('merge', 'app')}>Import → App (merge)…</Menu.Item>
              <Menu.Item onClick={() => handleImport('replace', 'app')}>Import → App (replace)…</Menu.Item>
              <Menu.Item onClick={() => handleImport('merge', 'project')} disabled={!snapshot.projectOpen}>Import → Project (merge)…</Menu.Item>
              <Menu.Item onClick={() => handleImport('replace', 'project')} disabled={!snapshot.projectOpen}>Import → Project (replace)…</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>

      {/* Right panel */}
      <div className={classes.main}>
        {selectedObj ? (
          <ObjectEditorPanel
            key={selectedObj.id}
            object={selectedObj}
            tokenCategories={tokenCategories}
            propCategories={propCategories}
            onSave={handleSave}
          />
        ) : (
          <div className={classes.empty}>
            <Text c="dimmed" size="sm">Select an object to edit, or create a new one.</Text>
          </div>
        )}
      </div>

      {/* New object wizard */}
      {wizardOpen && (
        <NewObjectWizard
          snapshot={snapshot}
          onCreated={handleCreated}
          onClose={() => setWizardOpen(false)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className={classes.overlay}>
          <div className={classes.confirmDialog}>
            <Text mb={12}>Delete <strong>{allObjects.find((o) => o.id === deleteConfirm)?.name}</strong>? This cannot be undone.</Text>
            <Group justify="flex-end">
              <ActionIcon variant="subtle" color="gray" size="md" onClick={() => setDeleteConfirm(null)}>Cancel</ActionIcon>
              <ActionIcon variant="filled" color="red" size="md" onClick={() => handleDelete(deleteConfirm)}>Delete</ActionIcon>
            </Group>
          </div>
        </div>
      )}
    </div>
  )
}
