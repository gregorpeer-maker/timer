-- KFZ-Arbeitsplatz – Cloud-Datenbank für Supabase (kostenloser Tarif)
-- Einmal im Supabase-Dashboard unter „SQL Editor“ einfügen und auf „Run“ klicken.
-- Die Datei kann gefahrlos erneut ausgeführt werden.
--
-- Aufbau
--   teams       Fachlehrer-Team; Beitritt nur mit Einladungscode
--   mitglieder  wer zu welchem Team gehört
--   eintraege   gemeinsame Daten (Stoffverteilung, To-dos, Termine, Pinnwand, Lehrplan, Material …)
--               Neuere Änderung gewinnt (Spalte upd). Gelöscht wird nur markiert (geloescht).
--               privat_von gesetzt = nur für diese Person sichtbar (z. B. private To-dos)
--   profil      persönliche Daten je Person (Stundenplan, Klingelzeiten, Einstellungen) – für alle eigenen Geräte
--
-- Sicherheit: Row Level Security. Ohne Mitgliedschaft sieht niemand etwas, auch wer sich registriert hat.

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  code        text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  erstellt_von uuid not null default auth.uid() references auth.users(id) on delete cascade,
  erstellt    timestamptz not null default now()
);

create table if not exists public.mitglieder (
  team_id  uuid not null references public.teams(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  name     text not null default '' check (char_length(name) <= 80),
  rolle    text not null default 'mitglied' check (rolle in ('admin', 'mitglied')),
  seit     timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.eintraege (
  team_id       uuid not null references public.teams(id) on delete cascade,
  sammlung      text not null check (sammlung ~ '^[a-z]{2,20}$'),
  id            text not null check (char_length(id) between 1 and 60),
  daten         jsonb not null default '{}' check (pg_column_size(daten) < 200000),
  upd           bigint not null,
  geloescht     boolean not null default false,
  privat_von    uuid references auth.users(id) on delete cascade,
  geaendert_von uuid default auth.uid(),
  server_zeit   timestamptz not null default clock_timestamp(),
  primary key (team_id, sammlung, id)
);
create index if not exists eintraege_abgleich on public.eintraege (team_id, server_zeit);

create table if not exists public.profil (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  daten       jsonb not null default '{}' check (pg_column_size(daten) < 2000000),
  upd         bigint not null default 0,
  server_zeit timestamptz not null default clock_timestamp()
);

-- Neuere Änderung gewinnt: ältere Stände (kleineres upd) überschreiben nichts.
-- server_zeit ist die Uhr des Servers und dient den Geräten als Abgleich-Marke.
create or replace function public.nur_neuere() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.upd < old.upd then
    return old;   -- verworfen, alter Stand bleibt
  end if;
  new.server_zeit := clock_timestamp();
  if tg_table_name = 'eintraege' then new.geaendert_von := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists eintraege_neuere on public.eintraege;
create trigger eintraege_neuere before insert or update on public.eintraege for each row execute function public.nur_neuere();
drop trigger if exists profil_neuere on public.profil;
create trigger profil_neuere before insert or update on public.profil for each row execute function public.nur_neuere();

-- Ist die angemeldete Person Mitglied? (security definer, damit die Regel selbst nicht an RLS hängt)
create or replace function public.ist_mitglied(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mitglieder where team_id = t and user_id = auth.uid())
$$;
create or replace function public.ist_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mitglieder where team_id = t and user_id = auth.uid() and rolle = 'admin')
$$;

-- Team anlegen: die Person wird Admin
create or replace function public.team_anlegen(p_name text, p_anzeigename text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare t teams;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into teams (name, erstellt_von) values (trim(p_name), auth.uid()) returning * into t;
  insert into mitglieder (team_id, user_id, name, rolle) values (t.id, auth.uid(), coalesce(trim(p_anzeigename), ''), 'admin');
  return t;
end $$;

-- Mit Einladungscode beitreten
create or replace function public.team_beitreten(p_code text, p_anzeigename text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare t teams;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into t from teams where code = upper(trim(p_code));
  if not found then raise exception 'Einladungscode unbekannt'; end if;
  insert into mitglieder (team_id, user_id, name) values (t.id, auth.uid(), coalesce(trim(p_anzeigename), ''))
    on conflict (team_id, user_id) do update set name = excluded.name;
  return t;
end $$;

-- Neuen Einladungscode erzeugen (nur Admin), z. B. wenn der alte weitergegeben wurde
create or replace function public.code_erneuern(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not ist_admin(p_team) then raise exception 'Nur für Admins'; end if;
  update teams set code = c where id = p_team;
  return c;
end $$;

alter table public.teams      enable row level security;
alter table public.mitglieder enable row level security;
alter table public.eintraege  enable row level security;
alter table public.profil     enable row level security;

drop policy if exists teams_lesen on public.teams;
create policy teams_lesen on public.teams for select using (ist_mitglied(id));
drop policy if exists teams_umbenennen on public.teams;
create policy teams_umbenennen on public.teams for update using (ist_admin(id)) with check (ist_admin(id));

drop policy if exists mitglieder_lesen on public.mitglieder;
create policy mitglieder_lesen on public.mitglieder for select using (ist_mitglied(team_id));
drop policy if exists mitglieder_name on public.mitglieder;
create policy mitglieder_name on public.mitglieder for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists mitglieder_austreten on public.mitglieder;
create policy mitglieder_austreten on public.mitglieder for delete using (user_id = auth.uid() or ist_admin(team_id));

drop policy if exists eintraege_lesen on public.eintraege;
create policy eintraege_lesen on public.eintraege for select
  using (ist_mitglied(team_id) and (privat_von is null or privat_von = auth.uid()));
drop policy if exists eintraege_anlegen on public.eintraege;
create policy eintraege_anlegen on public.eintraege for insert
  with check (ist_mitglied(team_id) and (privat_von is null or privat_von = auth.uid()));
drop policy if exists eintraege_aendern on public.eintraege;
create policy eintraege_aendern on public.eintraege for update
  using (ist_mitglied(team_id) and (privat_von is null or privat_von = auth.uid()))
  with check (ist_mitglied(team_id) and (privat_von is null or privat_von = auth.uid()));
-- kein Löschen von Zeilen: gelöscht wird über geloescht = true, damit es alle Geräte mitbekommen

drop policy if exists profil_eigenes on public.profil;
create policy profil_eigenes on public.profil for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Supabase gibt neuen Tabellen alle Rechte; hier nur das Nötige
revoke all on public.teams, public.mitglieder, public.eintraege, public.profil from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select, update (name) on public.teams to authenticated;
grant select, delete, update (name) on public.mitglieder to authenticated;
grant select, insert, update on public.eintraege to authenticated;
grant select, insert, update on public.profil to authenticated;
grant execute on function public.team_anlegen(text, text), public.team_beitreten(text, text), public.code_erneuern(uuid) to authenticated;
revoke execute on function public.team_anlegen(text, text), public.team_beitreten(text, text), public.code_erneuern(uuid) from anon, public;
