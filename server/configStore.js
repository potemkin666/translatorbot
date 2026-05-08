import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_ENV_PATH = path.resolve(__dirname, '../.env')
const ENV_KEY_PATTERN = /^([A-Z0-9_]+)=.*$/

function normalizeEnvValue(value = '') {
  return String(value).trim().replace(/\r?\n/g, '')
}

function formatEnvValue(value = '') {
  const normalized = normalizeEnvValue(value)
  if (!normalized) {
    return ''
  }

  return /[\s#"'`\\]/.test(normalized) ? JSON.stringify(normalized) : normalized
}

function getStoredApiKey() {
  return normalizeEnvValue(process.env.OPENAI_API_KEY || process.env.TRANSLATION_API_KEY || '')
}

export function updateEnvFileContent(existingContent = '', updates = {}) {
  const normalizedContent = existingContent.replace(/\r\n/g, '\n')
  const lines = normalizedContent ? normalizedContent.split('\n') : []
  const pendingKeys = new Set(Object.keys(updates))

  const nextLines = lines.map((line) => {
    const match = line.match(ENV_KEY_PATTERN)
    if (!match) {
      return line
    }

    const key = match[1]
    if (!Object.hasOwn(updates, key)) {
      return line
    }

    pendingKeys.delete(key)
    return `${key}=${formatEnvValue(updates[key])}`
  })

  Object.keys(updates).forEach((key) => {
    if (pendingKeys.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(updates[key])}`)
    }
  })

  return `${nextLines.join('\n').replace(/\n+$/g, '')}\n`
}

export function saveSetupConfiguration({
  openAIApiKey = '',
  enableTranslation = true,
  enableTranscription = true,
  envPath = DEFAULT_ENV_PATH,
}) {
  if (!enableTranslation && !enableTranscription) {
    const error = new Error('Choose at least one feature to configure.')
    error.statusCode = 400
    throw error
  }

  const existingKey = getStoredApiKey()
  const nextKey = normalizeEnvValue(openAIApiKey) || existingKey
  if (!nextKey) {
    const error = new Error('Enter your OpenAI API key to finish setup.')
    error.statusCode = 400
    throw error
  }

  let existingContent = ''
  try {
    existingContent = fs.readFileSync(envPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
  const nextContent = updateEnvFileContent(existingContent, {
    OPENAI_API_KEY: nextKey,
    TRANSLATION_PROVIDER: enableTranslation ? 'openai' : '',
    TRANSCRIPTION_PROVIDER: enableTranscription ? 'openai' : '',
  })

  fs.writeFileSync(envPath, nextContent, 'utf8')

  process.env.OPENAI_API_KEY = nextKey
  process.env.TRANSLATION_PROVIDER = enableTranslation ? 'openai' : ''
  process.env.TRANSCRIPTION_PROVIDER = enableTranscription ? 'openai' : ''

  return {
    sharedApiKeyConfigured: true,
  }
}

export function sharedApiKeyConfigured() {
  return Boolean(getStoredApiKey())
}
