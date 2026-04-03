import { useEffect } from 'react'
import { Text } from '@mantine/core' // used in header
import { useMapStore, NavSection } from '../store/mapStore'
import { LevelNav } from './LevelNav'
import { ObjectsNav } from './ObjectsNav'
import { SettingsNav } from './SettingsPanel'
import classes from './SideNav.module.css'

// ── Placeholder icons ─────────────────────────────────────────────────────────
// Once you have SVG files, replace each with:
//   import MapIcon from '../icons/map.svg?react'
// and use <MapIcon className={classes.railIcon} /> directly.

function IconMap({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2"  y="2"  width="7" height="7" rx="1" />
      <rect x="11" y="2"  width="7" height="7" rx="1" />
      <rect x="2"  y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconObjects({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2 L18 6 L18 14 L10 18 L2 14 L2 6 Z" />
      <path d="M10 2 L10 18" />
      <path d="M2 6 L18 6" />
    </svg>
  )
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M15.07 4.93l-1.41 1.41M6.34 13.66l-1.41 1.41" />
    </svg>
  )
}

// ── Rail items ────────────────────────────────────────────────────────────────

const RAIL_ITEMS: Array<{
  id:    NavSection
  label: string
  Icon:  React.FC<{ className?: string }>
}> = [
  { id: 'map',      label: 'Map',      Icon: IconMap      },
  { id: 'objects',  label: 'Objects',  Icon: IconObjects  },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function SideNav() {
  const project         = useMapStore((s) => s.project)
  const selectedId      = useMapStore((s) => s.selectedId)
  const activeLevelId   = useMapStore((s) => s.activeLevelId)
  const activeSection   = useMapStore((s) => s.navSection)
  const setActiveSection = useMapStore((s) => s.setNavSection)

  // When something is selected on the canvas, switch to the right panel.
  // Placements are identified by checking the active level's placements list.
  useEffect(() => {
    if (!selectedId) return
    const state = useMapStore.getState()
    const { project, activeLevelId } = state
    if (!project || !activeLevelId) return
    const level = project.overworld.id === activeLevelId
      ? project.overworld
      : project.dungeonLevels.find((l) => l.id === activeLevelId)
    if (!level) return
    const isPlacement = level.placements.some((p) => p.id === selectedId)
    setActiveSection(isPlacement ? 'objects' : 'map')
  }, [selectedId, activeLevelId])

  return (
    <div className={classes.sidenav}>

      {/* Header — project name + version */}
      <div className={classes.header}>
        <Text className={classes.headerTitle} title={project?.name ?? 'Grid Crawler'}>
          {project?.name ?? 'Grid Crawler'}
        </Text>
        {project && (
          <Text className={classes.headerVersion}>v{project.version}</Text>
        )}
      </div>

      {/* Body: icon rail + context panel */}
      <div className={classes.body}>

        <div className={classes.rail}>
          {RAIL_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={classes.railBtn}
              data-active={activeSection === id || undefined}
              title={label}
              onClick={() => setActiveSection(id)}
            >
              <Icon className={classes.railIcon} />
            </button>
          ))}
        </div>

        <div className={classes.panel}>
          {activeSection === 'map'      && <LevelNav />}
          {activeSection === 'objects'  && <ObjectsNav />}
          {activeSection === 'settings' && <SettingsNav />}
        </div>

      </div>
    </div>
  )
}
