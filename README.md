# TranslatorBot

TranslatorBot is an ocean-themed translation workspace inspired by CopyTranslator’s fast copy-to-translate workflow, but rebuilt from scratch for clipboard, text, audio, and document translation.

## Features

- **Copy Mode** with explicit clipboard listening, incremental copy capture, and PDF-style text cleanup
- **Text Mode** with auto-detect source language, translate/copy/export actions, and markdown downloads
- **Audio Mode** for mp3, wav, m4a, and webm uploads with transcript + translation output
- **Document Mode** for PDF, TXT, and DOCX extraction with scanned PDF detection
- **Guided setup popup** that helps non-technical users save the OpenAI key and enable translation/transcription from the UI
- **Reading Mode** for large, focused translation-only viewing
- **Contrast Mode** for side-by-side paragraph alignment
- **Dictionary Mode** for single-word and short-phrase definitions, examples, and alternatives
- **Local history** for the last 20 translations with reopen, delete, and clear-all actions
- **Premium ocean UI** with glass panels, deep navy gradients, cyan highlights, and responsive layout

## Tech stack

- React + Vite frontend
- Express backend
- OpenAI provider abstraction for translation and transcription
- `pdf-parse` for PDFs
- `mammoth` for DOCX

## Install

```bash
npm install
cp .env.example .env
```

You can either set the required environment variables in `.env` manually or use the in-app setup popup to save them from the UI.

## Run

### macOS / Linux

```bash
./run.sh
```

### Windows

```bat
run.bat
```

### Manual commands

```bash
npm run dev
npm run build
npm run start
npm test
npm run lint
```

- `npm run dev` starts the Express API and Vite dev server together.
- `npm run build` creates the production frontend bundle.
- `npm run start` serves the Express API and built frontend from `dist/`.

## Environment variables

```env
OPENAI_API_KEY=
TRANSLATION_PROVIDER=openai
TRANSLATION_API_KEY=
TRANSCRIPTION_PROVIDER=openai
MAX_UPLOAD_MB=25
PORT=3001
```

Notes:

- `TRANSLATION_PROVIDER` currently supports `openai`.
- `TRANSCRIPTION_PROVIDER` currently supports `openai`.
- `TRANSLATION_API_KEY` is optional when `OPENAI_API_KEY` is already set.
- The setup popup keeps working if an older `.env` already has `TRANSLATION_API_KEY`; it will reuse that saved key unless you paste a new shared `OPENAI_API_KEY`.

## How it works

1. **Copy Mode** cleans messy copied text, merges broken PDF line wraps, and can append multi-copy snippets with incremental mode.
2. **Text Mode** sends typed or pasted content through the translation API and allows copying or downloading the result.
3. **Audio Mode** uploads supported audio files, requests a transcript, then translates that transcript.
4. **Document Mode** extracts clean text from PDF/TXT/DOCX, rejects image-only PDFs, and translates the cleaned content.
5. **Reading / Contrast / Dictionary** tabs reuse the latest successful translation in specialized views.
6. **Guided setup popup** opens automatically whenever translation or transcription is missing and writes the chosen settings into `.env`.

## Troubleshooting

- **“Clipboard listening must be enabled first.”**
  - Browser clipboard access must be triggered by the Start listening button.
- **“Translation provider is not configured.”**
  - Use the setup popup or set `OPENAI_API_KEY` and `TRANSLATION_PROVIDER=openai` in `.env`.
- **“Audio transcription failed.”**
  - Use the setup popup or confirm `TRANSCRIPTION_PROVIDER=openai`, the API key, and a supported audio file type.
- **“This PDF appears to be scanned or image-only.”**
  - The uploaded PDF has no extractable text layer.
- **“File is too large.”**
  - Increase `MAX_UPLOAD_MB` if your deployment can handle larger uploads.

## Screenshots

_Add screenshots here after configuring your provider and capturing the UI._

## Limitations

- Translation and transcription currently support the OpenAI provider only.
- Browser clipboard monitoring depends on user-granted clipboard permissions.
- Sentence/paragraph alignment in Contrast Mode is paragraph-based rather than semantic sentence matching.
- Scanned PDFs are detected, but OCR is intentionally not faked or simulated.

## Project structure

- `src/` – React UI
- `server/` – Express API and provider integration
- `shared/` – text cleanup utilities shared by frontend, backend, and tests
- `test/` – targeted Node tests for cleanup and history logic
