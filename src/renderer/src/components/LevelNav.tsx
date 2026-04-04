import { useState } from 'react'
import { Text, UnstyledButton, Badge, Group } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import { Level } from '../types/map'
import { RemoveRoomCommand, RemoveHallwayCommand } from '../engine/commands'
import { ContextMenu } from './ContextMenu'
import { ContextMenuAction } from '../engine/InputManager'
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

// ── Context menu state ────────────────────────────────────────────────────────

interface NavContextMenu {
  screenX: number
  screenY: number
  levelId: string
  items:   ContextMenuAction[]
}

// ── Level tree node ───────────────────────────────────────────────────────────

interface LevelTreeProps {
  level:         Level
  onContextMenu: (menu: NavContextMenu) => void
}

function LevelTree({ level, onContextMenu }: LevelTreeProps) {
  const activeLevelId  = useMapStore((s) => s.activeLevelId)
  const selectedId     = useMapStore((s) => s.selectedId)
  const setActiveLevel = useMapStore((s) => s.setActiveLevel)
  const setSelected    = useMapStore((s) => s.setSelected)

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

  function openLevelMenu(e: React.MouseEvent) {
    if (level.depth === 0) return   // overworld cannot be deleted
    e.preventDefault()
    e.stopPropagation()
    onContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      levelId: level.id,
      items:   [{ kind: 'delete_level', levelId: level.id }]
    })
  }

  function openRoomMenu(e: React.MouseEvent, roomId: string) {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      levelId: level.id,
      items:   [{ kind: 'delete_room', roomId }]
    })
  }

  function openHallwayMenu(e: React.MouseEvent, hallwayId: string) {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu({
      screenX: e.clientX,
      screenY: e.clientY,
      levelId: level.id,
      items:   [{ kind: 'delete_hallway', hallwayId }]
    })
  }

  return (
    <div className={classes.levelNode}>
      {/* Level row */}
      <Group
        gap={0}
        wrap="nowrap"
        className={classes.levelRow}
        data-active={isActiveLevel && !selectedId || undefined}
        onContextMenu={level.depth !== 0 ? openLevelMenu : undefined}
      >
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
              color={level.depth === 0 ? 'teal' : 'gray'}
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
                  onContextMenu={(e) => openRoomMenu(e, room.id)}
                >
                  <Text className={classes.leafLabel} title={room.label || room.name}>
                    {room.label || room.name || 'Unnamed Room'}
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
                  ? `${roomA.label || roomA.name} → ${roomB.label || roomB.name}`
                  : 'Hallway'
                return (
                  <UnstyledButton
                    key={hallway.id}
                    className={classes.leafItem}
                    data-active={selectedId === hallway.id || undefined}
                    onClick={() => selectItem(hallway.id)}
                    onContextMenu={(e) => openHallwayMenu(e, hallway.id)}
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
  const project             = useMapStore((s) => s.project)
  const addDungeonLevel     = useMapStore((s) => s.addDungeonLevel)
  const removeDungeonLevel  = useMapStore((s) => s.removeDungeonLevel)

  const [ctxMenu, setCtxMenu] = useState<NavContextMenu | null>(null)

  if (!project) {
    return (
      <div className={classes.nav}>
        <Text size="xs" c="dimmed" fs="italic" p="xs">No map open</Text>
      </div>
    )
  }

  function handleNavAction(action: ContextMenuAction, levelId: string): void {
    const store = useMapStore.getState()
    const { project } = store
    if (!project) return

    const level =
      project.overworld.id === levelId
        ? project.overworld
        : project.dungeonLevels.find((l) => l.id === levelId) ?? null

    switch (action.kind) {
      case 'delete_room': {
        const room = level?.rooms.find((r) => r.id === action.roomId)
        if (room) {
          store.dispatch(new RemoveRoomCommand(levelId, room))
          if (store.selectedId === room.id) store.setSelected(null)
        }
        break
      }
      case 'delete_hallway': {
        const hallway = level?.hallways.find((h) => h.id === action.hallwayId)
        if (hallway) {
          store.dispatch(new RemoveHallwayCommand(levelId, hallway))
          if (store.selectedId === hallway.id) store.setSelected(null)
        }
        break
      }
      case 'delete_level': {
        removeDungeonLevel(action.levelId)
        break
      }
    }
  }

  const levels = [project.overworld, ...project.dungeonLevels]

  return (
    <div className={classes.nav}>
      <div className={classes.tree}>
        {levels.map((level) => (
          <LevelTree
            key={level.id}
            level={level}
            onContextMenu={setCtxMenu}
          />
        ))}
      </div>

      <UnstyledButton className={classes.addBtn} onClick={addDungeonLevel}>
        + Add Level
      </UnstyledButton>

      {ctxMenu && (
        <ContextMenu
          screenX={ctxMenu.screenX}
          screenY={ctxMenu.screenY}
          items={ctxMenu.items}
          onAction={(action) => { handleNavAction(action, ctxMenu.levelId); setCtxMenu(null) }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
