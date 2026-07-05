# Offhand — web MVP

Voice-first field documentation. Speak a note on site, get a structured NZ-compliant
document, fix the gaps, finalise, print/save as PDF. Six templates, records stored
on-device (localStorage). The Anthropic API key lives server-side in a Vercel function.

## Deploy (about 5 minutes)

1. `npm i -g vercel` (once)
2. In this folder: `vercel` — accept the defaults (it detects Vite)
3. Add the API key:
   `vercel env add ANTHROPIC_API_KEY` → paste your key (from console.anthropic.com) → select Production
4. `vercel --prod`
5. Open the URL on your phone, allow the microphone when asked.

## Local dev

`vercel dev` (not `npm run dev`) so the /api/extract function runs locally.
Put the key in `.env.local` as `ANTHROPIC_API_KEY=...` first.

## Notes

- Voice uses the browser's Web Speech API (best in Chrome/Edge/Safari). If a mic is
  blocked or unsupported, the app says exactly why and typing works everywhere.
- Records: draft → finalise locks it; amending creates a new version. Nothing is overwritten.
- This is the demo/companion web build. The full offline-first mobile app
  (Expo/Supabase/Deepgram per the kickoff prompt) is the separate Claude Code build.
