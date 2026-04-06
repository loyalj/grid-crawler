import { Text, UnstyledButton } from '@mantine/core'
import { ObjectDefinition, TokenDefinition } from '../types/map'
import classes from './CatalogBrowser.module.css'

function TokenIcon({ def }: { def: TokenDefinition }) {
  return (
    <div
      className={classes.tokenIcon}
      style={{ background: def.visual.bgColor, border: `2px solid ${def.visual.borderColor}`, color: def.visual.fgColor }}
      dangerouslySetInnerHTML={{ __html: def.visual.iconContent }}
    />
  )
}

function PropThumb({ def }: { def: ObjectDefinition & { kind: 'prop' } }) {
  return def.visual.textureUrl
    ? <img className={classes.propThumb} src={def.visual.textureUrl} alt="" />
    : <div className={classes.propThumbPlaceholder} />
}

interface Props {
  objects:          ObjectDefinition[]
  tokenCategories:  string[]
  propCategories:   string[]
  selectedId:       string | null
  onSelect:         (id: string) => void
}

export function CatalogBrowser({ objects, tokenCategories, propCategories, selectedId, onSelect }: Props) {
  const tokens = objects.filter((o) => o.kind === 'token')
  const props  = objects.filter((o) => o.kind === 'prop')

  function renderGroup(kind: 'token' | 'prop', category: string, items: ObjectDefinition[]) {
    const filtered = items.filter((o) => o.category === category)
    if (filtered.length === 0) return null
    const label = category.charAt(0).toUpperCase() + category.slice(1)
    return (
      <div key={`${kind}-${category}`}>
        <Text className={classes.groupLabel}>{label}</Text>
        {filtered.map((def) => (
          <UnstyledButton
            key={def.id}
            className={classes.item}
            data-active={selectedId === def.id || undefined}
            onClick={() => onSelect(def.id)}
          >
            <div className={classes.thumb}>
              {def.kind === 'token'
                ? <TokenIcon def={def as TokenDefinition} />
                : <PropThumb def={def as ObjectDefinition & { kind: 'prop' }} />}
            </div>
            <div className={classes.itemText}>
              <Text className={classes.itemName} title={def.name}>{def.name}</Text>
              {def.tier === 'project' && <Text className={classes.tierBadge}>Project</Text>}
            </div>
          </UnstyledButton>
        ))}
      </div>
    )
  }

  // Also render objects whose category isn't in the ordered list
  function uncategorized(kind: 'token' | 'prop', knownCats: string[], items: ObjectDefinition[]) {
    const extra = [...new Set(items.filter((o) => o.kind === kind && !knownCats.includes(o.category)).map((o) => o.category))]
    return extra.map((cat) => renderGroup(kind, cat, items))
  }

  return (
    <div>
      {tokens.length > 0 && (
        <>
          <Text className={classes.kindLabel}>Tokens</Text>
          {tokenCategories.map((cat) => renderGroup('token', cat, tokens))}
          {uncategorized('token', tokenCategories, tokens)}
        </>
      )}
      {props.length > 0 && (
        <>
          <Text className={classes.kindLabel}>Props</Text>
          {propCategories.map((cat) => renderGroup('prop', cat, props))}
          {uncategorized('prop', propCategories, props)}
        </>
      )}
      {objects.length === 0 && (
        <Text size="xs" c="dimmed" fs="italic" p={8}>No objects found.</Text>
      )}
    </div>
  )
}
