create table if not exists public.inspection_reports (
  id uuid primary key,
  report_id text not null unique,
  status text not null check (status in ('DRAFT', 'COMPLETED')),
  report jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_reports_updated_at_idx
  on public.inspection_reports (updated_at desc);

alter table public.inspection_reports enable row level security;

-- This app currently has no login flow, so the public browser key can only
-- access reports after these policies are intentionally enabled.
drop policy if exists "public can read inspection reports" on public.inspection_reports;
drop policy if exists "public can insert inspection reports" on public.inspection_reports;
drop policy if exists "public can update inspection reports" on public.inspection_reports;

create policy "public can read inspection reports"
  on public.inspection_reports for select
  to anon, authenticated
  using (true);

create policy "public can insert inspection reports"
  on public.inspection_reports for insert
  to anon, authenticated
  with check (true);

create policy "public can update inspection reports"
  on public.inspection_reports for update
  to anon, authenticated
  using (true)
  with check (true);
