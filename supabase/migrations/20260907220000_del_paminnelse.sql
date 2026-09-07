-- Påminnelsen skal kunne deles i Messenger i stedet for å sendes på e-post.
-- Messenger har ingen vei inn for en app, så delingen skjer fra telefonen.
-- Da trenger vi en bryter: lag regningene, men ikke send noe.
alter table public.settings
  add column email_invoices boolean not null default true;
