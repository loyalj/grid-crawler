import { Stack, Text, Divider } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import { Room, Hallway, Level } from '../types/map'
import classes from './DetailsPanel.module.css'

// ── Sub-views ─────────────────────────────────────────────────────────────────

function NoSelection() {
  return (
    <Stack p="xs" gap={4}>
      <Text size="xs" c="dimmed" fs="italic">Nothing selected</Text>
      <Text size="xs" c="dimmed">Click a room or hallway to see its details.</Text>
    </Stack>
  )
}

function RoomDetails({ room, levelName }: { room: Room; levelName: string }) {
  const s = room.settings
  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title} title={room.name}>{room.name || 'Unnamed Room'}</Text>
        <Text size="xs" c="dimmed">{levelName}</Text>
      </div>
      <Stack gap={0} p={8}>
        <Text className={classes.sectionLabel}>Geometry</Text>
        <Row label="Position"  value={`${room.x}, ${room.y}`} />
        <Row label="Size"      value={`${room.width} × ${room.height} cells`} />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Settings</Text>
        <Row label="Floor"    value={s.floorMaterial   ?? '(level default)'} />
        <Row label="Wall"     value={s.wallMaterial    ?? '(level default)'} />
        <Row label="Ceiling"  value={s.ceilingHeight !== undefined ? `${s.ceilingHeight} u` : '(level default)'} />
        <Row label="Light"    value={s.lightLevel      ?? '(level default)'} />

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

function HallwayDetails({ hallway, levelName, roomAName, roomBName }: {
  hallway:   Hallway
  levelName: string
  roomAName: string
  roomBName: string
}) {
  const s = hallway.settings
  return (
    <Stack gap={0}>
      <div className={classes.header}>
        <Text className={classes.title}>Hallway</Text>
        <Text size="xs" c="dimmed">{levelName}</Text>
      </div>
      <Stack gap={0} p={8}>
        <Text className={classes.sectionLabel}>Connections</Text>
        <Row label="From" value={roomAName} />
        <Row label="To"   value={roomBName} />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Geometry</Text>
        <Row label="Width"     value={`${hallway.width} cell${hallway.width > 1 ? 's' : ''}`} />
        <Row label="Waypoints" value={`${hallway.waypoints.length}`} />

        <Divider my={8} />
        <Text className={classes.sectionLabel}>Settings</Text>
        <Row label="Floor"   value={s.floorMaterial  ?? '(level default)'} />
        <Row label="Wall"    value={s.wallMaterial   ?? '(level default)'} />
        <Row label="Light"   value={s.lightLevel     ?? '(level default)'} />
      </Stack>
    </Stack>
  )
}

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
        <Row label="Size"  value={`${s.gridWidth} × ${s.gridHeight}`} />
        <Row label="Rooms" value={`${level.rooms.length}`} />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={classes.row}>
      <Text className={classes.rowLabel}>{label}</Text>
      <Text className={classes.rowValue}>{value}</Text>
    </div>
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

  if (!project || !activeLevel) {
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
        <RoomDetails room={room} levelName={activeLevel.name} />
      </div>
    )
  }

  const hallway = activeLevel.hallways.find((h) => h.id === selectedId)
  if (hallway) {
    const roomA = activeLevel.rooms.find((r) => r.id === hallway.roomAId)
    const roomB = activeLevel.rooms.find((r) => r.id === hallway.roomBId)
    return (
      <div className={classes.panel}>
        <HallwayDetails
          hallway={hallway}
          levelName={activeLevel.name}
          roomAName={roomA?.name ?? 'Unknown'}
          roomBName={roomB?.name ?? 'Unknown'}
        />
      </div>
    )
  }

  return (
    <div className={classes.panel}>
      <NoSelection />
    </div>
  )
}
