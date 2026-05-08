import test from 'node:test'
import assert from 'node:assert/strict'
import { addHistoryEntry, buildHistoryEntry } from '../src/lib/history.js'
import { cleanExtractedText, defaultFallbackTargetLanguage, isShortPhrase, LANGUAGE_OPTIONS } from '../shared/textTools.js'

test('cleanExtractedText merges PDF line breaks and hyphenation', () => {
  const raw = 'This para-\ngraph has bro-\nken lines.\nIt should flow.\n\nSecond  paragraph.'
  assert.equal(cleanExtractedText(raw), 'This paragraph has broken lines. It should flow.\n\nSecond paragraph.')
})

test('isShortPhrase identifies dictionary-sized input', () => {
  assert.equal(isShortPhrase('blue whale'), true)
  assert.equal(isShortPhrase('This is definitely too long for dictionary mode output.'), false)
})

test('defaultFallbackTargetLanguage switches English and Spanish', () => {
  assert.equal(defaultFallbackTargetLanguage('English'), 'Spanish')
  assert.equal(defaultFallbackTargetLanguage('Spanish'), 'English')
  assert.equal(defaultFallbackTargetLanguage('German'), 'English')
})

test('history entries are capped at twenty items', () => {
  const history = Array.from({ length: 20 }, (_, index) => buildHistoryEntry({
    mode: 'text',
    sourceLanguage: 'English',
    targetLanguage: 'Spanish',
    originalText: `Original ${index}`,
    translationText: `Translation ${index}`,
  }))

  const nextHistory = addHistoryEntry(history, buildHistoryEntry({
    mode: 'copy',
    sourceLanguage: 'German',
    targetLanguage: 'English',
    originalText: 'Neu',
    translationText: 'New',
  }))

  assert.equal(nextHistory.length, 20)
  assert.equal(nextHistory[0].mode, 'copy')
})

test('language options include Albanian and Russian', () => {
  assert.equal(LANGUAGE_OPTIONS.includes('Albanian'), true)
  assert.equal(LANGUAGE_OPTIONS.includes('Russian'), true)
})
