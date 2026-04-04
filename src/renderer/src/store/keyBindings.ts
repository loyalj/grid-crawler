// ── Key binding types ─────────────────────────────────────────────────────────

export interface KeyBinding {
  key:    string   // e.g. 'z', 'Delete', 'F', 'Home', 'Escape'
  ctrl?:  boolean
  shift?: boolean
  alt?:   boolean
}

export type ActionId =
  | 'undo'
  | 'redo'
  | 'deleteSelected'
  | 'fitView'
  | 'cancel'
  | 'toolSelect'
  | 'toolRoom'
  | 'toolHallway'
  | 'toolObject'
  | 'toolPlayer'
  | 'viewLayout'
  | 'viewTextured'
  | 'viewIsometric'
  | 'viewFps'

export interface ActionMeta {
  label: string
  group: 'editing' | 'tools' | 'view'
}

export const ACTION_META: Record<ActionId, ActionMeta> = {
  undo:           { label: 'Undo',            group: 'editing' },
  redo:           { label: 'Redo',            group: 'editing' },
  deleteSelected: { label: 'Delete Selected', group: 'editing' },
  fitView:        { label: 'Fit View',        group: 'editing' },
  cancel:         { label: 'Cancel / Deselect', group: 'editing' },
  toolSelect:     { label: 'Tool: Select',    group: 'tools'   },
  toolRoom:       { label: 'Tool: Room',      group: 'tools'   },
  toolHallway:    { label: 'Tool: Hallway',   group: 'tools'   },
  toolObject:     { label: 'Tool: Object',    group: 'tools'   },
  toolPlayer:     { label: 'Tool: Player',    group: 'tools'   },
  viewLayout:     { label: 'View: 2D Layout',   group: 'view'  },
  viewTextured:   { label: 'View: 2D Textured', group: 'view'  },
  viewIsometric:  { label: 'View: Isometric',   group: 'view'  },
  viewFps:        { label: 'View: FPS',         group: 'view'  },
}

export const ACTION_GROUPS: { id: ActionMeta['group']; label: string }[] = [
  { id: 'editing', label: 'Editing'    },
  { id: 'tools',   label: 'Tools'      },
  { id: 'view',    label: 'View Modes' },
]

export type KeyBindings = Record<ActionId, KeyBinding[]>

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  undo:           [{ key: 'z', ctrl: true }],
  redo:           [{ key: 'y', ctrl: true }, { key: 'z', ctrl: true, shift: true }],
  deleteSelected: [{ key: 'Delete' }, { key: 'Backspace' }],
  fitView:        [{ key: 'f' }, { key: 'Home' }],
  cancel:         [{ key: 'Escape' }],
  toolSelect:     [{ key: 's' }],
  toolRoom:       [{ key: 'r' }],
  toolHallway:    [{ key: 'h' }],
  toolObject:     [],
  toolPlayer:     [],
  viewLayout:     [],
  viewTextured:   [],
  viewIsometric:  [],
  viewFps:        [],
}

/** Format a KeyBinding for display, e.g. "Ctrl+Shift+Z" */
export function formatBinding(b: KeyBinding): string {
  const parts: string[] = []
  if (b.ctrl)  parts.push('Ctrl')
  if (b.alt)   parts.push('Alt')
  if (b.shift) parts.push('Shift')
  const key = b.key === ' ' ? 'Space' : b.key
  parts.push(key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}

/** Test whether a KeyboardEvent matches a KeyBinding */
export function matchesBinding(e: KeyboardEvent, b: KeyBinding): boolean {
  const ctrl = e.ctrlKey || e.metaKey
  return (
    e.key.toLowerCase() === b.key.toLowerCase() &&
    !!b.ctrl  === ctrl        &&
    !!b.shift === e.shiftKey  &&
    !!b.alt   === e.altKey
  )
}
