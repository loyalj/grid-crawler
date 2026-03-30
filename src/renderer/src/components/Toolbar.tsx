import { Group, UnstyledButton, Text, Divider } from '@mantine/core'
import { useMapStore, EditorTool } from '../store/mapStore'
import classes from './Toolbar.module.css'

const TOOLS: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: 'select',  label: 'Select',  hint: 'Click to select, drag to move  (S)' },
  { id: 'room',    label: 'Room',    hint: 'Drag to place a new room       (R)' },
  { id: 'hallway', label: 'Hallway', hint: 'Click room A then room B       (H)' },
]

export function Toolbar() {
  const project       = useMapStore((s) => s.project)
  const activeTool    = useMapStore((s) => s.activeTool)
  const setActiveTool = useMapStore((s) => s.setActiveTool)

  return (
    <div className={classes.ribbon}>
      <Text className={classes.groupLabel}>Tools</Text>
      <Divider orientation="vertical" className={classes.divider} />
      <Group gap={4}>
        {TOOLS.map((tool) => (
          <UnstyledButton
            key={tool.id}
            className={classes.toolBtn}
            data-active={activeTool === tool.id || undefined}
            title={tool.hint}
            disabled={!project}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.label}
          </UnstyledButton>
        ))}
      </Group>
    </div>
  )
}
