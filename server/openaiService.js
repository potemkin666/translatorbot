import OpenAI, { toFile } from 'openai'
import { defaultFallbackTargetLanguage, isShortPhrase } from '../shared/textTools.js'

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

function getClient(kind) {
  const apiKey = getApiKey(kind)
  if (!apiKey) {
    return null
  }

  return new OpenAI({ apiKey })
}

export function translationConfigured() {
  return getProvider('translation') === 'openai' && Boolean(getApiKey('translation'))
}

export function transcriptionConfigured() {
  return getProvider('transcription') === 'openai' && Boolean(getApiKey('transcription'))
}

export async function translateText({ text, sourceLanguage = 'Auto-detect', targetLanguage, fallbackTargetLanguage }) {
  if (!translationConfigured()) {
    const error = new Error('Translation provider is not configured.')
    error.statusCode = 500
    throw error
  }

  const client = getClient('translation')
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
  if (!transcriptionConfigured()) {
    const error = new Error('Audio transcription failed.')
    error.statusCode = 500
    throw error
  }

  const client = getClient('transcription')
  const transcription = await client.audio.transcriptions.create({
    file: await toFile(buffer, filename, { type: mimeType }),
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  })

  return transcription.text || ''
}
