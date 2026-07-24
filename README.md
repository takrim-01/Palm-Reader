# Palm Reading App

## Folder layout
```
palm-reading/
├── index.html          ← page structure, links to frontend/ files
├── .gitignore
├── README.md
├── frontend/
│   ├── style.css
│   └── script.js
└── backend/
    ├── package.json
    ├── vite.config.js   ← tells Vite where index.html and .env are
    ├── .env.example
    └── .env             ← you create this yourself, holds your real key
```

## Why `vite.config.js` is needed
Vite normally expects `package.json`, `.env`, and `index.html` to all sit
next to each other. Since `package.json`/`.env` are now in `backend/` and
`index.html` is one level up, `vite.config.js` tells Vite explicitly:
- `root` → look up one folder for `index.html`
- `envDir` → look right here in `backend/` for `.env`

You don't need to touch this file — it's already wired up for this layout.

## Setup in VS Code

1. **Install Node.js**: https://nodejs.org (LTS version), if not already installed.

2. **Open the `palm-reading` folder** in VS Code (`File > Open Folder...`).

3. **Open a terminal** (`` Terminal > New Terminal ``) and move into `backend/`:
   ```
   cd backend
   npm install
   ```

4. **Create your real `.env`**
   - Copy `backend/.env.example` → rename the copy to `backend/.env`
   - Put your real key in it:
     ```
     VITE_GEMINI_API_KEY=AIzaSy...your_real_key
     ```
   - Must start with `VITE_` — that's how Vite decides which env vars are
     safe to expose to browser code.

5. **Run the dev server** (still inside `backend/`):
   ```
   npm run dev
   ```
   Vite prints a local URL (usually `http://localhost:5173`) that serves
   `index.html` from the parent folder. Camera access works fine here since
   `localhost` counts as a secure context.

6. **Build for deployment**:
   ```
   npm run build
   ```
   Output lands in `palm-reading/dist/`, ready to upload to any static host.

## Security note
Splitting `backend/` and `frontend/` folders is a nice organizational
separation, but it doesn't create real backend/frontend isolation — this is
still a 100% static site. The Gemini key still gets bundled into the
JavaScript sent to every visitor's browser at build time, so it's still
readable via dev tools on the live site. `.env` + `.gitignore` protect it
from your Git history, not from end users. A genuinely private key needs an
actual server (a small Node/Express app, or a Vercel/Netlify serverless
function) that makes the Gemini call itself, with the frontend calling that
server instead of Google directly.