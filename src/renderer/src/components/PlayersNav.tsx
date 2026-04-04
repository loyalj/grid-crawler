import { Text, UnstyledButton } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import { Player } from '../types/map'
import { RemovePlayerCommand } from '../engine/commands'
import { ContextMenu } from './ContextMenu'
import { ContextMenuAction } from '../engine/InputManager'
import { useState } from 'react'
import classes from './PlayersNav.module.css'

// ── Portrait thumbnail ────────────────────────────────────────────────────────

function PortraitThumb({ player }: { player: Player }) {
  if (player.portrait) {
    return (
      <div className={classes.portrait}>
        <img src={player.portrait} alt={player.name} />
      </div>
    )
  }
  const initials = player.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')
  return (
    <div className={classes.portrait}>
      <span className={classes.portraitInitials}>{initials || '?'}</span>
    </div>
  )
}

// ── Context menu state ────────────────────────────────────────────────────────

interface NavContextMenu {
  screenX:  number
  screenY:  number
  playerId: string
  items:    ContextMenuAction[]
}

// ── Main nav ──────────────────────────────────────────────────────────────────

export function PlayersNav() {
  const project          = useMapStore((s) => s.project)
  const selectedPlayerId = useMapStore((s) => s.selectedPlayerId)
  const setSelectedPlayer = useMapStore((s) => s.setSelectedPlayer)
  const addPlayer        = useMapStore((s) => s.addPlayer)

  const [ctxMenu, setCtxMenu] = useState<NavContextMenu | null>(null)

  if (!project) {
    return (
      <div className={classes.nav}>
        <Text size="xs" c="dimmed" fs="italic" p="xs">No map open</Text>
      </div>
    )
  }

  function placementLabel(player: Player): string {
    if (!player.placement) return 'unplaced'
    const { levelId } = player.placement
    if (project!.overworld.id === levelId) return project!.overworld.name
    const level = project!.dungeonLevels.find((l) => l.id === levelId)
    return level ? level.name : 'unknown level'
  }

  function openPlayerMenu(e: React.MouseEvent, playerId: string) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      screenX:  e.clientX,
      screenY:  e.clientY,
      playerId,
      items:    [{ kind: 'delete_player', playerId }]
    })
  }

  function handleAction(action: ContextMenuAction) {
    if (action.kind === 'delete_player') {
      useMapStore.getState().dispatch(new RemovePlayerCommand(action.playerId))
      if (selectedPlayerId === action.playerId) setSelectedPlayer(null)
    }
  }

  return (
    <div className={classes.nav}>
      <div className={classes.list}>
        {project.players.length === 0 && (
          <Text size="xs" c="dimmed" fs="italic" p="xs">No players yet</Text>
        )}
        {project.players.map((player) => (
          <div
            key={player.id}
            className={classes.playerRow}
            data-active={selectedPlayerId === player.id || undefined}
            onClick={() => setSelectedPlayer(player.id)}
            onContextMenu={(e) => openPlayerMenu(e, player.id)}
          >
            <PortraitThumb player={player} />
            <div className={classes.playerInfo}>
              <Text className={classes.playerName}>{player.name || 'Unnamed Player'}</Text>
              <Text className={classes.playerPlacement}>{placementLabel(player)}</Text>
            </div>
          </div>
        ))}
      </div>

      <UnstyledButton className={classes.addBtn} onClick={addPlayer}>
        + Add Player
      </UnstyledButton>

      {ctxMenu && (
        <ContextMenu
          screenX={ctxMenu.screenX}
          screenY={ctxMenu.screenY}
          items={ctxMenu.items}
          onAction={(action) => { handleAction(action); setCtxMenu(null) }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
