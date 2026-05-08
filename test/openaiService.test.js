import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLmStudio, transcriptionConfigured, translationConfigured } from '../server/openaiService.js'

test('detectLmStudio returns true when the local server responds', async () => {
  const originalFetch = global.fetch
  const originalBaseUrl = process.env.OPENAI_BASE_URL

  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:1234/v1'
  global.fetch = async (url) => {
    assert.equal(url, 'http://127.0.0.1:1234/v1/models')
    return { ok: true }
  }

  try {
    assert.equal(await detectLmStudio(), true)
  } finally {
    global.fetch = originalFetch
    process.env.OPENAI_BASE_URL = originalBaseUrl
  }
})

test('translation and transcription config accept LM Studio without an API key', async () => {
  const originalFetch = global.fetch
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalTranslationApiKey = process.env.TRANSLATION_API_KEY
  const originalBaseUrl = process.env.OPENAI_BASE_URL
  const originalTranslationProvider = process.env.TRANSLATION_PROVIDER
  const originalTranscriptionProvider = process.env.TRANSCRIPTION_PROVIDER

  process.env.OPENAI_API_KEY = ''
  process.env.TRANSLATION_API_KEY = ''
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:1234/v1'
  process.env.TRANSLATION_PROVIDER = 'openai'
  process.env.TRANSCRIPTION_PROVIDER = 'openai'
  global.fetch = async () => ({ ok: true })

  try {
    assert.equal(await translationConfigured(), true)
    assert.equal(await transcriptionConfigured(), true)
  } finally {
    global.fetch = originalFetch
    process.env.OPENAI_API_KEY = originalApiKey
    process.env.TRANSLATION_API_KEY = originalTranslationApiKey
    process.env.OPENAI_BASE_URL = originalBaseUrl
    process.env.TRANSLATION_PROVIDER = originalTranslationProvider
    process.env.TRANSCRIPTION_PROVIDER = originalTranscriptionProvider
  }
})
