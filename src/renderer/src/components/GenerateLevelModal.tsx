import { useState, useCallback } from 'react'
import {
  Modal, Stack, Text, Group, Button, NumberInput, Slider,
  Divider, Select, Alert
} from '@mantine/core'
import { useMapStore } from '../store/mapStore'
import { generateLevel, GeneratorParams, DEFAULT_GENERATOR_PARAMS } from '../engine/levelGenerator'
import { GenerateLevelCommand } from '../engine/commands'

interface Props {
  onClose: () => void
}

export function GenerateLevelModal({ onClose }: Props) {
  const dispatch       = useMapStore((s) => s.dispatch)
  const project        = useMapStore((s) => s.project)
  const activeLevelId  = useMapStore((s) => s.activeLevelId)
  const setSelected    = useMapStore((s) => s.setSelected)

  const [params, setParams] = useState<GeneratorParams>(DEFAULT_GENERATOR_PARAMS)
  const [seed,   setSeed]   = useState<number | ''>('')
  const [busy,   setBusy]   = useState(false)

  const activeLevel = project && activeLevelId
    ? (project.overworld.id === activeLevelId
        ? project.overworld
        : project.dungeonLevels.find((l) => l.id === activeLevelId) ?? null)
    : null

  function patch(updates: Partial<GeneratorParams>) {
    setParams((p) => ({ ...p, ...updates }))
  }

  const handleGenerate = useCallback(() => {
    if (!activeLevel || !activeLevelId) return
    setBusy(true)
    try {
      const result = generateLevel(
        params,
        activeLevel.settings,
        seed !== '' ? seed : undefined
      )
      dispatch(new GenerateLevelCommand(
        activeLevelId,
        {
          rooms:      activeLevel.rooms,
          hallways:   activeLevel.hallways,
          placements: activeLevel.placements
        },
        result
      ))
      setSelected(null)
      onClose()
    } finally {
      setBusy(false)
    }
  }, [activeLevel, activeLevelId, params, seed, dispatch, setSelected, onClose])

  const canGenerate = !!activeLevel

  const gridW = activeLevel?.settings.gridWidth  ?? 32
  const gridH = activeLevel?.settings.gridHeight ?? 32

  return (
    <Modal
      opened
      onClose={onClose}
      title="Generate Level"
      centered
      size="sm"
    >
      <Stack gap="sm">
        {!activeLevel && (
          <Alert color="orange" title="No level selected">
            Select a level in the left panel before generating.
          </Alert>
        )}

        {activeLevel && (
          <Text size="xs" c="dimmed">
            Generating into <strong>{activeLevel.name}</strong> ({gridW}×{gridH} grid).
            Existing rooms, hallways, and objects will be replaced.
          </Text>
        )}

        <Divider label="Rooms" labelPosition="left" />

        <Group grow gap="xs">
          <NumberInput
            label="Count"
            min={2} max={50}
            value={params.roomCount}
            onChange={(v) => patch({ roomCount: Number(v) || 12 })}
            size="xs"
          />
        </Group>

        <Group grow gap="xs">
          <NumberInput
            label="Min width"
            min={2} max={params.maxRoomWidth}
            value={params.minRoomWidth}
            onChange={(v) => patch({ minRoomWidth: Number(v) || 2 })}
            size="xs"
          />
          <NumberInput
            label="Max width"
            min={params.minRoomWidth} max={Math.floor(gridW / 2)}
            value={params.maxRoomWidth}
            onChange={(v) => patch({ maxRoomWidth: Number(v) || 8 })}
            size="xs"
          />
        </Group>

        <Group grow gap="xs">
          <NumberInput
            label="Min height"
            min={2} max={params.maxRoomHeight}
            value={params.minRoomHeight}
            onChange={(v) => patch({ minRoomHeight: Number(v) || 2 })}
            size="xs"
          />
          <NumberInput
            label="Max height"
            min={params.minRoomHeight} max={Math.floor(gridH / 2)}
            value={params.maxRoomHeight}
            onChange={(v) => patch({ maxRoomHeight: Number(v) || 8 })}
            size="xs"
          />
        </Group>

        <Divider label="Connections" labelPosition="left" />

        <Stack gap={4}>
          <Text size="xs">Extra connections: {Math.round(params.extraEdgeChance * 100)}%</Text>
          <Text size="xs" c="dimmed">
            Higher values add more loops and alternate routes between rooms.
          </Text>
          <Slider
            min={0} max={1} step={0.025}
            value={params.extraEdgeChance}
            onChange={(v) => patch({ extraEdgeChance: v })}
            color="teal"
            size="sm"
            label={(v) => `${Math.round(v * 100)}%`}
          />
        </Stack>

        <Select
          label="Hallway width"
          size="xs"
          value={String(params.hallwayWidth)}
          onChange={(v) => patch({ hallwayWidth: (Number(v) || 1) as GeneratorParams['hallwayWidth'] })}
          allowDeselect={false}
          data={[
            { value: '1', label: 'Small'  },
            { value: '3', label: 'Medium' },
            { value: '5', label: 'Large'  },
          ]}
          comboboxProps={{ withinPortal: true }}
        />

        <Divider label="Seed" labelPosition="left" />

        <NumberInput
          label="Random seed"
          description="Leave blank for a random result each time."
          placeholder="random"
          value={seed}
          onChange={(v) => setSeed(v === '' ? '' : Number(v))}
          min={0}
          size="xs"
        />

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button
            color="teal"
            disabled={!canGenerate || busy}
            loading={busy}
            onClick={handleGenerate}
          >
            Generate
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
