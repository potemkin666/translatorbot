export const HISTORY_LIMIT = 20

export const LANGUAGE_OPTIONS = [
  'Albanian',
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Polish',
  'Japanese',
  'Korean',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Arabic',
  'Hindi',
  'Russian',
  'Turkish',
  'Ukrainian',
]

export function cleanExtractedText(input = '') {
  const normalized = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/([\p{L}])-\n(?=[\p{L}])/gu, '$1')
    .replace(/\n(?=[•▪◦–—*-]\s)/g, '\n\n')
    .replace(/\n(?=\d+[.)]\s)/g, '\n\n')

  return normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function splitIntoParagraphs(input = '') {
  return input
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function createPreview(input = '', maxLength = 120) {
  const collapsed = input.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) {
    return collapsed
  }

  return `${collapsed.slice(0, maxLength - 1)}…`
}

export function isShortPhrase(input = '') {
  const trimmed = input.trim()
  if (!trimmed) {
    return false
  }

  const words = trimmed.split(/\s+/)
  return words.length <= 4 && trimmed.length <= 48
}

export function defaultFallbackTargetLanguage(targetLanguage = 'Spanish') {
  if (targetLanguage === 'English') {
    return 'Spanish'
  }

  if (targetLanguage === 'Spanish') {
    return 'English'
  }

  return 'English'
}
