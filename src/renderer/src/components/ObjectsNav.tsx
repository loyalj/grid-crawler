import { useState } from 'react'
import { Text, UnstyledButton } from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import {
  ObjectDefinition, TokenDefinition, PropDefinition, ObjectPlacement,
  TokenCategory, PropCategory
} from '../types/map'
import { PlaceObjectCommand, RemoveObjectCommand } from '../engine/commands'
import { ContextMenu } from './ContextMenu'
import { ContextMenuAction } from '../engine/InputManager'
import classes from './ObjectsNav.module.css'

// ── Token icon preview ────────────────────────────────────────────────────────

function TokenIcon({ def, size = 28 }: { def: TokenDefinition; size?: number }) {
  const { bgColor, fgColor, borderColor, iconContent } = def.visual
  return (
    <div
      className={classes.tokenIcon}
      style={{
        width: size, height: size,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        color: fgColor
      }}
      dangerouslySetInnerHTML={{ __html: iconContent }}
    />
  )
}

// ── Category labels ───────────────────────────────────────────────────────────

const TOKEN_CATEGORY_LABELS: Record<TokenCategory, string> = {
  loot:      'Loot',
  trap:      'Traps',
  container: 'Containers',
  hazard:    'Hazards'
}

const PROP_CATEGORY_LABELS: Record<PropCategory, string> = {
  furniture: 'Furniture',
  structure: 'Structures'
}

const TOKEN_CATEGORY_ORDER: TokenCategory[] = ['loot', 'trap', 'container', 'hazard']
const PROP_CATEGORY_ORDER:  PropCategory[]  = ['furniture', 'structure']

// ── Catalog browser ───────────────────────────────────────────────────────────

function CatalogBrowser({
  catalog,
  armedId,
  onArm
}: {
  catalog:  ObjectDefinition[]
  armedId:  string | null
  onArm:    (id: string | null) => void
}) {
  const tokens = catalog.filter((d): d is TokenDefinition => d.kind === 'token')
  const props  = catalog.filter((d) => d.kind === 'prop')

  function renderGroup(
    label: string,
    items: ObjectDefinition[]
  ) {
    if (items.length === 0) return null
    return (
      <div key={label}>
        <Text className={classes.groupLabel}>{label}</Text>
        {items.map((def) => (
          <UnstyledButton
            key={def.id}
            className={classes.catalogItem}
            data-active={armedId === def.id || undefined}
            title={def.description}
            onClick={() => onArm(armedId === def.id ? null : def.id)}
          >
            {def.kind === 'token' ? (
              <TokenIcon def={def as TokenDefinition} size={24} />
            ) : (def as PropDefinition).visual.textureUrl ? (
              <img
                src={(def as PropDefinition).visual.textureUrl}
                alt=""
                className={classes.propIconThumb}
              />
            ) : (
              <div className={classes.propIconPlaceholder} />
            )}
            <div className={classes.catalogItemText}>
              <Text className={classes.catalogItemName}>{def.name}</Text>
              {def.tier === 'project' && (
                <Text className={classes.catalogItemTier}>Project</Text>
              )}
            </div>
          </UnstyledButton>
        ))}
      </div>
    )
  }

  return (
    <div className={classes.section}>
      <Text className={classes.sectionLabel}>Catalog</Text>
      <div className={classes.sectionBody}>
        {/* Token groups */}
        {TOKEN_CATEGORY_ORDER.map((cat) =>
          renderGroup(
            TOKEN_CATEGORY_LABELS[cat],
            tokens.filter((d) => d.category === cat)
          )
        )}
        {/* Prop groups */}
        {PROP_CATEGORY_ORDER.map((cat) =>
          renderGroup(
            PROP_CATEGORY_LABELS[cat],
            props.filter((d) => d.category === cat)
          )
        )}
      </div>
    </div>
  )
}

// ── Placed instances list ─────────────────────────────────────────────────────

interface PlacedItemContextMenu {
  screenX:   number
  screenY:   number
  placement: ObjectPlacement
  levelId:   string
}

function PlacedList({
  placements,
  catalog,
  selectedId,
  levelId,
  onSelect
}: {
  placements: ObjectPlacement[]
  catalog:    ObjectDefinition[]
  selectedId: string | null
  levelId:    string
  onSelect:   (id: string) => void
}) {
  const dispatch = useMapStore((s) => s.dispatch)
  const setSelected = useMapStore((s) => s.setSelected)
  const [ctxMenu, setCtxMenu] = useState<PlacedItemContextMenu | null>(null)

  if (placements.length === 0) {
    return (
      <div className={classes.section}>
        <Text className={classes.sectionLabel}>Placed</Text>
        <Text size="xs" c="dimmed" fs="italic" px={8} py={4}>None placed yet</Text>
      </div>
    )
  }

  function handleAction(action: ContextMenuAction) {
    if (action.kind !== 'delete_room' && action.kind !== 'delete_hallway' &&
        action.kind !== 'delete_level' && action.kind !== 'add_waypoint' &&
        action.kind !== 'remove_waypoint') {
      // only delete_object reaches here
      if ('placementId' in action) {
        const p = placements.find((pl) => pl.id === (action as { placementId: string }).placementId)
        if (p) {
          dispatch(new RemoveObjectCommand(levelId, p))
          if (selectedId === p.id) setSelected(null)
        }
      }
    }
    setCtxMenu(null)
  }

  return (
    <div className={classes.section}>
      <Text className={classes.sectionLabel}>Placed</Text>
      <div className={classes.sectionBody}>
        {placements.map((p) => {
          const def = catalog.find((d) => d.id === p.definitionId)
          const label = def?.name ?? 'Unknown'
          const pos = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`
          return (
            <UnstyledButton
              key={p.id}
              className={classes.placedItem}
              data-active={selectedId === p.id || undefined}
              onClick={() => onSelect(p.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ screenX: e.clientX, screenY: e.clientY, placement: p, levelId })
              }}
            >
              {def?.kind === 'token' ? (
                <TokenIcon def={def as TokenDefinition} size={18} />
              ) : (
                <div className={classes.propIconPlaceholder} style={{ width: 18, height: 18 }} />
              )}
              <div className={classes.placedItemText}>
                <Text className={classes.placedItemName} title={label}>{label}</Text>
                <Text className={classes.placedItemPos}>{pos}</Text>
              </div>
            </UnstyledButton>
          )
        })}
      </div>

      {ctxMenu && (
        <ContextMenu
          screenX={ctxMenu.screenX}
          screenY={ctxMenu.screenY}
          items={[{ kind: 'delete_object', placementId: ctxMenu.placement.id } as unknown as ContextMenuAction]}
          onAction={handleAction}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ObjectsNav() {
  const project         = useMapStore((s) => s.project)
  const activeLevelId   = useMapStore((s) => s.activeLevelId)
  const selectedId      = useMapStore((s) => s.selectedId)
  const armedId         = useMapStore((s) => s.armedDefinitionId)
  const setArmed        = useMapStore((s) => s.setArmedDefinition)
  const setSelected     = useMapStore((s) => s.setSelected)
  const setActiveTool   = useMapStore((s) => s.setActiveTool)
  const appCatalog      = useMapStore((s) => s.appCatalog)
  const dispatch        = useMapStore((s) => s.dispatch)

  if (!project || !activeLevelId) {
    return (
      <div className={classes.nav}>
        <Text size="xs" c="dimmed" fs="italic" p="xs">No map open</Text>
      </div>
    )
  }

  const activeLevel = project.overworld.id === activeLevelId
    ? project.overworld
    : project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null

  const catalog: ObjectDefinition[] = [
    ...appCatalog,
    ...project.projectCatalog
  ]

  const placements = activeLevel?.placements ?? []

  function onArm(id: string | null) {
    setArmed(id)
    if (id) {
      setActiveTool('object')
    }
  }

  function onSelectPlaced(id: string) {
    setSelected(id)
  }

  return (
    <div className={classes.nav}>
      <CatalogBrowser
        catalog={catalog}
        armedId={armedId}
        onArm={onArm}
      />
      <div className={classes.divider} />
      {activeLevel && (
        <PlacedList
          placements={placements}
          catalog={catalog}
          selectedId={selectedId}
          levelId={activeLevelId}
          onSelect={onSelectPlaced}
        />
      )}
    </div>
  )
}
