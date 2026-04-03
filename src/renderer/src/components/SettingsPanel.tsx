import { Stack, Switch, Slider, ColorInput, Text, Title } from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { useAppSettings, SettingsSection } from '../store/appSettingsStore'
import classes from './SettingsPanel.module.css'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance',  label: 'Appearance'  },
  { id: 'grid',        label: 'Grid'        },
  { id: 'interaction', label: 'Interaction' },
]

// ── Side-nav list (rendered inside the SideNav panel) ────────────────────────

export function SettingsNav() {
  const active = useAppSettings((s) => s.settingsSection)
  const setSection = useAppSettings((s) => s.setSettingsSection)

  return (
    <Stack gap={2} p="xs">
      {SECTIONS.map(({ id, label }) => (
        <button
          key={id}
          className={classes.navItem}
          data-active={active === id || undefined}
          onClick={() => setSection(id)}
        >
          {label}
        </button>
      ))}
    </Stack>
  )
}

// ── Main-area content ────────────────────────────────────────────────────────

export function SettingsContent() {
  const { toggleColorScheme } = useMantineColorScheme()
  const settings = useAppSettings()

  function handleSchemeToggle(checked: boolean) {
    settings.set({ colorScheme: checked ? 'dark' : 'light' })
    toggleColorScheme()
  }

  return (
    <div className={classes.content}>
      {settings.settingsSection === 'appearance' && (
        <Stack gap="md" maw={400}>
          <Title order={5}>Appearance</Title>
          <Switch
            label="Dark mode"
            checked={settings.colorScheme === 'dark'}
            onChange={(e) => handleSchemeToggle(e.currentTarget.checked)}
          />
          <ColorInput
            label="Canvas background"
            value={settings.canvasBackground}
            onChange={(v) => settings.set({ canvasBackground: v })}
            format="hex"
            swatches={['#1a1a2e', '#2d2d2d', '#3a3a3a', '#4a4a4a', '#1e3a2f', '#1e2a3a']}
          />
        </Stack>
      )}

      {settings.settingsSection === 'grid' && (
        <Stack gap="md" maw={400}>
          <Title order={5}>Grid</Title>
          <Switch
            label="Show grid"
            checked={settings.gridVisible}
            onChange={(e) => settings.set({ gridVisible: e.currentTarget.checked })}
          />
          <ColorInput
            label="Grid color"
            value={settings.gridColor}
            onChange={(v) => settings.set({ gridColor: v })}
            format="hex"
            disabled={!settings.gridVisible}
            swatches={['#ffffff', '#c8c8c8', '#888888', '#444444', '#8ecaff', '#a8ffb0']}
          />
          <Stack gap={4}>
            <Text size="sm">Grid opacity — {Math.round(settings.gridOpacity * 100)}%</Text>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={settings.gridOpacity}
              onChange={(v) => settings.set({ gridOpacity: v })}
              disabled={!settings.gridVisible}
            />
          </Stack>
        </Stack>
      )}

      {settings.settingsSection === 'interaction' && (
        <Stack gap="md" maw={400}>
          <Title order={5}>Interaction</Title>
          <Switch
            label="Snap tokens & props to grid"
            checked={settings.snapToGrid}
            onChange={(e) => settings.set({ snapToGrid: e.currentTarget.checked })}
          />
        </Stack>
      )}
    </div>
  )
}
