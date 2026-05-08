import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './index.css'
import {
  cleanExtractedText,
  createPreview,
  defaultFallbackTargetLanguage,
  LANGUAGE_OPTIONS,
  splitIntoParagraphs,
} from '../shared/textTools.js'
import {
  addHistoryEntry,
  buildHistoryEntry,
  loadHistory,
  saveHistory,
} from './lib/history.js'

const TAB_ORDER = [
  'copy',
  'text',
  'audio',
  'document',
  'reading',
  'contrast',
  'dictionary',
]

const TAB_META = {
  copy: { title: 'Copy Mode', blurb: 'Clipboard-driven instant translation with explicit listening.' },
  text: { title: 'Text Mode', blurb: 'Manual drafting, translating, copying, and exporting.' },
  audio: { title: 'Audio Mode', blurb: 'Upload speech, capture transcripts, then translate.' },
  document: { title: 'Document Mode', blurb: 'Extract text from PDFs, DOCX, and TXT before translating.' },
  reading: { title: 'Reading Mode', blurb: 'Focused translated reading with the original tucked away.' },
  contrast: { title: 'Contrast Mode', blurb: 'Side-by-side paragraph comparison for dense documents.' },
  dictionary: { title: 'Dictionary Mode', blurb: 'Short-phrase definitions, parts of speech, and alternatives.' },
}

const EMPTY_RESULT = {
  mode: 'text',
  sourceText: '',
  translationText: '',
  sourceLanguage: 'Auto-detect',
  targetLanguage: 'Spanish',
  detectedLanguage: '',
  fileName: '',
  dictionary: null,
  transcript: '',
  preview: '',
}

const DEFAULT_CONFIG = {
  maxUploadMb: 25,
  sharedApiKeyConfigured: false,
  translationConfigured: false,
  transcriptionConfigured: false,
}

function buildSetupFormState(nextConfig = DEFAULT_CONFIG) {
  return {
    openAIApiKey: '',
    enableTranslation: nextConfig.translationConfigured || !nextConfig.transcriptionConfigured,
    enableTranscription: nextConfig.transcriptionConfigured || !nextConfig.translationConfigured,
  }
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.')
  }

  return payload
}

function App() {
  const clipboardRef = useRef({ busy: false, lastText: '' })
  const [activeTab, setActiveTab] = useState('copy')
  const [targetLanguage, setTargetLanguage] = useState('Spanish')
  const [copySource, setCopySource] = useState('')
  const [copyTranslation, setCopyTranslation] = useState('')
  const [copyListening, setCopyListening] = useState(false)
  const [incrementalCopy, setIncrementalCopy] = useState(false)
  const [textSource, setTextSource] = useState('')
  const [textTranslation, setTextTranslation] = useState('')
  const [audioState, setAudioState] = useState({ fileName: '', transcript: '', translation: '' })
  const [documentState, setDocumentState] = useState({ fileName: '', preview: '', translation: '' })
  const [currentResult, setCurrentResult] = useState(EMPTY_RESULT)
  const [history, setHistory] = useState(() => loadHistory(typeof window !== 'undefined' ? window.localStorage : null))
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busyLabel, setBusyLabel] = useState('')
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [setupBusy, setSetupBusy] = useState(false)
  const [setupErrorMessage, setSetupErrorMessage] = useState('')
  const [setupForm, setSetupForm] = useState(() => buildSetupFormState(DEFAULT_CONFIG))
  const [lastDetectedLanguage, setLastDetectedLanguage] = useState('English')

  const paragraphPairs = useMemo(() => {
    const sourceParagraphs = splitIntoParagraphs(currentResult.sourceText)
    const translationParagraphs = splitIntoParagraphs(currentResult.translationText)
    return sourceParagraphs.map((paragraph, index) => ({
      source: paragraph,
      translation: translationParagraphs[index] || '',
      id: `${index}-${paragraph.slice(0, 12)}`,
    }))
  }, [currentResult])

  const missingSetupItems = useMemo(() => ([
    !config.translationConfigured ? 'translation' : null,
    !config.transcriptionConfigured ? 'transcription' : null,
  ].filter(Boolean)), [config])

  const loadHealthConfig = useCallback(async () => {
    const payload = await parseResponse(await fetch('/api/health'))
    const nextConfig = { ...DEFAULT_CONFIG, ...payload }
    setConfig(nextConfig)
    setSetupForm((current) => ({
      ...buildSetupFormState(nextConfig),
      openAIApiKey: current.openAIApiKey,
    }))
    setSetupModalOpen(!nextConfig.translationConfigured || !nextConfig.transcriptionConfigured)
    return nextConfig
  }, [])

  useEffect(() => {
    loadHealthConfig().catch(() => {
      setConfig(DEFAULT_CONFIG)
      setSetupForm(buildSetupFormState(DEFAULT_CONFIG))
      setSetupModalOpen(true)
    })
  }, [loadHealthConfig])

  useEffect(() => {
    saveHistory(typeof window !== 'undefined' ? window.localStorage : null, history)
  }, [history])

  const requestTranslation = useCallback(async ({ text, mode, sourceLanguage = 'Auto-detect', fileName = '', transcript = '', preview = '' }) => {
    if (!config.translationConfigured) {
      setErrorMessage('Finish setup to start translating.')
      setSetupErrorMessage('')
      setSetupModalOpen(true)
      return null
    }

    const cleaned = cleanExtractedText(text)
    if (!cleaned.trim()) {
      setErrorMessage('No text found to translate.')
      return null
    }

    setErrorMessage('')
    setStatusMessage('')
    setBusyLabel('Translating...')

    try {
      const fallbackTargetLanguage =
        lastDetectedLanguage && lastDetectedLanguage !== targetLanguage
          ? lastDetectedLanguage
          : defaultFallbackTargetLanguage(targetLanguage)

      const payload = await parseResponse(
        await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleaned,
            sourceLanguage,
            targetLanguage,
            fallbackTargetLanguage,
          }),
        }),
      )

      const targetLanguageUsed = payload.targetLanguageUsed || targetLanguage
      const entry = buildHistoryEntry({
        mode,
        sourceLanguage: payload.detectedLanguage || sourceLanguage,
        targetLanguage: targetLanguageUsed,
        originalText: cleaned,
        translationText: payload.translation,
        fileName,
        dictionary: payload.dictionary,
        transcript,
      })

      setLastDetectedLanguage(payload.detectedLanguage || lastDetectedLanguage)
      setTargetLanguage(targetLanguageUsed)
      setCurrentResult({
        mode,
        sourceText: cleaned,
        translationText: payload.translation,
        sourceLanguage,
        targetLanguage: targetLanguageUsed,
        detectedLanguage: payload.detectedLanguage || sourceLanguage,
        fileName,
        dictionary: payload.dictionary,
        transcript,
        preview,
      })
      setHistory((existing) => addHistoryEntry(existing, entry))

      if (mode === 'copy') {
        setCopySource(cleaned)
        setCopyTranslation(payload.translation)
      }

      if (mode === 'text') {
        setTextSource(cleaned)
        setTextTranslation(payload.translation)
      }

      if (mode === 'audio') {
        setAudioState((existing) => ({
          ...existing,
          fileName,
          transcript,
          translation: payload.translation,
        }))
      }

      if (mode === 'document') {
        setDocumentState((existing) => ({
          ...existing,
          fileName,
          preview: preview || cleaned,
          translation: payload.translation,
        }))
      }

      setStatusMessage(
        payload.switchedTargetLanguage
          ? `Detected ${payload.detectedLanguage}. Target automatically switched to ${payload.switchedTargetLanguage}.`
          : 'Translation ready.',
      )

      return payload
    } catch (error) {
      setErrorMessage(error.message)
      return null
    } finally {
      setBusyLabel('')
    }
  }, [config.translationConfigured, lastDetectedLanguage, targetLanguage])

  const handleClipboardCapture = useCallback(async (clipboardText) => {
    const combined = incrementalCopy && copySource
      ? `${copySource}\n\n${clipboardText}`
      : clipboardText

    const cleaned = cleanExtractedText(combined)
    setCopySource(cleaned)
    await requestTranslation({ text: cleaned, mode: 'copy' })
  }, [copySource, incrementalCopy, requestTranslation])

  useEffect(() => {
    if (!copyListening) {
      return undefined
    }

    const interval = window.setInterval(async () => {
      if (clipboardRef.current.busy) {
        return
      }

      try {
        const clipboardText = await navigator.clipboard.readText()
        if (!clipboardText.trim() || clipboardText === clipboardRef.current.lastText) {
          return
        }

        clipboardRef.current.lastText = clipboardText
        clipboardRef.current.busy = true
        await handleClipboardCapture(clipboardText)
      } catch {
        setErrorMessage('Clipboard listening must be enabled first.')
      } finally {
        clipboardRef.current.busy = false
      }
    }, 1500)

    return () => window.clearInterval(interval)
  }, [copyListening, handleClipboardCapture])

  async function startClipboardListening() {
    setErrorMessage('')
    setStatusMessage('')

    try {
      const clipboardText = await navigator.clipboard.readText()
      clipboardRef.current.lastText = clipboardText
      setCopyListening(true)
      setStatusMessage('Clipboard listening is active.')
      if (clipboardText.trim()) {
        await handleClipboardCapture(clipboardText)
      }
    } catch {
      setErrorMessage('Clipboard listening must be enabled first.')
    }
  }

  function stopClipboardListening() {
    setCopyListening(false)
    setStatusMessage('Clipboard listening stopped.')
  }

  async function readClipboardOnce() {
    if (!copyListening) {
      setErrorMessage('Clipboard listening must be enabled first.')
      return
    }

    try {
      const clipboardText = await navigator.clipboard.readText()
      if (!clipboardText.trim()) {
        setErrorMessage('No text found to translate.')
        return
      }

      clipboardRef.current.lastText = clipboardText
      await handleClipboardCapture(clipboardText)
    } catch {
      setErrorMessage('Clipboard listening must be enabled first.')
    }
  }

  async function handleAudioUpload(event) {
    if (!config.transcriptionConfigured) {
      setErrorMessage('Finish setup to start transcribing audio.')
      setSetupErrorMessage('')
      setSetupModalOpen(true)
      return
    }

    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const supportedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm']
    if (!supportedTypes.includes(file.type)) {
      setErrorMessage('This file type is not supported.')
      return
    }

    if (file.size > config.maxUploadMb * 1024 * 1024) {
      setErrorMessage('File is too large.')
      return
    }

    setBusyLabel('Transcribing audio...')
    setErrorMessage('')
    setStatusMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      const payload = await parseResponse(await fetch('/api/transcribe', { method: 'POST', body: formData }))
      setAudioState({ fileName: payload.fileName, transcript: payload.transcript, translation: '' })
      setStatusMessage('Transcript ready. Translating transcript...')
      await requestTranslation({
        text: payload.transcript,
        mode: 'audio',
        fileName: payload.fileName,
        transcript: payload.transcript,
      })
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setBusyLabel('')
    }
  }

  async function handleDocumentUpload(event) {
    if (!config.translationConfigured) {
      setErrorMessage('Finish setup to start translating documents.')
      setSetupErrorMessage('')
      setSetupModalOpen(true)
      return
    }

    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'txt', 'docx'].includes(extension || '')) {
      setErrorMessage('This file type is not supported.')
      return
    }

    if (file.size > config.maxUploadMb * 1024 * 1024) {
      setErrorMessage('File is too large.')
      return
    }

    setBusyLabel('Extracting document text...')
    setErrorMessage('')
    setStatusMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      const payload = await parseResponse(await fetch('/api/document', { method: 'POST', body: formData }))
      setDocumentState({ fileName: payload.fileName, preview: payload.cleanedText, translation: '' })
      setStatusMessage('Document preview ready. Translating extracted text...')
      await requestTranslation({
        text: payload.cleanedText,
        mode: 'document',
        fileName: payload.fileName,
        preview: payload.cleanedText,
      })
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setBusyLabel('')
    }
  }

  async function copyValue(value, successMessage) {
    await navigator.clipboard.writeText(value)
    setStatusMessage(successMessage)
  }

  async function handleSetupSubmit(event) {
    event.preventDefault()
    setSetupBusy(true)
    setSetupErrorMessage('')

    try {
      const payload = await parseResponse(await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupForm),
      }))

      const nextConfig = { ...DEFAULT_CONFIG, ...payload }
      setConfig(nextConfig)
      setSetupForm(buildSetupFormState(nextConfig))
      setSetupErrorMessage('')
      setSetupModalOpen(false)
      setErrorMessage('')
      setStatusMessage('Setup saved. TranslatorBot is ready.')
    } catch (error) {
      setSetupErrorMessage(error.message)
    } finally {
      setSetupBusy(false)
    }
  }

  function reopenHistoryEntry(entry) {
    setTargetLanguage(entry.targetLanguage)
    setCurrentResult({
      mode: entry.mode,
      sourceText: entry.originalText,
      translationText: entry.translationText,
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
      detectedLanguage: entry.sourceLanguage,
      fileName: entry.fileName,
      dictionary: entry.dictionary,
      transcript: entry.transcript,
      preview: entry.originalText,
    })

    if (entry.mode === 'copy') {
      setCopySource(entry.originalText)
      setCopyTranslation(entry.translationText)
      setActiveTab('copy')
    }

    if (entry.mode === 'text') {
      setTextSource(entry.originalText)
      setTextTranslation(entry.translationText)
      setActiveTab('text')
    }

    if (entry.mode === 'audio') {
      setAudioState({ fileName: entry.fileName, transcript: entry.transcript || entry.originalText, translation: entry.translationText })
      setActiveTab('audio')
    }

    if (entry.mode === 'document') {
      setDocumentState({ fileName: entry.fileName, preview: entry.originalText, translation: entry.translationText })
      setActiveTab('document')
    }
  }

  function deleteHistoryEntry(entryId) {
    setHistory((existing) => existing.filter((entry) => entry.id !== entryId))
  }

  function clearHistory() {
    setHistory([])
  }

  return (
    <div className="app-shell">
      <div className="bg-orb orb-a"></div>
      <div className="bg-orb orb-b"></div>
      <div className="bg-grid"></div>
      {setupModalOpen ? (
        <div className="modal-backdrop">
          <section className="setup-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <div className="section-heading compact-stack">
              <div>
                <p className="eyebrow">Quick setup</p>
                <h2 id="setup-title">Finish configuring {missingSetupItems.join(' and ') || 'TranslatorBot'}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSetupModalOpen(false)}>Maybe later</button>
            </div>
            <p className="setup-copy">
              Paste one OpenAI API key and choose which features should be ready for your colleague. TranslatorBot saves the settings for you automatically.
            </p>
            <form className="setup-form" onSubmit={handleSetupSubmit}>
              <label className="field-label">
                OpenAI API key
                <input
                  type="password"
                  value={setupForm.openAIApiKey}
                  onChange={(event) => setSetupForm((current) => ({ ...current, openAIApiKey: event.target.value }))}
                  placeholder={config.sharedApiKeyConfigured ? 'Leave blank to keep the saved key' : 'Paste the key that starts with sk-'}
                />
                <small className="field-hint">
                  {config.sharedApiKeyConfigured ? 'A saved key already exists, so you only need to paste a new one if you want to replace it.' : 'The same key can power both translation and transcription.'}
                </small>
              </label>
              <label className="toggle-row setup-toggle">
                <input
                  type="checkbox"
                  checked={setupForm.enableTranslation}
                  onChange={(event) => setSetupForm((current) => ({ ...current, enableTranslation: event.target.checked }))}
                />
                Turn on translation
              </label>
              <label className="toggle-row setup-toggle">
                <input
                  type="checkbox"
                  checked={setupForm.enableTranscription}
                  onChange={(event) => setSetupForm((current) => ({ ...current, enableTranscription: event.target.checked }))}
                />
                Turn on transcription
              </label>
              {setupErrorMessage ? <div className="message error">{setupErrorMessage}</div> : null}
              <div className="button-row wrap">
                <button type="submit" className="primary-button" disabled={setupBusy}>
                  {setupBusy ? 'Saving setup...' : 'Save setup'}
                </button>
              <button type="button" className="secondary-button" disabled={setupBusy} onClick={() => loadHealthConfig().catch(() => undefined)}>
                Refresh status
              </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      <header className="hero-card glass-panel">
        <div>
          <p className="eyebrow">Ocean intelligence console</p>
          <h1>TranslatorBot</h1>
          <p className="hero-copy">
            Instant clipboard translation, typed drafts, audio transcripts, and document extraction in one polished,
            ocean-themed workspace.
          </p>
        </div>
        <div className="hero-actions">
          <div className="status-pill">
            <span className={config.translationConfigured ? 'status-dot good' : 'status-dot warn'}></span>
            Translation {config.translationConfigured ? 'ready' : 'not configured'}
          </div>
          <div className="status-pill">
            <span className={config.transcriptionConfigured ? 'status-dot good' : 'status-dot warn'}></span>
            Transcription {config.transcriptionConfigured ? 'ready' : 'not configured'}
          </div>
          {!config.translationConfigured || !config.transcriptionConfigured ? (
            <button type="button" className="primary-button" onClick={() => {
              setSetupErrorMessage('')
              setSetupModalOpen(true)
            }}>
              Finish setup
            </button>
          ) : null}
          <label className="field-label compact">
            Target language
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="layout-grid">
        <main className="workspace">
          <nav className="tab-strip glass-panel" aria-label="Translator modes">
            {TAB_ORDER.map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? 'tab-button active' : 'tab-button'}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_META[tab].title}
              </button>
            ))}
          </nav>

          <section className="glass-panel section-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{TAB_META[activeTab].title}</p>
                <h2>{TAB_META[activeTab].blurb}</h2>
              </div>
              {busyLabel ? <div className="busy-pill">{busyLabel}</div> : null}
            </div>

            {statusMessage ? <div className="message success">{statusMessage}</div> : null}
            {errorMessage ? <div className="message error">{errorMessage}</div> : null}

            {activeTab === 'copy' ? (
              <div className="mode-grid">
                <div className="panel-card">
                  <div className="button-row wrap">
                    <button type="button" className="primary-button" onClick={startClipboardListening}>Start listening</button>
                    <button type="button" className="secondary-button" onClick={stopClipboardListening}>Stop listening</button>
                    <button type="button" className="secondary-button" onClick={readClipboardOnce}>Read clipboard now</button>
                  </div>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={incrementalCopy}
                      onChange={(event) => setIncrementalCopy(event.target.checked)}
                    />
                    Incremental copy mode
                  </label>
                  <label className="field-label">
                    Cleaned clipboard text
                    <textarea value={copySource} onChange={(event) => setCopySource(event.target.value)} rows={10} />
                  </label>
                </div>
                <div className="panel-card">
                  <div className="translation-header">
                    <div>
                      <p className="mini-label">Translation</p>
                      <strong>{currentResult.mode === 'copy' ? currentResult.targetLanguage : targetLanguage}</strong>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!copyTranslation}
                      onClick={() => copyValue(copyTranslation, 'Copied translation to clipboard.')}
                    >
                      Copy result
                    </button>
                  </div>
                  <div className="result-card ocean-scroll">{copyTranslation || 'Clipboard translations appear here.'}</div>
                </div>
              </div>
            ) : null}

            {activeTab === 'text' ? (
              <div className="mode-grid">
                <div className="panel-card">
                  <div className="dual-fields">
                    <label className="field-label compact">
                      Source language
                      <input type="text" value="Auto-detect" disabled />
                    </label>
                    <label className="field-label compact">
                      Target language
                      <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                        {LANGUAGE_OPTIONS.map((language) => (
                          <option key={language} value={language}>{language}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    Source text
                    <textarea
                      value={textSource}
                      onChange={(event) => setTextSource(event.target.value)}
                      rows={12}
                      placeholder="Paste notes, emails, or PDF text here."
                    />
                  </label>
                  <div className="button-row wrap">
                    <button type="button" className="primary-button" onClick={() => requestTranslation({ text: textSource, mode: 'text' })}>
                      Translate
                    </button>
                    <button type="button" className="secondary-button" disabled={!textTranslation} onClick={() => copyValue(textTranslation, 'Copied translation to clipboard.')}>Copy result</button>
                    <button type="button" className="secondary-button" disabled={!textTranslation} onClick={() => downloadText(textTranslation, 'translation.txt', 'text/plain;charset=utf-8')}>Download .txt</button>
                    <button type="button" className="secondary-button" disabled={!textTranslation} onClick={() => downloadText(`# Translation\n\n${textTranslation}`, 'translation.md', 'text/markdown;charset=utf-8')}>Download .md</button>
                  </div>
                </div>
                <div className="panel-card">
                  <div className="translation-header">
                    <div>
                      <p className="mini-label">Detected source</p>
                      <strong>{currentResult.mode === 'text' ? currentResult.detectedLanguage || 'Pending' : 'Pending'}</strong>
                    </div>
                  </div>
                  <div className="result-card ocean-scroll">{textTranslation || 'Manual translations appear here.'}</div>
                </div>
              </div>
            ) : null}

            {activeTab === 'audio' ? (
              <div className="mode-grid">
                <div className="panel-card">
                  <label className="upload-zone">
                    <input type="file" accept=".mp3,.wav,.m4a,.webm,audio/*" onChange={handleAudioUpload} />
                    <span>Drop or upload mp3, wav, m4a, or webm audio</span>
                    <small>Max size {config.maxUploadMb} MB</small>
                  </label>
                  <label className="field-label">
                    Transcript
                    <textarea value={audioState.transcript} readOnly rows={10} />
                  </label>
                  <div className="button-row wrap">
                    <button type="button" className="secondary-button" disabled={!audioState.transcript} onClick={() => copyValue(audioState.transcript, 'Copied transcript to clipboard.')}>Copy transcript</button>
                    <button type="button" className="secondary-button" disabled={!audioState.transcript} onClick={() => downloadText(audioState.transcript, 'transcript.txt', 'text/plain;charset=utf-8')}>Download transcript</button>
                  </div>
                </div>
                <div className="panel-card">
                  <label className="field-label">
                    Translation
                    <textarea value={audioState.translation} readOnly rows={10} />
                  </label>
                  <div className="button-row wrap">
                    <button type="button" className="secondary-button" disabled={!audioState.translation} onClick={() => copyValue(audioState.translation, 'Copied translation to clipboard.')}>Copy translation</button>
                    <button type="button" className="secondary-button" disabled={!audioState.translation} onClick={() => downloadText(audioState.translation, 'audio-translation.txt', 'text/plain;charset=utf-8')}>Download translation</button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'document' ? (
              <div className="mode-grid">
                <div className="panel-card">
                  <label className="upload-zone">
                    <input type="file" accept=".pdf,.txt,.docx" onChange={handleDocumentUpload} />
                    <span>Drop or upload PDF, TXT, or DOCX files</span>
                    <small>Scanned PDFs are detected and rejected cleanly.</small>
                  </label>
                  <label className="field-label">
                    Extracted preview
                    <textarea value={documentState.preview} readOnly rows={12} />
                  </label>
                  <div className="button-row wrap">
                    <button type="button" className="secondary-button" disabled={!documentState.preview} onClick={() => copyValue(documentState.preview, 'Copied extracted text to clipboard.')}>Copy extracted text</button>
                    <button type="button" className="secondary-button" disabled={!documentState.preview} onClick={() => downloadText(documentState.preview, 'document-preview.txt', 'text/plain;charset=utf-8')}>Download extracted text</button>
                  </div>
                </div>
                <div className="panel-card">
                  <label className="field-label">
                    Translation
                    <textarea value={documentState.translation} readOnly rows={12} />
                  </label>
                  <div className="button-row wrap">
                    <button type="button" className="secondary-button" disabled={!documentState.translation} onClick={() => copyValue(documentState.translation, 'Copied translation to clipboard.')}>Copy translation</button>
                    <button type="button" className="secondary-button" disabled={!documentState.translation} onClick={() => downloadText(documentState.translation, 'document-translation.txt', 'text/plain;charset=utf-8')}>Download translation</button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'reading' ? (
              <div className="reading-mode panel-card floating-panel">
                <p className="eyebrow">Translation-only focus</p>
                <div className="reading-copy">{currentResult.translationText || 'Translate something to open the focused reading panel.'}</div>
                <details>
                  <summary>Original text</summary>
                  <p className="muted-text">{currentResult.sourceText || 'Original text will appear here once available.'}</p>
                </details>
              </div>
            ) : null}

            {activeTab === 'contrast' ? (
              <div className="contrast-grid">
                {(paragraphPairs.length ? paragraphPairs : [{ id: 'empty', source: 'Translate something to compare.', translation: 'Your translation will line up here.' }]).map((pair) => (
                  <div className="contrast-row" key={pair.id}>
                    <div className="panel-card">
                      <p className="mini-label">Original</p>
                      <p>{pair.source}</p>
                    </div>
                    <div className="panel-card">
                      <p className="mini-label">Translation</p>
                      <p>{pair.translation}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === 'dictionary' ? (
              <div className="mode-grid dictionary-grid">
                <div className="panel-card">
                  <p className="eyebrow">Short phrase analysis</p>
                  {currentResult.dictionary ? (
                    <div className="dictionary-card">
                      <h3>{createPreview(currentResult.sourceText, 48) || 'Selection'}</h3>
                      <dl>
                        <div>
                          <dt>Definition</dt>
                          <dd>{currentResult.dictionary.definition}</dd>
                        </div>
                        <div>
                          <dt>Part of speech</dt>
                          <dd>{currentResult.dictionary.partOfSpeech}</dd>
                        </div>
                        <div>
                          <dt>Example</dt>
                          <dd>{currentResult.dictionary.exampleSentence}</dd>
                        </div>
                        <div>
                          <dt>Alternatives</dt>
                          <dd>{Array.isArray(currentResult.dictionary.alternatives) ? currentResult.dictionary.alternatives.join(', ') : currentResult.dictionary.alternatives}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <div className="result-card">Translate a single word or short phrase to populate dictionary-style output.</div>
                  )}
                </div>
                <div className="panel-card">
                  <p className="eyebrow">Current translation</p>
                  <div className="result-card ocean-scroll">{currentResult.translationText || 'The latest translation remains visible here.'}</div>
                </div>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="history-panel glass-panel">
          <div className="section-heading compact-stack">
            <div>
              <p className="eyebrow">Local history</p>
              <h2>Last 20 translations</h2>
            </div>
            <button type="button" className="ghost-button" disabled={!history.length} onClick={clearHistory}>Clear all</button>
          </div>
          <div className="history-list ocean-scroll">
            {history.length ? history.map((entry) => (
              <article key={entry.id} className="history-item">
                <div>
                  <p className="mini-label">{entry.mode} · {entry.sourceLanguage} → {entry.targetLanguage}</p>
                  <strong>{entry.originalPreview || 'Untitled translation'}</strong>
                  <p>{entry.translationPreview || 'No preview available.'}</p>
                  <small>{new Date(entry.timestamp).toLocaleString()}</small>
                </div>
                <div className="button-row wrap">
                  <button type="button" className="secondary-button" onClick={() => reopenHistoryEntry(entry)}>Reopen</button>
                  <button type="button" className="ghost-button" onClick={() => deleteHistoryEntry(entry.id)}>Delete</button>
                </div>
              </article>
            )) : (
              <div className="result-card">Successful translations are saved locally for quick reopen and cleanup.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
