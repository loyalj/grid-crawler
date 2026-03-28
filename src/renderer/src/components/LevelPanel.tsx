import { useMapStore } from '../store/mapStore'

export function LevelPanel() {
  const project = useMapStore((s) => s.project)
  const activeLevelId = useMapStore((s) => s.activeLevelId)
  const setActiveLevel = useMapStore((s) => s.setActiveLevel)
  const addDungeonLevel = useMapStore((s) => s.addDungeonLevel)
  const removeDungeonLevel = useMapStore((s) => s.removeDungeonLevel)

  if (!project) {
    return (
      <div className="level-panel">
        <p className="panel-empty">No map open</p>
      </div>
    )
  }

  const levels = [project.overworld, ...project.dungeonLevels]

  return (
    <div className="level-panel">
      <div className="panel-header">
        <span className="panel-project-name">{project.name}</span>
        <span className="panel-version">v{project.version}</span>
      </div>

      <section className="panel-section">
        <h3>Levels</h3>
        <ul className="level-list">
          {levels.map((level) => (
            <li
              key={level.id}
              className={`level-item ${activeLevelId === level.id ? 'active' : ''}`}
              onClick={() => setActiveLevel(level.id)}
            >
              <span className="level-badge">
                {level.depth === 0 ? 'OW' : `B${level.depth}`}
              </span>
              <span className="level-name">{level.name}</span>
              <span className="level-size">
                {level.grid.width}×{level.grid.height}
              </span>
              {level.depth > 0 && (
                <button
                  className="btn-icon danger"
                  title="Remove level"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Remove "${level.name}"?`)) removeDungeonLevel(level.id)
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <button className="btn-secondary full-width" onClick={addDungeonLevel}>
          + Add Level
        </button>
      </section>
    </div>
  )
}
