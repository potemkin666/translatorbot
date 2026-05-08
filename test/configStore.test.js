import test from 'node:test'
import assert from 'node:assert/strict'
import { updateEnvFileContent } from '../server/configStore.js'

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
