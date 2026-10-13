-- Kvitteringer for push: sendt fra oss, mottatt i tjenestearbeideren, vist
-- eller feilet. Uten dette ser vi bare at Google sa «ok», ikke om telefonen
-- fikk noe. Bare funksjonene (service-nøkkel) skriver og leser.
create table public.push_logg (
  id         bigint generated always as identity primary key,
  sending    uuid not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  hendelse   text not null check (length(hendelse) <= 40),
  detalj     text check (length(detalj) <= 500),
  at         timestamptz not null default now()
);
create index push_logg_sending on public.push_logg(sending);
alter table public.push_logg enable row level security;
revoke all on public.push_logg from anon, authenticated;
