# Bunsan Jisho

Bunsan Jisho is a static Japanese dictionary and study application designed for GitHub Pages.

## GitHub Pages target

This repository is intended to be a separate project repository named:

`bunsanjisho`

under the GitHub account `img2vid`.

Its GitHub Pages project URL will be:

`https://img2vid.github.io/bunsanjisho/`

The existing `img2vid.github.io` repository remains the user/organization Pages repository. Bunsan Jisho is not copied into that repository.

## AI architecture

The original Agent build used Next.js server routes and a server-side AI SDK. That requires a Node.js server runtime and is not suitable for GitHub Pages.

This version uses `uncloseai.js` entirely in the browser. The script is loaded from `https://uncloseai.com/uncloseai.js`. Bunsan Jisho calls its browser API for AI tutor responses, AI example sentences, and TTS. The pronunciation checker uses the browser Web Speech API instead of a server-side ASR endpoint.

No API secret is stored in this repository.

## Persistence

User settings, study cards, review history, quizzes, favorites, lists, notes, tags, and searches continue to be stored locally in the browser through Zustand persistence/localStorage.

## Static build

Next.js is configured with `output: "export"` and the GitHub Pages workflow builds the site into `out/`.

The workflow sets `NEXT_PUBLIC_BASE_PATH=/bunsanjisho` so the generated asset URLs match the project-site path.

## Important limitation

GitHub Pages is static hosting. It does not run Node.js, Prisma, SQLite, or Next.js API routes. AI therefore runs through the external browser-side uncloseai service rather than through a private server API.

## Deployment

The repository includes `.github/workflows/deploy-pages.yml`. After the repository is created and the files are uploaded through the GitHub web interface, enable GitHub Actions as the Pages source under Settings → Pages. Then commit the workflow and source to `main`; GitHub Actions builds and deploys the static `out/` directory.

## Included

- Japanese dictionary search
- Kanji, radicals, sentences, expressions, grammar and conjugation tools
- SRS study system
- Quizzes and exam generation
- Favorites, lists, notes, tags and history
- Local export/import
- AI tutor
- AI-generated example sentences
- AI text-to-speech with browser fallback
- Browser speech pronunciation checking
- Responsive UI
