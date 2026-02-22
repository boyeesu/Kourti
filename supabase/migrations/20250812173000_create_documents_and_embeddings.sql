-- Enable the pgvector extension for similarity search
create extension if not exists vector;

-- Documents table: store raw text, summaries, metadata, and key dates
create table if not exists documents (
  id               uuid      primary key default gen_random_uuid(),
  name             text      not null,
  content          text      not null,
  summary          text,
  metadata         jsonb     default '{}'::jsonb,
  effective_date   date,
  renewal_date     date,
  termination_date date,
  organization_id  uuid      references organizations(id),
  uploaded_by      uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Store contract embeddings for RAG
create table if not exists contract_embeddings (
  contract_id uuid      references documents(id) on delete cascade,
  embedding   vector(1536) not null,
  primary key(contract_id)
);

-- Library of best-practice clauses (pre-embedded)
create table if not exists best_practices (
  id        uuid      primary key default gen_random_uuid(),
  name      text      not null,
  clause    text      not null,
  embedding vector(1536) not null
);

-- RPC to retrieve top 5 similar best-practice clauses
create or replace function match_best_practices(query vector(1536))
returns table(id uuid, clause text, similarity double precision)
language sql stable as $$
  select
    id,
    clause,
    1 - (embedding <=> query) as similarity
  from best_practices
  order by embedding <=> query
  limit 5;
$$;