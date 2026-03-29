import { MapProject } from './map'

/**
 * A reversible document mutation.
 *
 * Both `execute` and `undo` receive the current project and return a new
 * project — they are pure functions and must not mutate their argument.
 * The store owns the undo/redo stacks and calls these methods.
 */
export interface Command {
  /** Human-readable label shown in the undo history (e.g. "Add room") */
  readonly description: string
  execute(project: MapProject): MapProject
  undo(project: MapProject): MapProject
}
