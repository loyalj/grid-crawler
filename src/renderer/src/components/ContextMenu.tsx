import { useEffect, useRef } from 'react'
import { ContextMenuAction } from '../engine/InputManager'

const LABELS: Record<ContextMenuAction['kind'], string> = {
  add_waypoint:    'Add Waypoint',
  remove_waypoint: 'Delete Waypoint',
  delete_hallway:  'Delete Hallway',
  copy_room:       'Copy Room',
  cut_room:        'Cut Room',
  delete_room:     'Delete Room',
  delete_level:    'Delete Level',
  copy_object:     'Copy',
  cut_object:      'Cut',
  delete_object:   'Delete Object',
  paste:           'Paste'
}

const DANGER_KINDS = new Set<ContextMenuAction['kind']>(['delete_hallway', 'remove_waypoint', 'delete_room', 'delete_level', 'delete_object'])

interface Props {
  screenX: number
  screenY: number
  items:   ContextMenuAction[]
  onAction: (action: ContextMenuAction) => void
  onClose:  () => void
}

export function ContextMenu({ screenX, screenY, items, onAction, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay so the right-click mousedown that opened this menu has finished
    // bubbling before we start listening — otherwise it would immediately close.
    const id = setTimeout(() => document.addEventListener('mousedown', handle), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handle)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: screenX, top: screenY }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`context-menu-item${DANGER_KINDS.has(item.kind) ? ' context-menu-item--danger' : ''}`}
          onClick={() => { onAction(item); onClose() }}
        >
          {LABELS[item.kind]}
        </button>
      ))}
    </div>
  )
}
