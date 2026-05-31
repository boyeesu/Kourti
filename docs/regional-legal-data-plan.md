# Regional Legal Data — Grounding REAM in Nigerian Law

**Status:** Proposed
**Owner:** TBD
**Last updated:** 2026-05-30

---

## 1. Problem

REAM (Kourti's in-app AI legal assistant) today only retrieves from a **single org's own uploaded documents**. Its `ragSearch()` is scoped by `organization_id` ([`backend-node/src/routes/api/ai.ts`](../backend-node/src/routes/api/ai.ts) ~L213–L221). There is **no shared, jurisdiction-wide corpus** of Nigerian statutes or case law.

Consequence: when a lawyer asks "what is the position under Nigerian law on X," REAM answers from the base model's general knowledge — the single biggest source of **wrong/hallucinated citations**. For a legal product this is not a UX gap; it is professional-liability risk for the user.

**Goal:** Add a "legal authority layer" — a global, org-agnostic knowledge base of Nigerian statutes (Phase 1) and case law (Phase 2) that REAM searches _alongside_ the user's matter documents and **cites with linkable sources**.

---

## 2. Guiding principles

1. **The engineering is the small part.** The RAG stack already exists (pgvector, `document_chunks`, embeddings via OpenRouter, `marketing_kb_chunks`). ~70% of this project is sourcing, licensing, and accuracy discipline.
2. **Phase it: statutes-first, public-domain.** Highest grounding value, lowest legal risk, shippable without anyone's permission.
3. **Citations are mandatory and source-linked.** Every grounded claim shows which statute section / judgment it came from.
4. **Grounded vs. general must be visually distinct.** Never let model-knowledge masquerade as retrieved authority.
5. **Never cross the law-report copyright line** (see §6).

---

## 3. Phased roadmap

| Phase | Content                                                             | Source                                          | Legal risk        | Status          |
| ----- | ------------------------------------------------------------------- | ----------------------------------------------- | ----------------- | --------------- |
| **1** | Statutes & regulations (Constitution, LFN Acts, subsidiary regs)    | Public domain (NigeriaLII / laws.gov.ng)        | Low               | **Build first** |
| **2** | Case law (raw judgments) + Kourti-authored summaries                | Public domain judgments + our own LLM headnotes | Medium (accuracy) | Next            |
| **3** | "Good law" / currency signal (overruled / affirmed / distinguished) | Curated dataset                                 | High effort       | Later / premium |
| **4** | Licensed law-report-grade corpus (NWLR-class)                       | Commercial partner license                      | Commercial deal   | Premium tier    |

**This document specifies Phase 1 in full and sketches Phase 2.**

---

## 4. Phase 1 — Statutes (public domain)

### 4.1 Why statutes first

- **Free and legal to ingest** — there is no copyright on the text of the law itself.
- **Stable** — change slowly (amendments, new Acts); the "keep current" problem is tractable.
- **Structurally clean** — sections/subsections/schedules chunk well and cite cleanly (e.g. "S.14(2)(b) Evidence Act 2011").
- **Removes the largest hallucination class** — most invented references are _statutory_, not case-based.

### 4.2 Sources (in preference order)

1. **NigeriaLII / Laws.Africa** — publishes structured **Akoma Ntoso XML** under an open licence. Cleanest possible ingestion; section structure is machine-readable. **Primary source.**
2. **laws.gov.ng / Federal Ministry of Justice** — official LFN. Fallback / cross-check for currency.
3. State laws — defer until federal corpus is proven.

> Action: confirm NigeriaLII licence terms (attribution requirements) before ingest and record attribution in the corpus metadata.

### 4.3 Data model

New table, **global (NOT org-scoped)** — mirrors `marketing_kb_chunks`:

```sql
create table if not exists legal_kb_documents (
  id            uuid primary key default gen_random_uuid(),
  jurisdiction  text not null default 'NG',         -- ISO-ish; future-proofs multi-region
  source_type   text not null,                       -- 'statute' | 'regulation' | 'judgment'
  title         text not null,                       -- 'Evidence Act'
  citation      text,                                -- 'Evidence Act 2011', 'LFN Cap E14'
  year          int,
  status        text not null default 'in_force',    -- 'in_force' | 'repealed' | 'amended'
  effective_date date,
  source_url    text,                                -- linkable origin (NigeriaLII)
  source_licence text,                               -- attribution / licence string
  content_hash  text,                                -- SHA-256 for idempotent re-ingest
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists legal_kb_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references legal_kb_documents(id) on delete cascade,
  jurisdiction  text not null default 'NG',
  source_type   text not null,
  section_ref   text,                                -- 'S.14(2)(b)' — for precise citation
  heading       text,                                -- section heading if present
  content       text not null,
  chunk_index   int not null,
  embedding     vector(1536),                        -- text-embedding-3-small, matches existing
  token_count   int,
  created_at    timestamptz default now()
);

create index if not exists legal_kb_chunks_embedding_idx
  on legal_kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists legal_kb_chunks_jurisdiction_idx
  on legal_kb_chunks (jurisdiction, source_type);
```

Schema lives in [`backend-node/src/db/bootstrap.ts`](../backend-node/src/db/bootstrap.ts) — **not** `supabase/migrations/` (per project convention).

### 4.4 Ingestion pipeline

Mirror the existing `npm run kb:ingest` flow (`services/marketingKb.ts`). New script: `npm run legal:ingest`.

```
fetch (NigeriaLII XML) → parse Akoma Ntoso → normalise → chunk BY SECTION → embed (batch) → upsert (by content_hash)
```

**Key differences from marketing KB:**

- **Chunk by legal section, not by token window.** A section _is_ the natural retrieval+citation unit. Only split oversized sections, preserving `section_ref`.
- **Idempotent re-ingest** via `content_hash` so re-running on amendment only touches changed sections.
- **Carry citation metadata** (`citation`, `section_ref`, `source_url`) through to each chunk so retrieval can cite precisely.

Embeddings: reuse `lib/openai.ts` `text-embedding-3-small` (1536-dim), batched ≤20.

### 4.5 Blended retrieval in REAM

The core change. Today REAM does one org-scoped search. New behaviour — **two searches, merged, origin-labelled**:

1. **Matter search** — existing `ragSearch()` over `document_chunks` (org-scoped). Unchanged.
2. **Authority search** — new search over `legal_kb_chunks` (global, filtered by `jurisdiction`).
3. Merge results, **tagging each with its origin** (`matter_document` vs `legal_authority`) and citation metadata.
4. Pass to the LLM with a system-prompt contract: _cite the section/case for every grounded claim; distinguish retrieved authority from general guidance._

This is an additive change to the retrieval layer in [`ai.ts`](../backend-node/src/routes/api/ai.ts), not a rewrite. The `/ream-assistant` endpoint shape is unchanged.

### 4.6 Frontend

- Render an **Authorities / Sources panel** under REAM answers: statute name + section, linking to `source_url`.
- **Visually distinguish** grounded citations (with source) from general guidance.
- Persistent disclaimer: _"AI-generated guidance — verify against the primary source before relying."_

### 4.7 Gating

Natural **Professional+** feature via the existing `plan_features` + `requireFeature` middleware. Trial → pro inherits it. Add a `legal_authority` (or similar) feature key.

---

## 5. Phase 2 — Case law (sketch)

- Ingest **raw judgments** (public domain) from NigeriaLII / court portals into `legal_kb_documents` with `source_type = 'judgment'`.
- Generate **Kourti's own headnotes/summaries** with the LLM — _do not_ scrape commercial headnotes (see §6). We own and are accountable for these summaries.
- Citations link to the **full judgment text**, never to a third-party report.
- Defer the "good law" / overruled-status signal to Phase 3 — it is its own curated dataset and the hardest accuracy problem.

---

## 6. Legal / licensing line — **do not cross**

- ✅ **Public domain, free to ingest:** the text of statutes; the text of court judgments (what the court actually wrote and held); NigeriaLII open data (with attribution).
- ❌ **Copyrighted — must NOT scrape or resell:** commercial **law reports (NWLR and class)** — their headnotes, editorial summaries, ratio extraction, and curated digests are the publisher's product. Reproducing them is infringement.
- Two legitimate routes to report-grade content: **(a)** ingest raw judgments + build _our own_ summary layer (legal; we own accuracy), or **(b)** **license** a curated corpus from a publisher (premium tier, recurring cost). Do **not** block launch on (b); pursue it in parallel.

---

## 7. Accuracy & duty of care (non-negotiable)

Priority order:

1. **Mandatory, source-linked citations** — enforce in REAM's system prompt + UI, not optional.
2. **Retrieved-authority vs model-knowledge** visually distinct in the UI.
3. **Standing disclaimer** + "verify before relying" framing everywhere.
4. **"Good law" currency signal** — later/premium; the hardest part.

A confident citation of a **wrong or overruled** case is worse than no answer. The accuracy contract is what turns this from a liability into a genuine plus for legal professionals.

---

## 8. Build checklist (Phase 1)

- [ ] Confirm NigeriaLII licence + attribution terms.
- [ ] Add `legal_kb_documents` + `legal_kb_chunks` to `bootstrap.ts`.
- [ ] Build `legal:ingest` script (fetch → parse Akoma Ntoso → section-chunk → embed → upsert).
- [ ] Ingest a pilot corpus (e.g. Constitution + Evidence Act + 3–5 high-traffic Acts).
- [ ] Add authority search over `legal_kb_chunks`; blend into REAM retrieval with origin labels.
- [ ] Update REAM system prompt: mandatory section-level citations.
- [ ] Frontend: Authorities panel + grounded/general distinction + disclaimer.
- [ ] Gate behind `requireFeature` (Professional+).
- [ ] Eval: a fixed set of NG-law questions; verify citations resolve to real sections.

---

## 9. Effort summary

| Area                            | Relative effort                        |
| ------------------------------- | -------------------------------------- |
| Schema + retrieval blending     | Small (pattern already exists)         |
| Ingestion pipeline (statutes)   | Medium (XML parsing, section chunking) |
| Sourcing + licence confirmation | Medium (process, not code)             |
| Accuracy/citation UX            | Medium                                 |
| Case law (Phase 2)              | Large (summaries + accuracy)           |
| Licensed corpus (Phase 4)       | Commercial, not engineering            |

**Bottom line:** the RAG stack already does the hard technical work. The project is sourcing, licensing discipline, and accuracy — start with statutes, public-domain, this quarter.
