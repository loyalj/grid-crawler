import { Text } from '@mantine/core'
import { TextureDefinition } from '../types/map'
import classes from './TextureBrowser.module.css'

const SURFACE_LABEL: Record<string, string> = {
  floor: 'Floor',
  wall:  'Wall',
  both:  'Both',
}

interface Props {
  textures:   TextureDefinition[]
  selectedId: string | null
  onSelect:   (id: string) => void
}

export function TextureBrowser({ textures, selectedId, onSelect }: Props) {
  if (textures.length === 0) {
    return <Text size="xs" c="dimmed" p={8}>No textures match.</Text>
  }

  // Group by category
  const grouped = new Map<string, TextureDefinition[]>()
  for (const tex of textures) {
    const key = tex.category || ''
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(tex)
  }

  return (
    <div>
      {[...grouped.entries()].map(([cat, items]) => (
        <div key={cat || '__none__'}>
          <Text className={classes.groupLabel}>{cat || 'Uncategorized'}</Text>
          {items.map((tex) => (
            <div
              key={tex.id}
              className={`${classes.item} ${tex.id === selectedId ? classes.itemSelected : ''}`}
              onClick={() => onSelect(tex.id)}
            >
              {tex.textureUrl
                ? <img className={classes.thumb} src={tex.textureUrl} alt="" />
                : <div
                    className={classes.colorSwatch}
                    style={{ background: `#${tex.layoutColor.toString(16).padStart(6, '0')}` }}
                  />
              }
              <div className={classes.itemInfo}>
                <Text className={classes.itemName}>{tex.name}</Text>
                <Text className={classes.itemMeta}>
                  {SURFACE_LABEL[tex.surface] ?? tex.surface} · {tex.tier}
                </Text>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
