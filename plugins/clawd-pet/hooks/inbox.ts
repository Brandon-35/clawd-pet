import type { SessionReceiveOrigin } from 'claude-code'

import { clean } from './peers'

/** What starts a `/clawd note`: the receiving clawd-pet takes such a message before its model reads it. */
export const NOTE_PREFIX = 'clawd-pet note: '
/** The longest note passed on or shown; the rest is cut. */
export const NOTE_MAX = 300
const FROM_MAX = 40
const TOAST_BODY = 80
const MAX_TEXT = 4000

/** A note another session sent, kept in memory for `/clawd`. */
export type Note = { from?: string; text: string; at: number }

/**
 * The sender's name and the body of a delivery: the `from-name` and inner text of a cross-session envelope, or the
 * whole text without one. Every value came from another process: control characters out, whitespace collapsed.
 */
export function unwrap(text: string): { from?: string; body: string } {
  const envelope = /<cross-session-message\b([^>]*)>([\s\S]*?)<\/cross-session-message>/.exec(text)
  const [, name] = /\bfrom-name="([^"]*)"/.exec(envelope?.[1] ?? '') ?? []
  const from = clean(name ?? '', FROM_MAX)

  return { ...(from !== '' && { from }), body: clean(envelope ? envelope[2] ?? '' : text, MAX_TEXT) }
}

/** Whether a delivery is a `/clawd note`: a message another session's clawd-pet composed with the note prefix. */
export function isNote(origin: SessionReceiveOrigin, body: string) {
  return (origin.kind === 'peer' || origin.kind === 'coordinator') && origin.plugin === 'clawd-pet' && body.startsWith(NOTE_PREFIX)
}

/** The note in a body `isNote` accepted, without the prefix, cut to 300 characters. */
export const noteText = (body: string) => [...body.slice(NOTE_PREFIX.length).trim()].slice(0, NOTE_MAX).join('')

const cut = (s: string, max: number) => ([...s].length > max ? `${[...s].slice(0, max).join('')}…` : s)

/** The toast for a message from another session that this session's model will read. */
export const messageToast = (from: string | undefined, body: string) => `✉ ${from ?? 'another session'}: ${cut(body, TOAST_BODY)}`

/** The toast for a note from another session, which only the person here sees. */
export const noteToast = (from: string | undefined, note: string) => `✎ note from ${from ?? 'another session'}: ${note}`

/** The notes with `note` added, the latest first, at most `n`. */
export const keepNotes = (list: Note[], note: Note, n = 3) => [note, ...list].slice(0, n)

const ago = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))

  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`
}

/** The report's line on the notes kept at `now`, or '' when there is none. */
export function notesLine(list: Note[], now: number) {
  return list.length === 0 ? '' : `- notes: ${list.map(n => `"${n.text}" (${n.from ?? 'another session'}, ${ago(now - n.at)} ago)`).join(' · ')}`
}
