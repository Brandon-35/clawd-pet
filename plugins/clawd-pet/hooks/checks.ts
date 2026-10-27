/** A turn that edits at least this many code files and runs no check gets a toast; one small fix does not. */
export const UNTESTED_FILES = 2

const MAX_EDITED = 1000 // past this, new files stop counting rather than grow the list

/** Source code, as opposed to docs, config, data and images. */
const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|sh|zsh|vue|svelte|dart|lua|sql)$/i

/**
 * A command that tests, type-checks, lints or builds. Whole words only, so `latest` and `checkout` do not count;
 * a word in a path or file name does (`cat build.log`), which only spares a toast.
 */
const CHECK_WORD =
  /\b(test|tests|unittest|jest|vitest|pytest|mocha|rspec|phpunit|ctest|tsc|eslint|biome|ruff|mypy|pyright|clippy|lint|build|typecheck|type-check|check|validate|analyze|make|gradle|gradlew|mvn|xcodebuild)\b/i

/** Whether `path` is a source file whose edit a check should follow. */
export const isCodeFile = (path: string) => CODE_EXT.test(path)

/** Whether a Bash `command` runs tests, a type check, a linter or a build. */
export const isCheckCommand = (command: string) => CHECK_WORD.test(command)

/** What the main loop's turn edited and whether it ran a check, its subagents' calls included. */
export type TurnChecks = { edited: string[]; checked: boolean }

export const newTurnChecks = (): TurnChecks => ({ edited: [], checked: false })

/** `t` after an edit of `path`: a code file counts once. */
export function noteEdit(t: TurnChecks, path: string): TurnChecks {
  return isCodeFile(path) && !t.edited.includes(path) && t.edited.length < MAX_EDITED ? { ...t, edited: [...t.edited, path] } : t
}

/** `t` after a Bash `command` ran; a failing check still counts as one. */
export const noteCommand = (t: TurnChecks, command: string): TurnChecks => (t.checked || !isCheckCommand(command) ? t : { ...t, checked: true })

/** The toast for a turn that edited code files and ran no check, or undefined. */
export function untestedWarning(t: TurnChecks) {
  return t.edited.length >= UNTESTED_FILES && !t.checked ? `edited ${t.edited.length} code files this turn and ran no tests or checks` : undefined
}
