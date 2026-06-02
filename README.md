# Birdeye SDR Workspace v5

AI-powered SDR Operating System for Birdeye inbound leads.

## Stack
- React 18 + Vite
- Inline styles (no Tailwind)
- React Context for state
- localStorage persistence
- Gemini 1.5 Flash (direct in-app AI)
- Claude copy-paste prompt flow

## Setup
```bash
npm install
npm run dev
```

## Build single HTML file
```bash
npm run build
# Then bundle dist/ into single HTML
```

## Structure
```
src/
├── App.jsx
├── context/AppContext.jsx
├── constants/stages.js
├── hooks/useTheme.js
├── data/mockData.js + schema.js
├── services/prompts.js + aiProvider.js + sheetsAdapter.js
├── components/
└── views/
```

## Rules for Kiro
- Inline styles only — no Tailwind classes in JSX
- Use useTheme() hook for all colors
- Import constants from src/constants/stages.js
- Never re-declare STAGE_STYLE or INTENT_STYLE locally
- Never call useState inside .map()
- Always null-check lead properties
