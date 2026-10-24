# TEPSIR UI

React + TypeScript client for TEPSIR (Travel and Expense Policy Search and Information
Retrieval). It talks to the FastAPI backend in the companion `TEPSIR` repository.

Two experiences, driven by the authenticated user's role:

- **ROLE_USER** — sign in, ask a question in natural language, read ranked policy
  passages with their source document and page, and re-run recent searches.
- **ROLE_ADMIN** — everything above, plus publishing and deleting policy documents.
  Uploads are parsed, chunked, embedded and made searchable immediately.

## Requirements

- Node.js 20+
- The TEPSIR backend running on http://localhost:8000

## Setup

```bash
npm install
cp .env.example .env   # optional; the dev proxy works without it
npm run dev            # http://localhost:5173
```

Vite proxies `/api` and `/healthz` to `http://localhost:8000` (override with
`VITE_PROXY_TARGET`). For a UI served from a different origin, set
`VITE_API_BASE_URL` at build time and allow that origin via the backend's
`CORS_ORIGINS`.

## Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Development server with HMR       |
| `npm run build`   | Type-check and produce `dist/`    |
| `npm run preview` | Serve the production build        |
| `npm run typecheck` | TypeScript only                 |

## Structure

```
src/
├── api/          # typed fetch client and response types
├── auth/         # AuthContext: token storage, session restore, login/register
├── components/   # Layout and role-aware route guard
├── pages/        # Login, Register, Search, Admin documents
├── App.tsx       # routing
└── styles.css    # design tokens and component styles
```

The access token is kept in `localStorage` and attached as a bearer token. On load the
app calls `/api/v1/users/me` to restore the session; an invalid or expired token clears
it and returns the user to the sign-in page.

The UI is intentionally dependency-light: React, React Router, and hand-written CSS, with
no component library, so the dissertation artefact stays easy to read and defend.
