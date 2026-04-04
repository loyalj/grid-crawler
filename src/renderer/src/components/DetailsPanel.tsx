import React, { useRef } from 'react'
import { Stack, Text, Divider, Select, NumberInput, TextInput, Textarea, Switch, Button, Group } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import {
  Room, Hallway, Level,
  LevelSettings, SurfaceSettings,
  FloorMaterial, WallMaterial,
  ObjectPlacement, ObjectDefinition, TokenDefinition, PropPlacement,
  Player
} from '../types/map'
import {
  UpdateRoomSettingsCommand,
  UpdateRoomLabelCommand,
  UpdateRoomNotesCommand,
  UpdateHallwaySettingsCommand,
  UpdateHallwayWidthCommand,
  RerouteHallwayCommand,
  UpdateObjectPropertiesCommand,
  RotatePropCommand,
  UpdateProjectMetadataCommand,
  UpdatePlayerCommand,
  UpdatePlayerPlacementCommand
} from '../engine/commands'
import { PortraitCropModal } from './PortraitCropModal'
import classes from './DetailsPanel.module.css'

// ── Option lists ──────────────────────────────────────────────────────────────

const FLOOR_OPTIONS: { value: FloorMaterial; label: string }[] = [
  { value: 'stone', label: 'Stone' },
  { value: 'wood',  label: 'Wood'  },
  { value: 'dirt',  label: 'Dirt'  },
  { value: 'water', label: 'Water' },
  { value: 'lava',  label: 'Lava'  },
  { value: 'pit',   label: 'Pit'   },
]

const WALL_OPTIONS: { value: WallMaterial; label: string }[] = [
  { value: 'stone', label: 'Stone' },
  { value: 'wood',  label: 'Wood'  },
  { value: 'brick', label: 'Brick' },
  { value: 'cave',  label: 'Cave'  },
]

const LIGHT_OPTIONS = [
  { value: 'bright', label: 'Bright' },
  { value: 'dim',    label: 'Dim'    },
  { value: 'dark',   label: 'Dark'   },
]

const CEILING_OPTIONS = [
  { value: '1', label: '1 u' },
  { value: '2', label: '2 u' },
  { value: '3', label: '3 u' },
  { value: '4', label: '4 u' },
]

// ── Shared layout helpers ─────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={classes.row}>
      <Text className={classes.rowLabel}>{label}</Text>
      <Text className={classes.rowValue}>{value}</Text>
    </div>
  )
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={classes.controlRow}>
      <Text className={classes.controlLabel}>{label}</Text>
      <div className={classes.controlField}>{children}</div>
    </div>
  )
}

// Prepend an "inherit" option that shows the resolved level default.
function withInherit<T extends string>(
  options: { value: T; label: string }[],
  resolvedDefault: string
): { value: string; label: string }[] {
  return [{ value: '', label: `↑ ${resolvedDefault}` }, ...options]
}

// ── Settings helpers ──────────────────────────────────────────────────────────

/** Remove `key` from partial settings (= inherit from level). */
function clearKey<K extends keyof SurfaceSettings>(
  settings: Partial<SurfaceSettings>,
  key: K
): Partial<SurfaceSettings> {
  const copy = { ...settings }
  delete copy[key]
  return copy
}

// ── Room details ──────────────────────────────────────────────────────────────

function RoomDetails({
  room,
  levelId,
  levelSettings,
}: {
  room:          Room
  levelId:       string
  levelSettings: LevelSettings
}) {
  const [label,     setLabel]     = React.useState(room.label ?? '')
  const [showLabel, setShowLabel] = React.useState(room.showLabel ?? false)
  const [notes,     setNotes]     = React.useState(room.notes ?? '')

  React.useEffect(() => {
    setLabel(room.label ?? '')
    setShowLabel(room.showLabel ?? false)
    setNotes(room.notes ?? '')
  }, [room.id, room.label, room.showLabel, room.notes])

  function commitLabel(nextLabel = label, nextShow = showLabel) {
    const trimmed = nextLabel.trimEnd()
    if (trimmed === (room.label ?? '') && nextShow === (room.showLabel ?? false)) return
    useMapStore.getState().dispatch(new UpdateRoomLabelCommand(
      levelId, room.id,
      { label: room.label ?? '', showLabel: room.showLabel ?? false },
      { label: trimmed, showLabel: nextShow }
    ))
  }

  function commitNotes() {
    const trimmed = notes.trimEnd()
    if (trimmed === (room.notes ?? '')) return
    useMapStore.getState().dispatch(new UpdateRoomNotesCommand(levelId, room.id, room.notes ?? '', trimmed))
  }

  function dispatch(before: Partial<SurfaceSettings>, after: Partial<SurfaceSettings>) {
    useMapStore.getState().dispatch(
      new UpdateRoomSettingsCommand(levelId, room.id, before, after)
    )
  }

  function onFloor(v: string | null) {
    const val = v ?? ''
    dispatch(
      room.settings,
      val === '' ? clearKey(room.settings, 'floorMaterial') : { ...room.settings, floorMaterial: val as FloorMaterial }
    )
  }

  function onWall(v: string | null) {
    const val = v ?? ''
    dispatch(
      room.settings,
      val === '' ? clearKey(room.settings, 'wallMaterial') : { ...room.settings, wallMaterial: val as WallMaterial }
    )
  }

  function onCeiling(v: string | null) {
    const val = v ?? ''
    dispatch(
      room.settings,
      val === '' ? clearKey(room.settings, 'ceilingHeight') : { ...room.settings, ceilingHeight: parseInt(val) as 1 | 2 | 3 | 4 }
    )
  }

  function onLight(v: string | null) {
    const val = v ?? ''
    dispatch(
      room.settings,
      val === '' ? clearKey(room.settings, 'lightLevel') : { ...room.settings, lightLevel: val as SurfaceSettings['lightLevel'] }
    )
  }

  const s = room.settings
  const ls = levelSettings

  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title} title={room.label || room.name}>
          {room.label || room.name || 'Unnamed Room'}
        </Text>
        <Text size="xs" c="dimmed">{room.name}</Text>
      </div>
      <Stack gap={0} p={8}>
        <Text className={classes.sectionLabel}>Label</Text>
        <TextInput
          size="xs"
          placeholder={room.name}
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onBlur={() => commitLabel()}
        />
        <Switch
          mt={6}
          size="xs"
          label="Show on map"
          checked={showLabel}
          onChange={(e) => {
            const v = e.currentTarget.checked
            setShowLabel(v)
            commitLabel(label, v)
          }}
        />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Geometry</Text>
        <Row label="Position" value={`${room.x}, ${room.y}`} />
        <Row label="Size"     value={`${room.width} × ${room.height} cells`} />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Settings</Text>

        <ControlRow label="Floor">
          <Select
            size="xs"
            data={withInherit(FLOOR_OPTIONS, ls.floorMaterial)}
            value={s.floorMaterial ?? ''}
            onChange={onFloor}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <ControlRow label="Wall">
          <Select
            size="xs"
            data={withInherit(WALL_OPTIONS, ls.wallMaterial)}
            value={s.wallMaterial ?? ''}
            onChange={onWall}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <ControlRow label="Ceiling">
          <Select
            size="xs"
            data={withInherit(CEILING_OPTIONS, `${ls.ceilingHeight} u`)}
            value={s.ceilingHeight !== undefined ? String(s.ceilingHeight) : ''}
            onChange={onCeiling}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <ControlRow label="Light">
          <Select
            size="xs"
            data={withInherit(LIGHT_OPTIONS, ls.lightLevel)}
            value={s.lightLevel ?? ''}
            onChange={onLight}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <Divider my={8} />
        <Text className={classes.sectionLabel}>GM Notes</Text>
        <Textarea
          size="xs"
          autosize
          minRows={2}
          maxRows={8}
          placeholder="Private notes (not shown on map)"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          onBlur={commitNotes}
        />
      </Stack>
    </Stack>
  )
}

// ── Hallway details ───────────────────────────────────────────────────────────

function HallwayDetails({
  hallway,
  levelId,
  levelSettings,
  rooms,
}: {
  hallway:       Hallway
  levelId:       string
  levelSettings: LevelSettings
  rooms:         Room[]
}) {
  function onRoomA(newId: string | null) {
    if (!newId || newId === hallway.roomAId) return
    useMapStore.getState().dispatch(new RerouteHallwayCommand(
      levelId,
      hallway.id,
      { roomAId: hallway.roomAId, roomBId: hallway.roomBId,
        exitA: hallway.exitA, exitB: hallway.exitB,
        waypoints: hallway.waypoints.slice() },
      { roomAId: newId, roomBId: hallway.roomBId }
    ))
  }

  function onRoomB(newId: string | null) {
    if (!newId || newId === hallway.roomBId) return
    useMapStore.getState().dispatch(new RerouteHallwayCommand(
      levelId,
      hallway.id,
      { roomAId: hallway.roomAId, roomBId: hallway.roomBId,
        exitA: hallway.exitA, exitB: hallway.exitB,
        waypoints: hallway.waypoints.slice() },
      { roomAId: hallway.roomAId, roomBId: newId }
    ))
  }

  function onWidth(v: number | string) {
    const n = typeof v === 'number' ? v : parseInt(String(v))
    if (isNaN(n)) return
    const clamped = Math.min(5, Math.max(1, n)) as Hallway['width']
    if (clamped === hallway.width) return
    useMapStore.getState().dispatch(
      new UpdateHallwayWidthCommand(levelId, hallway.id, hallway.width, clamped)
    )
  }

  function dispatchSettings(before: Partial<SurfaceSettings>, after: Partial<SurfaceSettings>) {
    useMapStore.getState().dispatch(
      new UpdateHallwaySettingsCommand(levelId, hallway.id, before, after)
    )
  }

  function onFloor(v: string | null) {
    const val = v ?? ''
    dispatchSettings(
      hallway.settings,
      val === '' ? clearKey(hallway.settings, 'floorMaterial') : { ...hallway.settings, floorMaterial: val as FloorMaterial }
    )
  }

  function onWall(v: string | null) {
    const val = v ?? ''
    dispatchSettings(
      hallway.settings,
      val === '' ? clearKey(hallway.settings, 'wallMaterial') : { ...hallway.settings, wallMaterial: val as WallMaterial }
    )
  }

  function onLight(v: string | null) {
    const val = v ?? ''
    dispatchSettings(
      hallway.settings,
      val === '' ? clearKey(hallway.settings, 'lightLevel') : { ...hallway.settings, lightLevel: val as SurfaceSettings['lightLevel'] }
    )
  }

  // Room options — each dropdown excludes the currently-selected opposite room
  const roomsForA = rooms
    .filter((r) => r.id !== hallway.roomBId)
    .map((r) => ({ value: r.id, label: r.name || 'Unnamed Room' }))
  const roomsForB = rooms
    .filter((r) => r.id !== hallway.roomAId)
    .map((r) => ({ value: r.id, label: r.name || 'Unnamed Room' }))

  const s  = hallway.settings
  const ls = levelSettings

  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title}>Hallway</Text>
      </div>
      <Stack gap={0} p={8}>
        <Text className={classes.sectionLabel}>Connections</Text>

        <ControlRow label="From">
          <Select
            size="xs"
            data={roomsForA}
            value={hallway.roomAId}
            onChange={onRoomA}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <ControlRow label="To">
          <Select
            size="xs"
            data={roomsForB}
            value={hallway.roomBId}
            onChange={onRoomB}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Geometry</Text>

        <ControlRow label="Width">
          <NumberInput
            size="xs"
            min={1}
            max={5}
            value={hallway.width}
            onChange={onWidth}
            allowDecimal={false}
            clampBehavior="strict"
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <Row label="Waypoints" value={`${hallway.waypoints.length}`} />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Settings</Text>

        <ControlRow label="Floor">
          <Select
            size="xs"
            data={withInherit(FLOOR_OPTIONS, ls.floorMaterial)}
            value={s.floorMaterial ?? ''}
            onChange={onFloor}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <ControlRow label="Wall">
          <Select
            size="xs"
            data={withInherit(WALL_OPTIONS, ls.wallMaterial)}
            value={s.wallMaterial ?? ''}
            onChange={onWall}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>

        <ControlRow label="Light">
          <Select
            size="xs"
            data={withInherit(LIGHT_OPTIONS, ls.lightLevel)}
            value={s.lightLevel ?? ''}
            onChange={onLight}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: classes.selectInput }}
          />
        </ControlRow>
      </Stack>
    </Stack>
  )
}

// ── Object / Prop details ─────────────────────────────────────────────────────

const ROTATION_OPTIONS = [
  { value: '0',   label: '0°'   },
  { value: '90',  label: '90°'  },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
]

function ObjectDetails({
  placement,
  def,
  levelId,
}: {
  placement: ObjectPlacement
  def:       ObjectDefinition
  levelId:   string
}) {
  // Merge definition property defaults with instance overrides
  const merged: Record<string, string> = {}
  for (const p of def.properties) merged[p.name] = p.defaultValue
  for (const [k, v] of Object.entries(placement.propertyValues)) merged[k] = v

  function onPropertyChange(name: string, value: string) {
    const newValues = { ...placement.propertyValues, [name]: value }
    useMapStore.getState().dispatch(
      new UpdateObjectPropertiesCommand(levelId, placement.id, placement.propertyValues, newValues)
    )
  }

  function onRotation(v: string | null) {
    if (placement.kind !== 'prop') return
    const rot = parseInt(v ?? '0') as PropPlacement['rotation']
    if (rot === placement.rotation) return
    useMapStore.getState().dispatch(
      new RotatePropCommand(levelId, placement.id, placement.rotation, rot)
    )
  }

  const kindLabel = def.kind === 'token' ? 'Token' : 'Prop'
  const catLabel  = def.category.charAt(0).toUpperCase() + def.category.slice(1)

  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title} title={def.name}>{def.name}</Text>
        <Text size="xs" c="dimmed">{kindLabel} · {catLabel}</Text>
      </div>
      <Stack gap={0} p={8}>

        <Text className={classes.sectionLabel}>Position</Text>
        <Row label="X" value={placement.x.toFixed(2)} />
        <Row label="Y" value={placement.y.toFixed(2)} />

        {placement.kind === 'prop' && (
          <>
            <Divider my={8} />
            <Text className={classes.sectionLabel}>Transform</Text>
            <ControlRow label="Rotation">
              <Select
                size="xs"
                data={ROTATION_OPTIONS}
                value={String(placement.rotation)}
                onChange={onRotation}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                classNames={{ input: classes.selectInput }}
              />
            </ControlRow>
          </>
        )}

        {def.properties.length > 0 && (
          <>
            <Divider my={8} />
            <Text className={classes.sectionLabel}>Properties</Text>
            {def.properties.map((prop) => (
              <ControlRow key={prop.name} label={prop.name}>
                <TextInput
                  size="xs"
                  value={merged[prop.name] ?? ''}
                  onChange={(e) => onPropertyChange(prop.name, e.currentTarget.value)}
                  classNames={{ input: classes.selectInput }}
                />
              </ControlRow>
            ))}
          </>
        )}

        {def.description && (
          <>
            <Divider my={8} />
            <Text className={classes.sectionLabel}>Description</Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{def.description}</Text>
          </>
        )}
      </Stack>
    </Stack>
  )
}

// ── Project details ───────────────────────────────────────────────────────────

function ProjectDetails({ project }: { project: import('../types/map').MapProject }) {
  const dispatch = useMapStore((s) => s.dispatch)

  const [name,        setName]        = React.useState(project.name)
  const [version,     setVersion]     = React.useState(project.version)
  const [description, setDescription] = React.useState(project.metadata.description ?? '')
  const [author,      setAuthor]      = React.useState(project.metadata.author ?? '')
  const [system,      setSystem]      = React.useState(project.metadata.system ?? '')
  const [tags,        setTags]        = React.useState((project.metadata.tags ?? []).join(', '))

  // Keep local state in sync if the project is replaced (e.g. after open/undo)
  React.useEffect(() => {
    setName(project.name)
    setVersion(project.version)
    setDescription(project.metadata.description ?? '')
    setAuthor(project.metadata.author ?? '')
    setSystem(project.metadata.system ?? '')
    setTags((project.metadata.tags ?? []).join(', '))
  }, [project.id])

  function commit(overrides: {
    name?: string; version?: string
    description?: string; author?: string; system?: string; tags?: string
  }) {
    const resolvedTags = (overrides.tags ?? tags)
      .split(',').map((t) => t.trim()).filter(Boolean)
    const after = {
      name:     overrides.name    ?? name,
      version:  overrides.version ?? version,
      metadata: {
        ...project.metadata,
        description: overrides.description ?? description,
        author:      overrides.author      ?? author,
        system:      overrides.system      ?? system,
        tags:        resolvedTags
      }
    }
    const before = {
      name:     project.name,
      version:  project.version,
      metadata: project.metadata
    }
    // Only dispatch if something actually changed
    if (
      after.name === before.name &&
      after.version === before.version &&
      JSON.stringify(after.metadata) === JSON.stringify(before.metadata)
    ) return
    dispatch(new UpdateProjectMetadataCommand(before, after))
  }

  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title}>Project Info</Text>
      </div>
      <Stack gap={8} p={8}>
        <TextInput
          label="Name"
          size="xs"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={() => commit({ name })}
        />
        <TextInput
          label="Version"
          size="xs"
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          onBlur={() => commit({ version })}
        />
        <Divider />
        <TextInput
          label="Author"
          size="xs"
          value={author}
          onChange={(e) => setAuthor(e.currentTarget.value)}
          onBlur={() => commit({ author })}
        />
        <TextInput
          label="System"
          placeholder="e.g. D&D 5e, Pathfinder"
          size="xs"
          value={system}
          onChange={(e) => setSystem(e.currentTarget.value)}
          onBlur={() => commit({ system })}
        />
        <Textarea
          label="Description"
          size="xs"
          autosize
          minRows={2}
          maxRows={6}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          onBlur={() => commit({ description })}
        />
        <TextInput
          label="Tags"
          description="Comma-separated"
          size="xs"
          value={tags}
          onChange={(e) => setTags(e.currentTarget.value)}
          onBlur={() => commit({ tags })}
        />
      </Stack>
    </Stack>
  )
}

// ── Player details ────────────────────────────────────────────────────────────

function PlayerDetails({ player }: { player: Player }) {
  const dispatch        = useMapStore((s) => s.dispatch)
  const project         = useMapStore((s) => s.project)
  const setActiveTool   = useMapStore((s) => s.setActiveTool)
  const setArmedPlayer  = useMapStore((s) => s.setArmedPlayer)

  const [name,  setName]  = React.useState(player.name)
  const [notes, setNotes] = React.useState(player.notes)

  // Crop modal state
  const [cropSrc,    setCropSrc]    = React.useState<string | null>(null)
  const [cropOpened, setCropOpened] = React.useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setName(player.name)
    setNotes(player.notes)
  }, [player.id, player.name, player.notes])

  function commitName() {
    const trimmed = name.trimEnd()
    if (trimmed === player.name) return
    dispatch(new UpdatePlayerCommand(player.id, { name: trimmed, notes: player.notes, portrait: player.portrait }))
  }

  function commitNotes() {
    const trimmed = notes.trimEnd()
    if (trimmed === player.notes) return
    dispatch(new UpdatePlayerCommand(player.id, { name: player.name, notes: trimmed, portrait: player.portrait }))
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
    setCropOpened(true)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  function onCropConfirm(dataUrl: string) {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropOpened(false)
    dispatch(new UpdatePlayerCommand(player.id, { name: player.name, notes: player.notes, portrait: dataUrl }))
  }

  function onCropClose() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropOpened(false)
  }

  function handlePlace() {
    setArmedPlayer(player.id)
    setActiveTool('player_place')
  }

  function handleUnplace() {
    dispatch(new UpdatePlayerPlacementCommand(player.id, null))
  }

  // Placement hint
  let placementLabel = 'Unplaced'
  if (player.placement && project) {
    const { levelId, x, y } = player.placement
    const levelName = project.overworld.id === levelId
      ? project.overworld.name
      : project.dungeonLevels.find((l) => l.id === levelId)?.name ?? 'Unknown level'
    placementLabel = `${levelName} (${Math.round(x)}, ${Math.round(y)})`
  }

  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title}>{player.name || 'Unnamed Player'}</Text>
      </div>
      <Stack gap={8} p={8}>

        <TextInput
          label="Name"
          size="xs"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={commitName}
        />

        <Divider />

        {/* Portrait */}
        <Text className={classes.sectionLabel}>Portrait</Text>
        {player.portrait && (
          <img
            src={player.portrait}
            alt="portrait"
            style={{
              width: 80, height: 80,
              borderRadius: 6,
              objectFit: 'cover',
              border: '1px solid var(--mantine-color-dark-3)'
            }}
          />
        )}
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            onClick={() => fileInputRef.current?.click()}
          >
            {player.portrait ? 'Change portrait' : 'Choose portrait'}
          </Button>
          {player.portrait && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={() => dispatch(new UpdatePlayerCommand(player.id, { name: player.name, notes: player.notes, portrait: null }))}
            >
              Remove
            </Button>
          )}
        </Group>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />

        <Divider />

        {/* Placement */}
        <Text className={classes.sectionLabel}>Placement</Text>
        <Text size="xs" c="dimmed">{placementLabel}</Text>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={handlePlace}>
            {player.placement ? 'Move on map' : 'Place on map'}
          </Button>
          {player.placement && (
            <Button size="xs" variant="subtle" color="red" onClick={handleUnplace}>
              Unplace
            </Button>
          )}
        </Group>

        <Divider />

        <Textarea
          label="Notes"
          size="xs"
          autosize
          minRows={2}
          maxRows={8}
          placeholder="GM notes (private)"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          onBlur={commitNotes}
        />
      </Stack>

      {cropSrc && (
        <PortraitCropModal
          opened={cropOpened}
          imageUrl={cropSrc}
          onConfirm={onCropConfirm}
          onClose={onCropClose}
        />
      )}
    </Stack>
  )
}

// ── Level details (read-only) ─────────────────────────────────────────────────

function LevelDetails({ level }: { level: Level }) {
  const s = level.settings
  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title} title={level.name}>{level.name}</Text>
        <Text size="xs" c="dimmed">{level.depth === 0 ? 'Overworld' : `Depth ${level.depth}`}</Text>
      </div>
      <Stack gap={0} p={8}>
        <Text className={classes.sectionLabel}>Grid</Text>
        <Row label="Size"     value={`${s.gridWidth} × ${s.gridHeight}`} />
        <Row label="Rooms"    value={`${level.rooms.length}`} />
        <Row label="Hallways" value={`${level.hallways.length}`} />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Default Settings</Text>
        <Row label="Floor"   value={s.floorMaterial} />
        <Row label="Wall"    value={s.wallMaterial} />
        <Row label="Ceiling" value={`${s.ceilingHeight} u`} />
        <Row label="Light"   value={s.lightLevel} />
      </Stack>
    </Stack>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DetailsPanel() {
  const project          = useMapStore((s) => s.project)
  const activeLevelId    = useMapStore((s) => s.activeLevelId)
  const selectedId       = useMapStore((s) => s.selectedId)
  const projectSelected  = useMapStore((s) => s.projectSelected)
  const selectedPlayerId = useMapStore((s) => s.selectedPlayerId)
  const appCatalog       = useMapStore((s) => s.appCatalog)

  const activeLevel = project
    ? activeLevelId === project.overworld.id
      ? project.overworld
      : project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null
    : null

  if (!project || !activeLevel || !activeLevelId) {
    return (
      <div className={classes.panel}>
        <Text size="xs" c="dimmed" fs="italic" p="xs">No map open</Text>
      </div>
    )
  }

  if (projectSelected) {
    return (
      <div className={classes.panel}>
        <ProjectDetails project={project} />
      </div>
    )
  }

  if (selectedPlayerId) {
    const player = project.players.find((p) => p.id === selectedPlayerId)
    if (player) {
      return (
        <div className={classes.panel}>
          <PlayerDetails player={player} />
        </div>
      )
    }
  }

  if (!selectedId) {
    return (
      <div className={classes.panel}>
        <LevelDetails level={activeLevel} />
      </div>
    )
  }

  const room = activeLevel.rooms.find((r) => r.id === selectedId)
  if (room) {
    return (
      <div className={classes.panel}>
        <RoomDetails
          room={room}
          levelId={activeLevelId}
          levelSettings={activeLevel.settings}
        />
      </div>
    )
  }

  const hallway = activeLevel.hallways.find((h) => h.id === selectedId)
  if (hallway) {
    return (
      <div className={classes.panel}>
        <HallwayDetails
          hallway={hallway}
          levelId={activeLevelId}
          levelSettings={activeLevel.settings}
          rooms={activeLevel.rooms}
        />
      </div>
    )
  }

  const placement = activeLevel.placements.find((p) => p.id === selectedId)
  if (placement) {
    const catalog = [...appCatalog, ...(project.projectCatalog ?? [])]
    const def = catalog.find((d) => d.id === placement.definitionId)
    if (def) {
      return (
        <div className={classes.panel}>
          <ObjectDetails placement={placement} def={def} levelId={activeLevelId} />
        </div>
      )
    }
  }

  return (
    <div className={classes.panel}>
      <Text size="xs" c="dimmed" fs="italic" p="xs">Nothing selected</Text>
    </div>
  )
}
