import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { KeyBindings, ActionId, DEFAULT_KEY_BINDINGS } from './keyBindings'

export type SettingsSection = 'appearance' | 'grid' | 'interaction' | 'keybindings'

export interface AppSettings {
  gridVisible:      boolean
  gridColor:        string   // hex e.g. '#c8c8c8'
  gridOpacity:      number   // 0.0–1.0
  snapToGrid:       boolean
  colorScheme:      'light' | 'dark'
  canvasBackground: string   // hex e.g. '#4a4a4a'
  keyBindings:      KeyBindings
}

interface AppSettingsStore extends AppSettings {
  settingsSection: SettingsSection
  setSettingsSection: (s: SettingsSection) => void
  set: (patch: Partial<AppSettings>) => void
  setKeyBinding: (action: ActionId, bindings: KeyBindings[ActionId]) => void
  resetKeyBindings: () => void
}

export const useAppSettings = create<AppSettingsStore>()(
  persist(
    (set) => ({
      gridVisible:      true,
      gridColor:        '#c8c8c8',
      gridOpacity:      0.85,
      snapToGrid:       false,
      colorScheme:      'dark',
      canvasBackground: '#4a4a4a',
      keyBindings:      DEFAULT_KEY_BINDINGS,

      settingsSection:     'appearance' as SettingsSection,
      setSettingsSection:  (settingsSection) => set({ settingsSection }),
      set: (patch) => set(patch),
      setKeyBinding: (action, bindings) =>
        set((s) => ({ keyBindings: { ...s.keyBindings, [action]: bindings } })),
      resetKeyBindings: () => set({ keyBindings: DEFAULT_KEY_BINDINGS }),
    }),
    {
      name: 'grid-crawler-settings',
      version: 3,
      migrate: (state, fromVersion) => {
        const s = state as Partial<AppSettings>
        if (fromVersion < 2) {
          s.keyBindings = DEFAULT_KEY_BINDINGS
        }
        if (fromVersion < 3) {
          // Merge new toggleGrid binding without resetting all keybindings
          if (s.keyBindings && !('toggleGrid' in s.keyBindings)) {
            s.keyBindings = { ...s.keyBindings, toggleGrid: DEFAULT_KEY_BINDINGS.toggleGrid }
          }
        }
        return s
      },
      partialize: (s) => ({
        gridVisible:      s.gridVisible,
        gridColor:        s.gridColor,
        gridOpacity:      s.gridOpacity,
        snapToGrid:       s.snapToGrid,
        colorScheme:      s.colorScheme,
        canvasBackground: s.canvasBackground,
        keyBindings:      s.keyBindings,
      })
    }
  )
)
