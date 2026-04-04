import { useState, useEffect, useCallback } from 'react'
import { Stack, Switch, Slider, ColorInput, Text, Title, Button, Group } from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { useAppSettings, SettingsSection } from '../store/appSettingsStore'
import {
  ActionId, ACTION_META, ACTION_GROUPS, KeyBinding,
  DEFAULT_KEY_BINDINGS, formatBinding, matchesBinding
} from '../store/keyBindings'
import classes from './SettingsPanel.module.css'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance',  label: 'Appearance'  },
  { id: 'grid',        label: 'Grid'        },
  { id: 'interaction', label: 'Interaction' },
  { id: 'keybindings', label: 'Keybindings' },
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

// ── Keybindings section ───────────────────────────────────────────────────────

const ACTION_IDS = Object.keys(ACTION_META) as ActionId[]

function KeybindingsSection() {
  const keyBindings    = useAppSettings((s) => s.keyBindings)
  const setKeyBinding  = useAppSettings((s) => s.setKeyBinding)
  const resetKeyBindings = useAppSettings((s) => s.resetKeyBindings)

  const [capturing, setCapturing] = useState<ActionId | null>(null)

  const startCapture = useCallback((actionId: ActionId) => {
    setCapturing(actionId)
  }, [])

  const cancelCapture = useCallback(() => {
    setCapturing(null)
  }, [])

  useEffect(() => {
    if (!capturing) return
    const handle = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Ignore bare modifier keys
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const newBinding: KeyBinding = {
        key:   e.key,
        ctrl:  e.ctrlKey || e.metaKey || undefined,
        shift: e.shiftKey || undefined,
        alt:   e.altKey || undefined,
      }

      // Don't add a duplicate
      const current = keyBindings[capturing]
      const alreadyBound = current.some((b) => matchesBinding(e, b))
      if (!alreadyBound) {
        setKeyBinding(capturing, [...current, newBinding])
      }
      setCapturing(null)
    }
    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [capturing, keyBindings, setKeyBinding])

  // Close capture on Escape before the global handler fires
  useEffect(() => {
    if (!capturing) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setCapturing(null) }
    }
    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [capturing])

  return (
    <Stack gap="xl" maw={520}>
      <Group justify="space-between" align="center">
        <Title order={5}>Keybindings</Title>
        <Button size="xs" variant="subtle" onClick={resetKeyBindings}>
          Reset all to defaults
        </Button>
      </Group>

      {ACTION_GROUPS.map(({ id: groupId, label: groupLabel }) => {
        const groupActions = ACTION_IDS.filter((id) => ACTION_META[id].group === groupId)
        return (
          <Stack key={groupId} gap={4}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>{groupLabel}</Text>
            {groupActions.map((actionId) => {
              const bindings = keyBindings[actionId] ?? DEFAULT_KEY_BINDINGS[actionId]
              const isCapturing = capturing === actionId
              return (
                <div key={actionId} className={classes.bindingRow}>
                  <Text size="sm" className={classes.bindingLabel}>
                    {ACTION_META[actionId].label}
                  </Text>
                  <Group gap={4} className={classes.bindingChips}>
                    {bindings.map((b, i) => (
                      <button
                        key={i}
                        className={classes.keyChip}
                        title="Click to remove"
                        onClick={() => setKeyBinding(actionId, bindings.filter((_, j) => j !== i))}
                      >
                        {formatBinding(b)} ×
                      </button>
                    ))}
                    {isCapturing ? (
                      <button className={`${classes.keyChip} ${classes.keyChipCapturing}`} onClick={cancelCapture}>
                        Press a key… (Esc to cancel)
                      </button>
                    ) : (
                      <button className={`${classes.keyChip} ${classes.keyChipAdd}`} onClick={() => startCapture(actionId)}>
                        +
                      </button>
                    )}
                  </Group>
                </div>
              )
            })}
          </Stack>
        )
      })}
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

      {settings.settingsSection === 'keybindings' && (
        <KeybindingsSection />
      )}
    </div>
  )
}
