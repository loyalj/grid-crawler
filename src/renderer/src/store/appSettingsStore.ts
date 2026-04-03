import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SettingsSection = 'appearance' | 'grid' | 'interaction'

export interface AppSettings {
  gridVisible:      boolean
  gridColor:        string   // hex e.g. '#c8c8c8'
  gridOpacity:      number   // 0.0–1.0
  snapToGrid:       boolean
  colorScheme:      'light' | 'dark'
  canvasBackground: string   // hex e.g. '#4a4a4a'
}

interface AppSettingsStore extends AppSettings {
  settingsSection: SettingsSection
  setSettingsSection: (s: SettingsSection) => void
  set: (patch: Partial<AppSettings>) => void
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
      settingsSection:     'appearance' as SettingsSection,
      setSettingsSection:  (settingsSection) => set({ settingsSection }),
      set: (patch) => set(patch)
    }),
    {
      name: 'grid-crawler-settings',
      version: 1,
      partialize: (s) => ({
        gridVisible:      s.gridVisible,
        gridColor:        s.gridColor,
        gridOpacity:      s.gridOpacity,
        snapToGrid:       s.snapToGrid,
        colorScheme:      s.colorScheme,
        canvasBackground: s.canvasBackground,
      })
    }
  )
)
