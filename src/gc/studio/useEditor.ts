import { useCallback, useReducer } from 'react'
import { type Design } from './model'

interface State { design: Design; page: number; selected: string | null; past: Design[]; future: Design[]; dirty: boolean; lastKey: string | null }
type Action =
  | { t: 'load'; design: Design }
  | { t: 'commit'; design: Design; key?: string }   // alteração discreta (entra no histórico; chaves iguais consecutivas se fundem)
  | { t: 'begin' }                                   // início de arraste: guarda estado para desfazer
  | { t: 'live'; design: Design }                    // alteração contínua sem histórico
  | { t: 'select'; id: string | null }
  | { t: 'page'; index: number }
  | { t: 'undo' } | { t: 'redo' } | { t: 'saved' }

const LIMIT = 80
function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'load': return { design: a.design, page: 0, selected: null, past: [], future: [], dirty: false, lastKey: null }
    case 'commit': {
      const merge = a.key && a.key === s.lastKey
      return { ...s, design: a.design, dirty: true, lastKey: a.key ?? null, future: [], past: merge ? s.past : [...s.past, s.design].slice(-LIMIT) }
    }
    case 'begin': return { ...s, past: [...s.past, s.design].slice(-LIMIT), future: [], lastKey: 'drag' }
    case 'live': return { ...s, design: a.design, dirty: true }
    case 'select': return { ...s, selected: a.id }
    case 'page': return { ...s, page: Math.min(Math.max(a.index, 0), s.design.pages.length - 1), selected: null }
    case 'undo': { const prev = s.past.at(-1); if (!prev) return s
      return { ...s, design: prev, past: s.past.slice(0, -1), future: [s.design, ...s.future], dirty: true, lastKey: null, page: Math.min(s.page, prev.pages.length - 1), selected: null } }
    case 'redo': { const next = s.future[0]; if (!next) return s
      return { ...s, design: next, past: [...s.past, s.design], future: s.future.slice(1), dirty: true, lastKey: null, page: Math.min(s.page, next.pages.length - 1), selected: null } }
    case 'saved': return { ...s, dirty: false }
  }
}

export function useEditor(initial: Design) {
  const [s, dispatch] = useReducer(reducer, { design: initial, page: 0, selected: null, past: [], future: [], dirty: false, lastKey: null })
  const api = {
    load: useCallback((design: Design) => dispatch({ t: 'load', design }), []),
    commit: useCallback((design: Design, key?: string) => dispatch({ t: 'commit', design, key }), []),
    begin: useCallback(() => dispatch({ t: 'begin' }), []),
    live: useCallback((design: Design) => dispatch({ t: 'live', design }), []),
    select: useCallback((id: string | null) => dispatch({ t: 'select', id }), []),
    goPage: useCallback((index: number) => dispatch({ t: 'page', index }), []),
    undo: useCallback(() => dispatch({ t: 'undo' }), []),
    redo: useCallback(() => dispatch({ t: 'redo' }), []),
    markSaved: useCallback(() => dispatch({ t: 'saved' }), []),
  }
  return { state: s, ...api, canUndo: s.past.length > 0, canRedo: s.future.length > 0 }
}
