import { useState } from 'react'
import { Text, UnstyledButton, Badge, Group } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import { Level } from '../types/map'
import classes from './LevelNav.module.css'

// ── Chevron icon ──────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={classes.chevron}
      data-open={open || undefined}
      width="10" height="10" viewBox="0 0 10 10"
      fill="currentColor"
    >
      <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// ── Level tree node ───────────────────────────────────────────────────────────

function LevelTree({ level }: { level: Level }) {
  const activeLevelId      = useMapStore((s) => s.activeLevelId)
  const selectedId         = useMapStore((s) => s.selectedId)
  const setActiveLevel     = useMapStore((s) => s.setActiveLevel)
  const setSelected        = useMapStore((s) => s.setSelected)


  const isActiveLevel = activeLevelId === level.id
  const [open, setOpen] = useState(isActiveLevel)

  const hasChildren = level.rooms.length > 0 || level.hallways.length > 0

  const selectLevel = () => {
    setActiveLevel(level.id)
    setSelected(null)
    setOpen(true)
  }

  const selectItem = (id: string) => {
    setActiveLevel(level.id)
    setSelected(id)
  }

  return (
    <div className={classes.levelNode}>
      {/* Level row */}
      <Group gap={0} wrap="nowrap" className={classes.levelRow} data-active={isActiveLevel && !selectedId || undefined}>
        <UnstyledButton
          className={classes.expandBtn}
          onClick={() => setOpen((o) => !o)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          <Chevron open={open} />
        </UnstyledButton>

        <UnstyledButton className={classes.levelLabel} onClick={selectLevel} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={5} wrap="nowrap">
            <Badge
              size="xs"
              variant="outline"
              color={level.depth === 0 ? 'yellow' : 'gray'}
              style={{ flexShrink: 0, fontSize: 9 }}
            >
              {level.depth === 0 ? 'OW' : `B${level.depth}`}
            </Badge>
            <Text className={classes.levelName} title={level.name}>{level.name}</Text>
          </Group>
        </UnstyledButton>

      </Group>

      {/* Children */}
      {open && hasChildren && (
        <div className={classes.children}>
          {level.rooms.length > 0 && (
            <>
              <Text className={classes.childGroupLabel}>Rooms</Text>
              {level.rooms.map((room) => (
                <UnstyledButton
                  key={room.id}
                  className={classes.leafItem}
                  data-active={selectedId === room.id || undefined}
                  onClick={() => selectItem(room.id)}
                >
                  <Text className={classes.leafLabel} title={room.name}>
                    {room.name || 'Unnamed Room'}
                  </Text>
                  <Text className={classes.leafMeta}>
                    {room.width}×{room.height}
                  </Text>
                </UnstyledButton>
              ))}
            </>
          )}

          {level.hallways.length > 0 && (
            <>
              <Text className={classes.childGroupLabel}>Hallways</Text>
              {level.hallways.map((hallway) => {
                const roomA = level.rooms.find((r) => r.id === hallway.roomAId)
                const roomB = level.rooms.find((r) => r.id === hallway.roomBId)
                const label = roomA && roomB
                  ? `${roomA.name} → ${roomB.name}`
                  : 'Hallway'
                return (
                  <UnstyledButton
                    key={hallway.id}
                    className={classes.leafItem}
                    data-active={selectedId === hallway.id || undefined}
                    onClick={() => selectItem(hallway.id)}
                  >
                    <Text className={classes.leafLabel} title={label}>
                      {label}
                    </Text>
                  </UnstyledButton>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main nav ──────────────────────────────────────────────────────────────────

export function LevelNav() {
  const project          = useMapStore((s) => s.project)
  const addDungeonLevel  = useMapStore((s) => s.addDungeonLevel)

  if (!project) {
    return (
      <div className={classes.nav}>
        <Text size="xs" c="dimmed" fs="italic" p="xs">No map open</Text>
      </div>
    )
  }

  const levels = [project.overworld, ...project.dungeonLevels]

  return (
    <div className={classes.nav}>
      <div className={classes.header}>
        <Text className={classes.projectName} title={project.name}>{project.name}</Text>
        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>v{project.version}</Text>
      </div>

      <div className={classes.tree}>
        {levels.map((level) => (
          <LevelTree key={level.id} level={level} />
        ))}

        <UnstyledButton className={classes.addBtn} onClick={addDungeonLevel}>
          + Add Level
        </UnstyledButton>
      </div>
    </div>
  )
}
