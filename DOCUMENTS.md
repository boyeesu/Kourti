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

## 2.3 Other Domain Tables
| table | purpose |
|-------|---------|
| **profiles**          | stores user profiles (first/last name, email, phone, department, organization_id) |
| **organizations**     | tenant organizations (name, created_at) |
| **clients**           | client entities linked to orgs (id, name, contact info) |
| **cases**             | case records (title, description, status, priority, assigned_to, organization_id) |
| **case_types**        | definitions of case types (e.g. Litigation, IP) |
| **case_fields**       | custom fields per case type (label, data_type, required) |
| **case_activities**   | activity logs on cases (case_id, title, description, date) |

---
## 9. Module Reference

Below is a summary of the key code modules and their responsibilities.

### 9.1 Pages (`src/pages`)
- **Dashboard.tsx**: main landing page; shows stats, recent cases, upcoming events, and actionable insights.
- **Documents.tsx**: lists documents; supports upload, AI summarization, filtering.
- **DocumentUpload.tsx**: UI for uploading and annotating new documents.
- **Contracts.tsx** / **ContractView.tsx** / **ContractEdit.tsx** / **ContractHistory.tsx**: contract CRUD, viewing, editing, version history, AI reviews.
- **Cases.tsx** / **CaseCreate.tsx** / **CaseDetails.tsx** / **CaseActivities.tsx**: case management and activities.
- **Clients.tsx** / **ClientCreate.tsx** / **ClientDetails.tsx** / **ClientEdit.tsx**: client profiles and communication logs.
- **Calendar.tsx**: interactive calendar of case hearings and events.
- **Settings.tsx** / **UserManagement.tsx** / **Profile.tsx**: user, role, and application settings.
- **Auth.tsx**, **Login.tsx**, **Register.tsx**, **Onboarding.tsx**: authentication flows.
- **BulkImport.tsx**: CSV/Excel import for clients, cases, documents.

### 9.2 Hooks (`src/hooks`)
- **useAuth**: authentication state and helpers (signIn, signOut).
- **useCurrentUser**: get current user's profile.
- **useUserOrganization**: fetch user's org ID (RLS context).
- **useDashboardStats**: aggregates counts and recent items for Dashboard.
- **useInsights**: computes upcoming cases and contracts within window.
- **useDashboardPrefs** / **useSaveDashboardPrefs**: read/write dashboard widget settings.
- **useNotificationsDb**: fetch notifications from Supabase.
- **useAnalyzeDocument**: mutation for AI-powered document summarization.
- **useAnalyzeContract**: mutation for AI-driven risk analysis.
- **useCases**, **useCase**, **useCreateCase**, **useUpdateCase**, **useDeleteCase**: case data hooks.
- **useCaseTypes** / **useCaseFields**: dynamic case-type field hooks.
- **useClients**, **useClient**, **useCreateClient**: client data hooks.
- **useDocuments**, **useDocument**, **useCreateDocument**, **useUpdateDocument**, **useDeleteDocument**: document data hooks.
- **useContracts**, **useContract**, **useCreateContract**, etc.: contract data hooks.

### 9.3 Components (`src/components`)
- **ui/**: design primitives (Button, Input, Select, Tabs, Dialog, Popover, Sidebar, etc.)
- **layout/**: application layout (AppLayout, AppSidebar, ProtectedRoute).
- **shared/components/**: reusable low-level components.

### 9.4 Lib (`src/lib`)
- **openaiService.ts**: wrapper around Supabase Edge Functions for AI tasks.
- **openaiWorkflows.ts**: high-level functions orchestrating AI calls + DB writes.
- **utils.ts** / **csv.ts**: utility functions for CSV parsing, logging, etc.

---
Hope this detailed map helps you get oriented. Happy coding!


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
