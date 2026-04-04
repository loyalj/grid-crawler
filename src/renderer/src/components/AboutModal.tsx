import { useEffect, useState } from 'react'
import { Modal, Stack, Text, Anchor, Loader, ThemeIcon, Group } from '@mantine/core'
import type { UpdaterStatus } from '../types/electron'

const VERSION = __APP_VERSION__

function UpdateStatus({ status }: { status: UpdaterStatus | null }) {
  if (!status || status.state === 'checking') {
    return (
      <Group gap={8} mt={4}>
        <Loader size={14} color="dimmed" />
        <Text size="xs" c="dimmed">Checking for updates…</Text>
      </Group>
    )
  }

  if (status.state === 'up-to-date') {
    return (
      <Group gap={8} mt={4}>
        <ThemeIcon size={18} radius="xl" color="green" variant="filled">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ThemeIcon>
        <Text size="xs" c="dimmed">Grid Crawler is up to date</Text>
      </Group>
    )
  }

  if (status.state === 'available') {
    return (
      <Group gap={8} mt={4}>
        <ThemeIcon size={18} radius="xl" color="blue" variant="filled">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 2v6M2 6l3 3 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ThemeIcon>
        <Text size="xs" c="dimmed">Version {status.version} is available — downloading…</Text>
      </Group>
    )
  }

  // error
  return (
    <Text size="xs" c="dimmed" mt={4}>{status.message}</Text>
  )
}

export function AboutModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)

  useEffect(() => {
    if (!opened) { setStatus(null); return }

    const handler = (s: UpdaterStatus) => setStatus(s)
    window.electronAPI.onUpdaterStatus(handler)
    window.electronAPI.checkForUpdates()

    return () => window.electronAPI.offUpdaterStatus(handler)
  }, [opened])

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Grid Crawler"
      centered
      size="sm"
      withCloseButton
    >
      <Stack gap="md" pb="xs">
        <Group gap="md" align="flex-start">
          {/* App icon placeholder — replace src with real icon path when available */}
          <div style={{
            width: 64, height: 64, borderRadius: 14,
            background: 'linear-gradient(135deg, #5b7cf7 0%, #3a4fd4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="4"  y="4"  width="12" height="12" rx="2" fill="white" opacity="0.9"/>
              <rect x="20" y="4"  width="12" height="12" rx="2" fill="white" opacity="0.9"/>
              <rect x="4"  y="20" width="12" height="12" rx="2" fill="white" opacity="0.9"/>
              <rect x="20" y="20" width="12" height="12" rx="2" fill="white" opacity="0.9"/>
            </svg>
          </div>

          <Stack gap={2}>
            <Text fw={700} size="lg" lh={1.2}>Grid Crawler</Text>
            <Text size="sm" c="dimmed">Version v{VERSION} ({__APP_ARCH__})</Text>
            <UpdateStatus status={status} />
            <Anchor
              size="xs"
              mt={6}
              href={`https://github.com/loyalj/grid-crawler/releases/tag/v${VERSION}`}
              target="_blank"
              onClick={(e) => {
                e.preventDefault()
                window.open(`https://github.com/loyalj/grid-crawler/releases/tag/v${VERSION}`)
              }}
            >
              What&apos;s new in v{VERSION} ↗
            </Anchor>
          </Stack>
        </Group>
      </Stack>
    </Modal>
  )
}
