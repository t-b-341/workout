-- Optional session strategy tags (preset ids as text[]).
alter table if exists public.session_logs
  add column if not exists tags text[] not null default '{}';
