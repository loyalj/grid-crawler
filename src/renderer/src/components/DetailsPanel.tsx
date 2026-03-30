import { Stack, Text, Divider, Select, NumberInput } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import {
  Room, Hallway, Level,
  LevelSettings, SurfaceSettings,
  FloorMaterial, WallMaterial
} from '../types/map'
import {
  UpdateRoomSettingsCommand,
  UpdateHallwaySettingsCommand,
  UpdateHallwayWidthCommand,
  RerouteHallwayCommand
} from '../engine/commands'
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
        <Text className={classes.title} title={room.name}>{room.name || 'Unnamed Room'}</Text>
        <Text size="xs" c="dimmed">{levelSettings.gridWidth}×{levelSettings.gridHeight}</Text>
      </div>
      <Stack gap={0} p={8}>
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

        {room.description && (
          <>
            <Divider my={8} />
            <Text className={classes.sectionLabel}>Description</Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{room.description}</Text>
          </>
        )}
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
  const project       = useMapStore((s) => s.project)
  const activeLevelId = useMapStore((s) => s.activeLevelId)
  const selectedId    = useMapStore((s) => s.selectedId)

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

  return (
    <div className={classes.panel}>
      <Text size="xs" c="dimmed" fs="italic" p="xs">Nothing selected</Text>
    </div>
  )
}
