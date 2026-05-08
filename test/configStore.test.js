import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_LM_STUDIO_BASE_URL, saveSetupConfiguration, updateEnvFileContent } from '../server/configStore.js'

test('updateEnvFileContent updates known keys and keeps unrelated lines', () => {
  const initial = [
    'OPENAI_API_KEY=old-key',
    'TRANSLATION_PROVIDER=',
    'CUSTOM_FLAG=yes',
    '',
  ].join('\n')

  const next = updateEnvFileContent(initial, {
    OPENAI_API_KEY: 'new-key',
    TRANSLATION_PROVIDER: 'openai',
    TRANSCRIPTION_PROVIDER: 'openai',
  })

  assert.equal(next, [
    'OPENAI_API_KEY=new-key',
    'TRANSLATION_PROVIDER=openai',
    'CUSTOM_FLAG=yes',
    '',
    'TRANSCRIPTION_PROVIDER=openai',
    '',
  ].join('\n'))
})

test('updateEnvFileContent quotes values that contain spaces', () => {
  const next = updateEnvFileContent('', {
    OPENAI_API_KEY: 'sk demo key',
  })

  assert.equal(next, 'OPENAI_API_KEY="sk demo key"\n')
})

test('saveSetupConfiguration accepts LM Studio when no API key is provided', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translatorbot-config-'))
  const envPath = path.join(tempDir, '.env')
  const originalApiKey = process.env.OPENAI_API_KEY
  const originalBaseUrl = process.env.OPENAI_BASE_URL
  const originalTranslationProvider = process.env.TRANSLATION_PROVIDER
  const originalTranscriptionProvider = process.env.TRANSCRIPTION_PROVIDER

  process.env.OPENAI_API_KEY = ''
  process.env.OPENAI_BASE_URL = ''
  process.env.TRANSLATION_PROVIDER = ''
  process.env.TRANSCRIPTION_PROVIDER = ''

  try {
    const result = saveSetupConfiguration({
      openAIApiKey: '',
      enableTranslation: true,
      enableTranscription: false,
      envPath,
      lmStudioDetected: true,
    })

    const nextContent = fs.readFileSync(envPath, 'utf8')
    assert.equal(result.sharedApiKeyConfigured, false)
    assert.equal(result.llmStudioDetected, true)
    assert.match(nextContent, new RegExp(`OPENAI_BASE_URL=${DEFAULT_LM_STUDIO_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.match(nextContent, /TRANSLATION_PROVIDER=openai/)
    assert.match(nextContent, /TRANSCRIPTION_PROVIDER=\n/)
  } finally {
    process.env.OPENAI_API_KEY = originalApiKey
    process.env.OPENAI_BASE_URL = originalBaseUrl
    process.env.TRANSLATION_PROVIDER = originalTranslationProvider
    process.env.TRANSCRIPTION_PROVIDER = originalTranscriptionProvider
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
