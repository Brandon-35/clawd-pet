import { expect, test } from 'claude-code/testing'

import { isCheckCommand, isCodeFile, newTurnChecks, noteCommand, noteEdit, untestedWarning } from './checks'

test('source files are code; docs, config, data and images are not', () => {
  for (const p of ['/a/app.ts', 'b.TSX', 'x.mjs', 'main.py', 'lib.rs', 'App.swift', 'run.sh', 'View.vue', 'q.sql', 'k.cpp']) {
    expect(isCodeFile(p)).toBe(true)
  }
  for (const p of ['README.md', 'notes.mdx', 'package.json', 'ci.yml', 'Cargo.toml', 'bun.lock', 'a.csv', 'logo.png', 'Makefile', '/a/ts']) {
    expect(isCodeFile(p)).toBe(false)
  }
})

test('tests, type checks, lints and builds are checks', () => {
  const checks = [
    'npm test',
    'pnpm run lint',
    'npx vitest run',
    'pytest -q',
    'go test ./...',
    'cargo clippy',
    'cargo build --release',
    'tsc -p .',
    'npx eslint src',
    'ruff check .',
    'mypy app',
    'make',
    './gradlew assemble',
    'xcodebuild -scheme App',
    'swift build',
    'dotnet test',
    'flutter analyze',
    'claude plugin validate . --strict',
    'npm run typecheck',
  ]
  for (const c of checks) {
    expect(isCheckCommand(c)).toBe(true)
  }
})

test('other commands are not checks, and a word inside a longer one does not count', () => {
  for (const c of ['git status', 'npm install left-pad@latest', 'cat contest.txt', 'git checkout main', 'ls -la', 'rebuilder --x']) {
    expect(isCheckCommand(c)).toBe(false)
  }
})

test('a check word in a path counts too (cat build.log), which only spares a toast', () => {
  expect(isCheckCommand('cat build.log')).toBe(true)
})

test('two distinct code files and no check warn; one file, a repeat, or docs do not', () => {
  let t = noteEdit(newTurnChecks(), '/a/app.ts')
  expect(untestedWarning(t)).toBe(undefined)
  t = noteEdit(t, '/a/app.ts')
  t = noteEdit(t, '/a/README.md')
  expect(untestedWarning(t)).toBe(undefined)
  t = noteEdit(noteEdit(t, '/a/b.ts'), '/a/c.py')
  expect(untestedWarning(t)).toBe('edited 3 code files this turn and ran no tests or checks')
})

test('a check, before or after the edits, silences the warning; another command does not', () => {
  const edited = noteEdit(noteEdit(newTurnChecks(), '/a/x.ts'), '/a/y.ts')
  expect(untestedWarning(noteCommand(edited, 'git diff'))).toBe('edited 2 code files this turn and ran no tests or checks')
  expect(untestedWarning(noteCommand(edited, 'npm test'))).toBe(undefined)
  const early = noteEdit(noteEdit(noteCommand(newTurnChecks(), 'tsc'), '/a/x.ts'), '/a/y.ts')
  expect(untestedWarning(early)).toBe(undefined)
})
