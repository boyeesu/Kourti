# Kourti Legal – Developer Guide

This document is a high-level map of the project structure, key API routes, database schema, and AI workflows so a new developer can get productive quickly.

---
## 1. Repository Layout
```
kourti-legal-hub-41/
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
## 9. Module Reference (including AI & Export Features)

Below is a summary of key code modules and their responsibilities, including advanced AI and document export workflows.

### 9.1 Pages (`src/pages`)
- **Dashboard.tsx**: main landing page; stats, recent cases, upcoming events, actionable insights.
- **Documents.tsx**: lists documents; supports upload, AI-powered summarization, clause extraction, filtering, export (PDF/DOCX).
- **DocumentUpload.tsx**: upload & annotate new documents.
- **Contracts.tsx** / **ContractView.tsx** / **ContractEdit.tsx** / **ContractHistory.tsx**: contract CRUD, version control, AI redlines/comparison, risk analysis, export.
- **ContractCompare.tsx**: compare two documents/contracts using AI; shows clause-level diff, semantic similarity, and AI commentary.
- **Cases.tsx** / **CaseCreate.tsx** / **CaseDetails.tsx** / **CaseActivitiesNew.tsx**: manage cases, issues, activities, with export support.
- **Clients.tsx** / **ClientCreate.tsx** / **ClientDetails.tsx** / **ClientEdit.tsx**: client profiles, comm logs.
- **Calendar.tsx**: case hearings/events calendar.
- **Settings.tsx**, **UserManagement.tsx**, **Profile.tsx**: settings, roles, and app preferences.
- **BulkImport.tsx**: CSV/Excel import for clients/cases/docs.
- **ReamAI.tsx**: AI insights hub; manage/run advanced AI tasks (generation, analysis, Q&A coming soon).

### 9.2 Hooks (`src/hooks`)
- **useAuth, useCurrentUser, useUserOrganization, ...**: auth & org context.
- **useAnalyzeDocument**: AI summarization, clause extraction, risk analysis of any document.
- **useAnalyzeContract**: AI-driven redlines/comparison, risk or anomaly detection in contracts.
- **useAIContractGenerator**: prompts OpenAI API to auto-draft contracts per user input/selected templates.
- **useEnhancedDocumentAnalysis**: batch multi-operation AI (summary, extract, compare, risk assess).
- **useDocuments, useContracts, useCases, etc.**: fetch/save/query main domain objects (with export capability).
- **useVectorSearch**: semantic/AI search on uploaded documents.
- **useInvoicePDF**: create/download invoice PDFs.

### 9.3 Components (`src/components`)
- **ContractUploadDialog.tsx, ShareDocumentDialog.tsx**: dialog-driven upload/export/share.
- **DocumentViewer.tsx, ContractSuccess.tsx**: smart previews with AI-driven highlights & export buttons.
- **VoiceRecorder.tsx, VoiceTranscriptionModule.tsx**: audio-to-text AI transcription.
- **UI primitives (in `ui/`), layouts, shared/**: as before.

### 9.4 Lib (`src/lib`)
- **openaiService.ts, openaiWorkflows.ts**: wrappers for all OpenAI/Supabase AI-driven document and contract tasks (generation, summarization, comparison, redline, extraction).
- **documensoClient.ts**: facilitate e-sign/internal AI document flows.
- **utils/**: formatting, export, and utility helpers.

---
Hope this detailed map helps you get oriented — with full AI, export, and doc smart workflows.

---
## 3. Edge Functions (supabase/functions) — AI, Comparison, and Export
| function | description |
|----------|-------------|
| **ai-contract-generator** | POST body `{ prompt, contractType }` → returns auto-generated contract draft (LLM-powered, customizable by user prompt/template). |
| **advanced-contract-analysis** | `{ text, analysisType }` → OpenAI-powered summary, extract-clauses, risk, or anomaly detection for any legal doc/contract. |
| **generate-embeddings** | bulk vector embeddings for rapid vector/semantic search & comparisons. |
| **generate-invoice-pdf** | generates/export invoices in PDF. |
| **voice-transcription** | converts voice notes into legal text or case notes, then allows summary/export. |
| **contract-analysis** | legacy: `{text, analysisType}` → summarization, clause extraction, redline. |
| **scheduled-date-alerts** | cron for key contract/case deadlines. |

Examples:
- Upload any document → run AI summary or risk analysis.
- Compare/Redline two contract versions and download diff as PDF.
- Use the "Generate Contract" tool (AI) to create a draft; review, edit, then export as PDF/DOCX.

YAML Scheduler Example:
```yaml
schedules:
  - name: contract-date-reminders
    cron: '0 8 * * *'
    function: scheduled-date-alerts
```

---
## 4. Key Front-end/Workflow Hooks
- `useDocuments`, `useAnalyzeDocument`, `useAnalyzeContract`, `useAIContractGenerator` — all AI-based contract/doc flows.
- `useDashboardPrefs` / `useSaveDashboardPrefs`
- `useNotificationsDb` (pop-over list)
- `useInsights` — AI + rules-driven insights for upcoming actions.
- `useVectorSearch` — high-speed semantic search of doc content.
- Export context/actions always available from document/contract details pages.

---
## 5. UI User Workflows
1. **Upload doc** → Documents page → click "Summarize" or "Analyze" (AI) → result is saved/exportable.
2. **Open contract** → ContractView → "Run Risk Analysis" or "Redline/Compare" (AI) → highlights saved/available for export.
3. **Generate contract** → input requirements → AI creates draft → edit/download as DOCX/PDF.
4. **Compare versions** → ContractCompare page → AI clause-level diff → export side-by-side comparison.
5. Daily/cron: notifications for key due dates.
6. Top-bar bell: notification hub. Pop-over shows activity/reminder AI prompts. Users can mark-read/clear.
7. Settings: configure dashboard, AI widget toggles, reminder window, export defaults.

---
## 6. Document & Contract Export Features

All document and contract views support exporting to the following formats:
- PDF (preserves legal format, clause numbers)
- DOCX (editable, for Microsoft Word)

Exports always available after generation/upload, analysis, or AI-edit.

---
## 7. Dev Scripts
```
# install deps
npm install
# dev server
npm run dev
# supabase local stack helpers (CLI required)
npm run supabase:start
npm run supabase:status
npm run supabase:stop
# deploy edge function (AI, export, etc)
supabase functions deploy <function>
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
DOCUMENSO_BASE_URL=<https://your-documenso-instance>
DOCUMENSO_API_KEY=<your-documenso-api-key>
ALLOWED_ORIGINS=<https://app.example.com,https://admin.example.com> # optional CORS allowlist for edge functions
```

Set the Documenso secrets with the Supabase CLI for local and deployed environments:

```
supabase secrets set --env local DOCUMENSO_BASE_URL="https://your-documenso-instance"
supabase secrets set --env local DOCUMENSO_API_KEY="your-documenso-api-key"
```

Then deploy the function so the front-end e-signature dialog can proxy requests securely:

```
supabase functions deploy documenso-api
```

---
## 8. Future TODOs
- Implement Q&A RAG workflow
- e-Signature provider integration
- Pagination for notifications list
- CI pipeline to run lint/test & deploy edge functions automatically

---
Welcome aboard 🎉 – this should give you the map of the codebase, DB, and AI workflows. Reach out to maintainers if you need deeper details.
