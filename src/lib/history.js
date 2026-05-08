import { HISTORY_LIMIT, createPreview } from '../../shared/textTools.js'

export const HISTORY_STORAGE_KEY = 'translatorbot-history'

export function loadHistory(storage) {
  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistory(storage, history) {
  if (!storage) {
    return
  }

  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)))
}

export function buildHistoryEntry({
  mode,
  sourceLanguage,
  targetLanguage,
  originalText,
  translationText,
  fileName = '',
  dictionary = null,
  transcript = '',
}) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    mode,
    sourceLanguage,
    targetLanguage,
    timestamp: new Date().toISOString(),
    originalPreview: createPreview(originalText),
    translationPreview: createPreview(translationText),
    originalText,
    translationText,
    fileName,
    dictionary,
    transcript,
  }
}

export function addHistoryEntry(history, entry) {
  return [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT)
}
