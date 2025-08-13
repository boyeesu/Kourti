# Kouti Legal Hub – Developer Guide

This document is a high-level map of the project structure, key API routes, database schema, and AI workflows so a new developer can get productive quickly.

---
## 1. Repository Layout
```
kouti-legal-hub-41/
├── src/                 # React (Vite) front-end
│   ├── pages/           # Page-level components (Dashboard, Documents, etc.)
│   ├── components/ui/   # ShadCN UI primitives & wrappers
│   ├── components/layout# AppLayout, Sidebar, etc.
│   ├── hooks/           # TanStack Query hooks (DB & AI)
│   └── lib/             # OpenAI helper wrappers
├── supabase/            # Supabase config
│   ├── migrations/      # SQL migrations (schema)
│   └── functions/       # Edge Functions (Type-Script -> Deno)
└── README.md / DOCUMENTS.md (this file)
```

---
## 2. Database Schema (Supabase)
### 2.1 Core Tables
| table | purpose |
|-------|---------|
| **documents** | Stores raw document/contract text, summary, dates, metadata JSONB |
| **contract_embeddings** | pgvector embedding for each contract (1536 dims) |
| **best_practices** | Library of best practise clauses w/ embeddings |
| **dashboard_prefs** | per-user, per-org widget toggles & reminder window |
| **notifications** | persistent in-app notifications |

### 2.2 Important Columns
`documents`
- `id uuid PK`
- `name text`
- `content text`
- `summary text`
- `metadata jsonb` – `{ type:"contract", orgId:"…" }`
- `effective_date, renewal_date, termination_date date`

`dashboard_prefs`
- `show_upcoming_cases boolean`
- `show_upcoming_contracts boolean`
- `reminder_window_days int default 90`

RLS: each table has `auth.uid() = user_id` or `organisation_id` policy.

---
## 3. Edge Functions (supabase/functions)
| function | description |
|----------|-------------|
| **contract-analysis** | POST body `{text, analysisType}` → calls OpenAI<br>analysisType: `summarize` | `extractClauses` | `redline` |
| **scheduled-date-alerts** | Cron daily. Extracts dates (GPT-4o function call), updates `documents`, inserts due-date notifications based on `dashboard_prefs.reminder_window_days`. |

Schedule YAML (or dashboard):
```yaml
schedules:
  - name: contract-date-reminders
    cron: '0 8 * * *'
    function: scheduled-date-alerts
```

---
## 4. Front-end Key Hooks
- `useDocuments`, `useAnalyzeDocument` – list & summarise
- `useAnalyzeContract` – risk/anomaly redline
- `useDashboardPrefs` / `useSaveDashboardPrefs`
- `useNotificationsDb` (pop-over list)
- `useInsights` – derives upcoming hearings / expirations (7-day window)

---
## 5. UI Workflows
1. **Upload doc** → Documents page → click “Summarize” → saves summary.
2. **Open contract** → ContractView → “Run Risk Analysis” → analysis stored in metadata.
3. Daily cron inserts notifications for renewal/termination dates within `reminder_window_days`.
4. Top-bar bell shows unread count. Pop-over lists notifications; user can mark-read / clear.
5. Settings → Dashboard Widgets card: toggle two insight widgets & choose 30/60/90-day reminder window.

---
## 6. Dev Scripts
```
# install deps
npm install
# dev server (vite + tsx src)
npm run dev
# deploy edge function
supabase functions deploy contract-analysis
# run migrations
supabase db push
```

---
## 7. Environment Variables
Supabase CLI picks .env.* automatically, but ensure:
```
OPENAI_API_KEY=<your key>
SUPABASE_URL, SUPABASE_ANON_KEY (for front-end)
SUPABASE_SERVICE_ROLE_KEY (for edge functions if needed)
```

---
## 8. Future TODOs
- Implement Q&A RAG workflow
- e-Signature provider integration
- Pagination for notifications list
- CI pipeline to run lint/test & deploy edge functions automatically

---
Welcome aboard 🎉 – this should give you the map of the codebase, DB, and AI workflows. Reach out to maintainers if you need deeper details.
