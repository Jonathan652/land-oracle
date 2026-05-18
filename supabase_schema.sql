-- SQL Schema for Statum AI (Supabase pgvector)
-- Run this in your Supabase SQL Editor

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Legal Documents Table (Source of Truth)
create table if not exists legal_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  citation_id text unique not null, -- e.g. UG-LAND-ACT-236
  type text check (type in ('Act', 'Regulation', 'Gazette', 'Judgment', 'Bill')),
  status text default 'active', -- active, repealed, amended
  published_date date,
  commencement_date date,
  url text,
  full_text_path text, -- reference to object storage
  created_at timestamp with time zone default now()
);

-- 3. Document Chunks (Vector Store)
create table if not exists legal_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references legal_documents(id) on delete cascade,
  content text not null,
  citation_handle text, -- e.g. Section 29
  metadata jsonb,
  embedding vector(768), -- Optimized for Google text-embedding-004
  created_at timestamp with time zone default now()
);

-- 4. Amendment Relationship Graph
create table if not exists law_amendments (
  id uuid primary key default gen_random_uuid(),
  amending_doc_id uuid references legal_documents(id),
  target_doc_id uuid references legal_documents(id),
  affected_sections text[],
  effective_date date,
  description text
);

-- 5. Hybrid Search Index
create index on legal_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index chunks_metadata_idx on legal_chunks using gin (metadata);
create index chunks_content_idx on legal_chunks using gin (to_tsvector('english', content));
