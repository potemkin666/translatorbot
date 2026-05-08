import dotenv from 'dotenv'
import express from 'express'
import mammoth from 'mammoth'
import multer from 'multer'
import { PDFParse } from 'pdf-parse'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanExtractedText } from '../shared/textTools.js'
import { saveSetupConfiguration, sharedApiKeyConfigured } from './configStore.js'
import {
  detectLmStudio,
  translateText,
  transcribeAudio,
  translationConfigured,
  transcriptionConfigured,
} from './openaiService.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 25)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
})

const supportedAudioTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
])

const supportedDocumentExtensions = new Set(['.pdf', '.txt', '.docx'])

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', async (_req, res, next) => {
  try {
    const llmStudioDetected = await detectLmStudio()
    const translationReady = await translationConfigured()
    const transcriptionReady = await transcriptionConfigured()

    res.json({
      ok: true,
      maxUploadMb,
      sharedApiKeyConfigured: sharedApiKeyConfigured(),
      llmStudioDetected,
      translationConfigured: translationReady,
      transcriptionConfigured: transcriptionReady,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/setup', async (req, res, next) => {
  try {
    const llmStudioDetected = await detectLmStudio()
    const {
      openAIApiKey = '',
      enableTranslation = true,
      enableTranscription = true,
    } = req.body || {}

    saveSetupConfiguration({
      openAIApiKey,
      enableTranslation: Boolean(enableTranslation),
      enableTranscription: Boolean(enableTranscription),
      lmStudioDetected: llmStudioDetected,
    })

    res.json({
      ok: true,
      maxUploadMb,
      sharedApiKeyConfigured: sharedApiKeyConfigured(),
      llmStudioDetected,
      translationConfigured: await translationConfigured(),
      transcriptionConfigured: await transcriptionConfigured(),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/translate', async (req, res, next) => {
  try {
    const { text = '', targetLanguage, sourceLanguage = 'Auto-detect', fallbackTargetLanguage } = req.body
    if (!text.trim()) {
      return res.status(400).json({ error: 'No text found to translate.' })
    }

    const result = await translateText({
      text,
      targetLanguage,
      sourceLanguage,
      fallbackTargetLanguage,
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/transcribe', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'This file type is not supported.' })
    }

    if (!supportedAudioTypes.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'This file type is not supported.' })
    }

    const transcript = await transcribeAudio({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    })

    if (!transcript.trim()) {
      return res.status(400).json({ error: 'Audio transcription failed.' })
    }

    res.json({ transcript, fileName: req.file.originalname })
  } catch (error) {
    if (!error.statusCode) {
      error.message = 'Audio transcription failed.'
      error.statusCode = 500
    }
    next(error)
  }
})

app.post('/api/document', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'This file type is not supported.' })
    }

    const extension = path.extname(req.file.originalname).toLowerCase()
    if (!supportedDocumentExtensions.has(extension)) {
      return res.status(400).json({ error: 'This file type is not supported.' })
    }

    let rawText = ''

    if (extension === '.pdf') {
      const parser = new PDFParse({ data: req.file.buffer })
      const parsed = await parser.getText()
      await parser.destroy()
      rawText = parsed.text || ''
      if (!rawText.trim()) {
        return res.status(400).json({ error: 'This PDF appears to be scanned or image-only.' })
      }
    } else if (extension === '.docx') {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer })
      rawText = result.value || ''
    } else {
      rawText = req.file.buffer.toString('utf8')
    }

    const cleanedText = cleanExtractedText(rawText)
    if (!cleanedText.trim()) {
      return res.status(400).json({
        error: extension === '.pdf' ? 'This PDF appears to be scanned or image-only.' : 'No text found to translate.',
      })
    }

    res.json({
      fileName: req.file.originalname,
      extractedText: rawText,
      cleanedText,
    })
  } catch (error) {
    next(error)
  }
})

const distPath = path.resolve(__dirname, '../dist')
const indexPath = path.join(distPath, 'index.html')
const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : ''
app.use(express.static(distPath))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next()
  }

  if (!indexHtml) {
    return res.status(503).send('Frontend build not found. Run npm run build first.')
  }

  return res.type('html').send(indexHtml)
})

app.use((error, _req, res) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is too large.' })
  }

  return res.status(error.statusCode || 500).json({
    error: error.message || 'Something went wrong.',
  })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`TranslatorBot server listening on http://localhost:${port}`)
})
