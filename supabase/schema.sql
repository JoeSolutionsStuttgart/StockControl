-- ══════════════════════════════════════════════════════════════════
--  StockControl — Schema, Rechte und Automatik für Supabase
--  Einmal komplett im SQL-Editor ausführen.
--
--  Grundsatz: NICHTS ist öffentlich. Jede Zeile gehört zu genau einer
--  Firma, und nur angemeldete, aktive Konten dieser Firma kommen daran.
--  Ohne Anmeldung ist keine einzige Zeile lesbar.
-- ══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Tabellen ──────────────────────────────────────────────────────

create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'gratis',
  status      text not null default 'active',      -- active | blocked
  created_at  timestamptz not null default now()
);

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  company_id  uuid not null references companies on delete cascade,
  name        text not null default '',
  email       text not null,
  role        text not null default 'worker',      -- owner | manager | worker | reader
  status      text not null default 'active',      -- active | pending | blocked | removed
  permissions jsonb not null default '{}'::jsonb,  -- Feinrechte, überschreiben die Rolle
  lang        text not null default 'de',
  theme       text not null default 'system',
  created_at  timestamptz not null default now()
);

create table if not exists settings (
  company_id   uuid primary key references companies on delete cascade,
  mail_mode    text not null default 'now',        -- now | day | week | month
  mail_time    time not null default '07:30',
  mail_weekday int  not null default 1,
  mail_day     int  not null default 1,
  cc_deputies  boolean not null default true
);

create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies on delete cascade,
  name            text not null,
  ean             text,
  ist             int  not null default 0,
  min             int  not null default 0,
  bestellmenge    int  not null default 0,
  ort             text,
  mhd             date,
  preis           numeric(10,2),
  quantitaet      text,
  lieferant       text,
  link            text,
  bild_url        text,                            -- nur der R2-Schlüssel, keine offene URL
  kategorien      text[] not null default '{}',
  status          text not null default 'ok',      -- ok | low | ordered | delivered
  aktiv           boolean not null default true,
  verantwortlich  uuid references profiles on delete set null,
  vertreter       uuid[] not null default '{}',    -- 0 bis 3 Stellvertretungen
  geaendert_von   uuid references profiles on delete set null,
  entnahme_am     timestamptz,
  auffuell_am     timestamptz,
  created_at      timestamptz not null default now(),
  unique (company_id, ean)
);

create table if not exists movements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies on delete cascade,
  product_id  uuid not null references products on delete cascade,
  profile_id  uuid references profiles on delete set null,
  delta       int  not null,                       -- negativ = Entnahme
  bestand_neu int,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists movements_product_idx on movements (product_id, created_at desc);

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies on delete cascade,
  name        text not null,
  datum       date,
  ort         text,
  created_at  timestamptz not null default now()
);

create table if not exists event_items (
  event_id    uuid not null references events on delete cascade,
  product_id  uuid not null references products on delete cascade,
  qty         int  not null default 1,
  primary key (event_id, product_id)
);

create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies on delete cascade,
  email       text not null,
  role        text not null default 'worker',
  token       uuid not null default gen_random_uuid(),
  expires_at  timestamptz not null default now() + interval '3 hours',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies on delete cascade,
  product_id  uuid references products on delete cascade,
  typ         text not null default 'low_stock',
  status      text not null default 'pending',     -- pending | sent
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- ── Betreiberzugang der Internet GmbH ─────────────────────────────
-- Eine ausdrückliche Liste. Wer hier nicht eingetragen ist, hat keinen
-- Betreiberzugang — es gibt keine Rolle, in die man hineinwachsen kann.
-- Eintragen von Hand im SQL-Editor:
--   insert into platform_admins (profile_id)
--   select id from profiles where email = 'deine@internet-gmbh.de';

create table if not exists platform_admins (
  profile_id uuid primary key references profiles on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
alter table platform_admins force row level security;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins a
      join profiles p on p.id = a.profile_id
     where a.profile_id = auth.uid() and p.status = 'active'
  )
$$;

-- ── Hilfsfunktionen ───────────────────────────────────────────────
-- current_company() ist der Angelpunkt der gesamten Trennung.
-- Sie gibt NULL zurück, wenn das Konto nicht aktiv ist ODER die Firma
-- gesperrt wurde. Weil jede Regel unten auf diesen Wert prüft und
-- "spalte = NULL" nie wahr wird, sieht ein gesperrtes Konto und eine
-- gesperrte Firma nichts mehr — ohne dass irgendeine Regel das
-- einzeln behandeln müsste.

create or replace function current_company() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id
    from profiles p
    join companies c on c.id = p.company_id
   where p.id = auth.uid()
     and p.status = 'active'
     and c.status = 'active'
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'owner'
      from profiles p
      join companies c on c.id = p.company_id
     where p.id = auth.uid() and p.status = 'active' and c.status = 'active'
  ), false)
$$;

create or replace function may_write_products() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role in ('owner','manager') or coalesce((p.permissions->>'edit')::boolean, false)
      from profiles p
      join companies c on c.id = p.company_id
     where p.id = auth.uid() and p.status = 'active' and c.status = 'active'
  ), false)
$$;

-- ── Registrierung: Firma + Profil automatisch anlegen ─────────────

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid; inv record;
begin
  select * into inv from invitations
   where lower(email) = lower(new.email) and accepted_at is null and expires_at > now()
   order by created_at desc limit 1;

  if inv.id is not null then                       -- eingeladene Person
    cid := inv.company_id;
    update invitations set accepted_at = now() where id = inv.id;
    insert into profiles (id, company_id, email, name, role)
      values (new.id, cid, new.email, coalesce(new.raw_user_meta_data->>'name',''), inv.role);
  else                                             -- neue Firma, Person 1
    insert into companies (name)
      values (coalesce(new.raw_user_meta_data->>'company_name', new.email))
      returning id into cid;
    insert into profiles (id, company_id, email, name, role)
      values (new.id, cid, new.email, coalesce(new.raw_user_meta_data->>'name',''), 'owner');
    insert into settings (company_id) values (cid) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ── Firmenzuordnung erzwingen ─────────────────────────────────────
-- Die company_id wird IMMER serverseitig gesetzt, nie aus dem Browser
-- übernommen. Ein manipulierter Aufruf kann also keine Zeile in eine
-- fremde Firma schreiben.

create or replace function stamp_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.company_id := current_company();
  if new.company_id is null then
    raise exception 'Kein aktives Firmenprofil';
  end if;
  return new;
end $$;

drop trigger if exists products_company on products;
create trigger products_company before insert on products
  for each row execute function stamp_company();
drop trigger if exists events_company on events;
create trigger events_company before insert on events
  for each row execute function stamp_company();
drop trigger if exists invitations_company on invitations;
create trigger invitations_company before insert on invitations
  for each row execute function stamp_company();

-- Firmenwechsel einer bestehenden Zeile ist ausgeschlossen.
create or replace function freeze_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'Die Firmenzuordnung kann nicht geändert werden';
  end if;
  return new;
end $$;

drop trigger if exists products_freeze on products;
create trigger products_freeze before update on products
  for each row execute function freeze_company();
drop trigger if exists events_freeze on events;
create trigger events_freeze before update on events
  for each row execute function freeze_company();
drop trigger if exists profiles_freeze on profiles;
create trigger profiles_freeze before update on profiles
  for each row execute function freeze_company();

-- Rolle, Status und Feinrechte darf nur die inhabende Person ändern —
-- niemand kann sich selbst hochstufen.
create or replace function guard_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() and (
       new.role        is distinct from old.role or
       new.status      is distinct from old.status or
       new.permissions is distinct from old.permissions) then
    raise exception 'Rolle, Status und Rechte darf nur die inhabende Person ändern';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_change();

-- ── Bestandsfortschreibung ────────────────────────────────────────

create or replace function apply_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare p products;
begin
  select * into p from products
   where id = new.product_id and company_id = current_company() for update;
  if p.id is null then raise exception 'Produkt unbekannt oder kein Zugriff'; end if;

  new.company_id := p.company_id;
  new.profile_id := auth.uid();                    -- immer die angemeldete Person
  new.bestand_neu := greatest(0, p.ist + new.delta);

  -- Deaktivierte Produkte: kein Tracking, keine Mail.
  if p.aktiv = false then
    return new;
  end if;

  update products set
    ist = new.bestand_neu,
    status = case when new.bestand_neu < p.min then
                    case when p.status = 'ordered' then 'ordered' else 'low' end
                  else 'ok' end,
    entnahme_am = case when new.delta < 0 then now() else p.entnahme_am end,
    auffuell_am = case when new.delta > 0 then now() else p.auffuell_am end,
    geaendert_von = auth.uid()
  where id = p.id;

  if new.bestand_neu < p.min and p.ist >= p.min then
    insert into notifications (company_id, product_id) values (p.company_id, p.id);
  end if;
  return new;
end $$;

drop trigger if exists movements_apply on movements;
create trigger movements_apply before insert on movements
  for each row execute function apply_movement();

-- ── Row Level Security ────────────────────────────────────────────
-- Jede Regel ist auf "to authenticated" eingeschränkt: die anonyme
-- Rolle (der öffentliche Schlüssel ohne Anmeldung) trifft auf keine
-- einzige Regel und sieht damit nichts. Alte Regeln werden vorher
-- entfernt, damit ein zweiter Durchlauf dieses Skripts nichts doppelt
-- oder Altlasten stehen lässt.

alter table companies     enable row level security;
alter table profiles      enable row level security;
alter table settings      enable row level security;
alter table products      enable row level security;
alter table movements     enable row level security;
alter table events        enable row level security;
alter table event_items   enable row level security;
alter table invitations   enable row level security;
alter table notifications enable row level security;

alter table companies     force row level security;
alter table profiles      force row level security;
alter table settings      force row level security;
alter table products      force row level security;
alter table movements     force row level security;
alter table events        force row level security;
alter table event_items   force row level security;
alter table invitations   force row level security;
alter table notifications force row level security;

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('companies','profiles','settings','products','movements',
                         'events','event_items','invitations','notifications',
                         'platform_admins')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Firma: nur die eigene, ändern nur die inhabende Person, niemals löschen.
create policy company_read  on companies for select to authenticated
  using (id = current_company());
create policy company_write on companies for update to authenticated
  using (id = current_company() and is_owner())
  with check (id = current_company());

-- Profile: das eigene Team sehen; ändern darf man sich selbst
-- (Name, Sprache, Design) oder als inhabende Person alle. Rolle,
-- Status und Rechte sind zusätzlich durch guard_profile_change()
-- geschützt. Anlegen geschieht nur durch den Registrierungs-Trigger,
-- löschen gar nicht — ausgeschiedene Personen werden auf
-- status = 'removed' gesetzt, damit der Verlauf lesbar bleibt.
create policy profiles_read  on profiles for select to authenticated
  using (company_id = current_company());
create policy profiles_write on profiles for update to authenticated
  using (company_id = current_company() and (is_owner() or id = auth.uid()))
  with check (company_id = current_company());

-- Einstellungen: lesen alle der Firma, ändern nur die inhabende Person.
create policy settings_read   on settings for select to authenticated
  using (company_id = current_company());
create policy settings_write  on settings for update to authenticated
  using (company_id = current_company() and is_owner())
  with check (company_id = current_company());
create policy settings_insert on settings for insert to authenticated
  with check (company_id = current_company() and is_owner());

-- Produkte: lesen alle der Firma; anlegen und ändern, wer das Recht
-- hat; löschen nur die inhabende Person.
create policy products_read   on products for select to authenticated
  using (company_id = current_company());
create policy products_insert on products for insert to authenticated
  with check (may_write_products());
create policy products_update on products for update to authenticated
  using (company_id = current_company() and may_write_products())
  with check (company_id = current_company());
create policy products_delete on products for delete to authenticated
  using (company_id = current_company() and is_owner());

-- Bewegungen: das Protokoll. Einfügen ja, ändern und löschen nie —
-- auch nicht durch die inhabende Person. Damit ist der Verlauf
-- fälschungssicher.
create policy movements_read   on movements for select to authenticated
  using (company_id = current_company());
create policy movements_insert on movements for insert to authenticated
  with check (product_id in (select id from products where company_id = current_company()));

-- Events und ihre Positionen: innerhalb der eigenen Firma.
create policy events_read   on events for select to authenticated
  using (company_id = current_company());
create policy events_insert on events for insert to authenticated
  with check (true);                               -- stamp_company() setzt die Firma
create policy events_update on events for update to authenticated
  using (company_id = current_company())
  with check (company_id = current_company());
create policy events_delete on events for delete to authenticated
  using (company_id = current_company() and may_write_products());

create policy event_items_all on event_items for all to authenticated
  using (event_id in (select id from events where company_id = current_company()))
  with check (event_id in (select id from events where company_id = current_company()));

-- Einladungen: nur die inhabende Person, nur die eigene Firma.
-- Der Token wird nie an den Browser gegeben, sondern nur an die
-- Mailfunktion — Annahme läuft über den Registrierungs-Trigger.
create policy invitations_read   on invitations for select to authenticated
  using (company_id = current_company() and is_owner());
create policy invitations_insert on invitations for insert to authenticated
  with check (is_owner());
create policy invitations_delete on invitations for delete to authenticated
  using (company_id = current_company() and is_owner());

-- Benachrichtigungen: nur lesen. Angelegt werden sie vom Trigger,
-- abgearbeitet von der Mailfunktion mit Dienstschlüssel.
create policy notifications_read on notifications for select to authenticated
  using (company_id = current_company());

-- ── Ansicht für die Bestellliste ──────────────────────────────────
-- security_invoker = true ist hier entscheidend: ohne diese Angabe
-- würde die Ansicht mit den Rechten ihrer Eigentümerin laufen und die
-- Zeilenregeln der Tabelle umgehen — sie würde also Produkte ALLER
-- Firmen zeigen. Mit security_invoker greift die Regel der
-- aufrufenden Person.

drop view if exists order_list;
create view order_list with (security_invoker = true) as
  select p.id, p.company_id, p.name, p.ist, p.min, p.bestellmenge,
         p.lieferant, p.ort, p.preis, p.status
    from products p
   where p.aktiv and p.ist < p.min;

-- ── Betreiberzugang: Firmen und Personen verwalten ────────────────
-- Wichtig: Der Betreiberzugang sieht FIRMEN und PERSONEN, aber keine
-- Produktdaten. Die Regeln auf products, movements, events und
-- settings bleiben unverändert auf current_company() — is_platform_admin()
-- kommt dort absichtlich nicht vor. Die Internet GmbH kann also sperren,
-- löschen und Passwörter anfordern, ohne in fremde Lager zu sehen.

create policy companies_admin_read on companies for select to authenticated
  using (is_platform_admin());
create policy companies_admin_write on companies for update to authenticated
  using (is_platform_admin());
create policy companies_admin_delete on companies for delete to authenticated
  using (is_platform_admin());

create policy profiles_admin_read on profiles for select to authenticated
  using (is_platform_admin());
create policy profiles_admin_write on profiles for update to authenticated
  using (is_platform_admin());

create policy platform_admins_read on platform_admins for select to authenticated
  using (is_platform_admin());

-- Artikelzahl als reine Kennzahl. Die Funktion zählt, gibt aber keine
-- Produktzeile heraus — deshalb darf sie security definer sein, ohne
-- das Versprechen "kein Einblick in fremde Lager" zu brechen. Zählen
-- darf nur, wer Betreiberzugang hat oder die eigene Firma abfragt.
create or replace function company_item_count(cid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from products
   where company_id = cid
     and (is_platform_admin() or company_id = current_company())
$$;

revoke all on function company_item_count(uuid) from public, anon;
grant execute on function company_item_count(uuid) to authenticated;

-- Übersicht für die Konsole: Kennzahlen statt Inhalte. Die Ansicht
-- zählt Personen und Artikel, gibt aber keine Produktzeile heraus.
drop view if exists company_overview;
create view company_overview with (security_invoker = true) as
  select c.id, c.name, c.plan, c.status, c.created_at,
         (select p.email from profiles p
           where p.company_id = c.id and p.role = 'owner'
           order by p.created_at limit 1) as admin_email,
         (select count(*) from profiles p
           where p.company_id = c.id and p.status <> 'removed') as users,
         company_item_count(c.id) as items
    from companies c;

-- Löschen einer Firma: entfernt Firma, Profile, Produkte, Verlauf und
-- Events über die Fremdschlüssel. Die Anmeldekonten bleiben bestehen,
-- verlieren aber jedes Profil — current_company() gibt dann NULL
-- zurück und damit ist kein Zugriff mehr möglich.
create or replace function admin_delete_company(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Kein Betreiberzugang';
  end if;
  delete from companies where id = cid;
end $$;

revoke all on function admin_delete_company(uuid) from public, anon;
grant execute on function admin_delete_company(uuid) to authenticated;

-- ── Rechte der Datenbankrollen ────────────────────────────────────
-- Die anonyme Rolle bekommt auf keine Tabelle Rechte. Selbst wenn
-- eine Regel künftig zu weit gefasst würde, käme ein nicht
-- angemeldeter Aufruf nicht an die Daten.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ── Selbsttest ────────────────────────────────────────────────────
-- Nach dem Einspielen ausführen. Jede Zeile muss "true" ergeben.
--
--   select relname, relrowsecurity, relforcerowsecurity
--     from pg_class
--    where relname in ('companies','profiles','settings','products','movements',
--                      'events','event_items','invitations','notifications');
--
--   select table_name, is_insertable_into from information_schema.views
--    where table_name = 'order_list';
--
--   -- Muss 0 Zeilen liefern (anon hat keine Rechte):
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where grantee = 'anon' and table_schema = 'public';
