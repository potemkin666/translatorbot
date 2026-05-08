import OpenAI, { toFile } from 'openai'
import { defaultFallbackTargetLanguage, isShortPhrase } from '../shared/textTools.js'
import { DEFAULT_LM_STUDIO_BASE_URL } from './configStore.js'

function getApiKey(kind) {
  if (kind === 'translation') {
    return process.env.TRANSLATION_API_KEY || process.env.OPENAI_API_KEY || ''
  }

  return process.env.OPENAI_API_KEY || process.env.TRANSLATION_API_KEY || ''
}

function getProvider(kind) {
  if (kind === 'translation') {
    return (process.env.TRANSLATION_PROVIDER || '').toLowerCase()
  }

  return (process.env.TRANSCRIPTION_PROVIDER || '').toLowerCase()
}

function getBaseUrl() {
  return String(process.env.OPENAI_BASE_URL || process.env.LM_STUDIO_BASE_URL || '').trim()
}

function getLmStudioBaseUrl() {
  return getBaseUrl() || DEFAULT_LM_STUDIO_BASE_URL
}

export async function detectLmStudio() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1200)

  try {
    const response = await fetch(`${getLmStudioBaseUrl().replace(/\/$/, '')}/models`, {
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function getClient(kind) {
  const apiKey = getApiKey(kind)
  if (apiKey) {
    return new OpenAI({
      apiKey,
      ...(getBaseUrl() ? { baseURL: getBaseUrl() } : {}),
    })
  }

  const lmStudioDetected = await detectLmStudio()
  if (!lmStudioDetected) {
    return null
  }

  return new OpenAI({
    apiKey: 'lm-studio',
    baseURL: getLmStudioBaseUrl(),
  })
}

export async function translationConfigured() {
  return getProvider('translation') === 'openai' && Boolean(await getClient('translation'))
}

export async function transcriptionConfigured() {
  return getProvider('transcription') === 'openai' && Boolean(await getClient('transcription'))
}

export async function translateText({ text, sourceLanguage = 'Auto-detect', targetLanguage, fallbackTargetLanguage }) {
  if (!await translationConfigured()) {
    const error = new Error('Translation provider is not configured.')
    error.statusCode = 500
    throw error
  }

  const client = await getClient('translation')
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You are an expert translation engine for a desktop-friendly translation workspace.',
          'Return strict JSON with keys detectedLanguage, translation, targetLanguageUsed, switchedTargetLanguage, dictionary.',
          'If detectedLanguage matches the requested targetLanguage, translate into fallbackTargetLanguage instead and set switchedTargetLanguage to that value.',
          'dictionary must be null for long text. For short single words or short phrases include an object with definition, partOfSpeech, exampleSentence, alternatives.',
          'Keep translations natural, preserve formatting, and never add commentary outside JSON.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          text,
          sourceLanguage,
          targetLanguage,
          fallbackTargetLanguage: fallbackTargetLanguage || defaultFallbackTargetLanguage(targetLanguage),
          includeDictionary: isShortPhrase(text),
        }),
      },
    ],
  })

  const payload = JSON.parse(completion.choices[0]?.message?.content || '{}')
  return {
    detectedLanguage: payload.detectedLanguage || sourceLanguage,
    translation: payload.translation || '',
    targetLanguageUsed: payload.targetLanguageUsed || targetLanguage,
    switchedTargetLanguage: payload.switchedTargetLanguage || null,
    dictionary: payload.dictionary || null,
  }
}

export async function transcribeAudio({ buffer, filename, mimeType }) {
  if (!await transcriptionConfigured()) {
    const error = new Error('Audio transcription failed.')
    error.statusCode = 500
    throw error
  }

  const client = await getClient('transcription')
  const transcription = await client.audio.transcriptions.create({
    file: await toFile(buffer, filename, { type: mimeType }),
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  })

  return transcription.text || ''
}
