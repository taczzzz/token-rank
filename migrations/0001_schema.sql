create table if not exists claims (
  id integer primary key autoincrement,
  nonce text not null,
  x_handle text not null,
  provider text not null,
  status text not null,
  total_tokens integer,
  created_at text not null,
  expires_at text not null,
  uploaded_at text
);

create unique index if not exists idx_claims_nonce on claims (nonce);
create index if not exists idx_claims_handle_provider on claims (x_handle, provider);

create table if not exists badges (
  x_handle text not null,
  provider text not null,
  period text not null,
  total_tokens integer not null,
  formatted_tokens text not null,
  rank_json text not null,
  confidence text not null,
  source text not null,
  page_url text,
  evidence_json text,
  updated_at text not null,
  primary key (x_handle, provider, period)
);
