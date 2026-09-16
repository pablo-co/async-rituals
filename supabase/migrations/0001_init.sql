-- 0001_init.sql — async-rituals, schema v1 (hito 0)
--
-- Relaciones:
--
--   auth.users ─1──1─ teams ─1──*─ members ─1──*─ facts
--                       │
--                       ├─1──*─ games ─1──*─ answers ─*──1─ members
--                       │
--                       └─1──*─ events
--
-- Quién lee qué:
--   · rol `authenticated` (la web del admin): SOLO las vistas *_admin y la función
--     admin_activity, todas filtradas por auth.uid(). Nunca answers, facts, members
--     ni games.payload.
--   · rol `service_role` (tick, fill, handlers de Slack, scripts): las tablas, con RLS
--     saltada; el token del bot solo vía get_bot_token().
--
-- Nota Supabase: los privilegios por default de este proyecto conceden ALL a anon y
-- authenticated sobre cada tabla nueva. Cada migración que cree tablas o vistas
-- debe terminar con el mismo bloque de REVOKE/GRANT que cierra este archivo.

create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.game_type as enum ('guess_who', 'two_truths', 'trivia', 'this_or_that', 'puzzle', 'recap');
create type public.game_status as enum ('queued', 'posting', 'posted', 'revealing', 'revealed', 'vetoed', 'skipped');
create type public.skip_reason as enum (
  'out_of_window', 'paused', 'no_answers', 'featured_inactive',
  'template_error', 'channel_error', 'sample', 'post_uncertain'
);
create type public.fact_kind as enum ('fact', 'two_truths');
create type public.fact_source as enum ('onboarding', 'seed', 'command');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table public.teams (
  id                      uuid primary key default gen_random_uuid(),
  slack_team_id           text not null unique,
  slack_team_name         text,
  bot_user_id             text,
  bot_token_secret_id     uuid,                                    -- id en vault.secrets (E-1D)
  admin_user_id           uuid not null references auth.users (id) on delete restrict,
  admin_slack_user_id     text,
  channel_id              text,
  channel_name            text,
  welcomed_channel_id     text,                                    -- se escribe solo al saludar con éxito
  cadence_per_week        int  not null default 3 check (cadence_per_week between 1 and 5),
  timezone                text not null default 'America/Mexico_City',
  language                text not null default 'es',
  paused_until            date,                                    -- inclusivo, en la zona del equipo
  material_alert_sent_at  timestamptz,                             -- tope del DM al admin (7 días)
  channel_error_at        timestamptz,
  disconnected_at         timestamptz,
  last_tick_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
comment on table public.teams is 'Un workspace de Slack conectado por OAuth. Una cuenta de admin por equipo en el MVP.';

-- Un admin administra un solo equipo en el MVP (simplifica el aterrizaje tras login).
create unique index teams_admin_user_idx on public.teams (admin_user_id);

-- Zona IANA válida (ET1): `at time zone` truena con una zona desconocida.
create or replace function public.validate_team()
returns trigger language plpgsql as $$
begin
  perform now() at time zone new.timezone;
  new.updated_at := now();
  return new;
end $$;
create trigger teams_validate before insert or update on public.teams
  for each row execute function public.validate_team();

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table public.members (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams (id) on delete cascade,
  slack_user_id    text not null,
  display_name     text not null,
  onboarding_done  boolean not null default false,
  opted_out        boolean not null default false,
  left_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (team_id, slack_user_id)
);
comment on table public.members is 'Personas del canal. Nunca bots ni cuentas desactivadas. Al salir: left_at; sus hechos se retiran.';
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- facts
-- ---------------------------------------------------------------------------
create table public.facts (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  kind        public.fact_kind not null,
  -- fact: {question_key, text} · two_truths: {statements: [3], lie_index}
  payload     jsonb not null,
  source      public.fact_source not null default 'onboarding',
  used_at     timestamptz,                                         -- se marca al llegar el juego a posted
  retired     boolean not null default false,
  created_at  timestamptz not null default now()
);
comment on table public.facts is 'Material de adivina-quién y dos verdades. Un hecho usado nunca se reutiliza.';
create index facts_fresh_idx on public.facts (member_id, kind) where used_at is null and not retired;

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table public.games (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams (id) on delete cascade,
  type                public.game_type not null,
  status              public.game_status not null default 'queued',
  skip_reason         public.skip_reason,
  -- contenido por plantilla; `preview` es el único campo que ve el admin antes del reveal
  payload             jsonb not null default '{}'::jsonb,
  slot_date           date not null,                                -- día local del equipo
  scheduled_for       timestamptz not null,                         -- 10:00 local (recap: 18:00)
  post_attempted_at   timestamptz,                                  -- antes de chat.postMessage (E-1B)
  posted_at           timestamptz,
  slack_channel_id    text,
  slack_ts            text,
  revealed_thread_ts  text,                                         -- evita hilo duplicado al reintentar
  content_hash        text,
  is_sample           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.games is 'Máquina de estados: queued → posting → posted → revealing → revealed; ramas vetoed / skipped. Ver app/api/tick/route.ts.';
create trigger games_updated_at before update on public.games
  for each row execute function public.set_updated_at();

-- Un slot por día por equipo (y un recap por viernes). vetoed/skipped liberan el slot.
create unique index games_slot_game_idx on public.games (team_id, slot_date)
  where type <> 'recap' and status not in ('vetoed', 'skipped');
create unique index games_slot_recap_idx on public.games (team_id, slot_date)
  where type = 'recap' and status not in ('vetoed', 'skipped');
create index games_team_status_idx on public.games (team_id, status, scheduled_for);
create index games_content_hash_idx on public.games (team_id, content_hash) where content_hash is not null;

-- ---------------------------------------------------------------------------
-- answers
-- ---------------------------------------------------------------------------
create table public.answers (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games (id) on delete cascade,
  member_id      uuid not null references public.members (id) on delete cascade,
  -- {choice} · trivia: {q1: 'b', ...} · puzzle: {text}
  value          jsonb not null,
  correct_count  int,                                               -- se calcula al reveal; null en esto-o-aquello
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (game_id, member_id)
);
comment on table public.answers is 'Una respuesta por persona y juego. Privada: la web solo ve agregados.';
create trigger answers_updated_at before update on public.answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events (append-only, retención 90 días vía prune_events)
-- ---------------------------------------------------------------------------
create table public.events (
  id          bigint generated always as identity primary key,
  team_id     uuid references public.teams (id) on delete cascade,
  run_id      uuid,
  kind        text not null,
  game_id     uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.events is 'Bitácora en lenguaje de máquina; lib/events/labels.ts la traduce. Nunca guarda tokens ni nombres de miembros.';
create index events_team_created_idx on public.events (team_id, created_at desc);
create index events_created_idx on public.events (created_at);

create or replace function public.prune_events()
returns int language sql security definer set search_path = public as $$
  with gone as (
    delete from public.events where created_at < now() - interval '90 days' returning 1
  )
  select count(*)::int from gone;
$$;

-- ---------------------------------------------------------------------------
-- Vistas para el admin (filtradas por auth.uid(); sin payload, sin token)
-- ---------------------------------------------------------------------------
create view public.teams_admin as
  select id, slack_team_id, slack_team_name, bot_user_id, admin_slack_user_id,
         channel_id, channel_name, welcomed_channel_id, cadence_per_week, timezone, language,
         paused_until, channel_error_at, disconnected_at, last_tick_at, created_at, updated_at
  from public.teams
  where admin_user_id = auth.uid();

create view public.games_admin as
  select g.id, g.team_id, g.type, g.status, g.skip_reason, g.slot_date, g.scheduled_for,
         g.is_sample, g.created_at,
         -- adivina-quién y dos verdades nunca exponen nada antes del reveal
         case when g.type in ('trivia', 'this_or_that', 'puzzle', 'recap')
              then g.payload ->> 'preview' end as preview
  from public.games g
  join public.teams t on t.id = g.team_id
  where t.admin_user_id = auth.uid();

create view public.events_admin as
  select e.id, e.team_id, e.run_id, e.kind, e.game_id, e.detail, e.created_at
  from public.events e
  join public.teams t on t.id = e.team_id
  where t.admin_user_id = auth.uid();

-- ---------------------------------------------------------------------------
-- admin_activity: agregados de Actividad (nunca por persona)
-- ---------------------------------------------------------------------------
create or replace function public.admin_activity(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team       public.teams%rowtype;
  v_today      date;
  v_week_start date;
  v_week_end   date;
  v_members    int;
  v_onboarded  int;
  v_played     int;
  v_published  int;
  v_next       date;
  v_recent     jsonb;
  v_events     jsonb;
begin
  select * into v_team from public.teams where id = p_team_id;
  if not found then
    return null;
  end if;
  if auth.uid() is distinct from v_team.admin_user_id and auth.role() is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_today      := (now() at time zone v_team.timezone)::date;
  v_week_start := v_today - (extract(isodow from v_today)::int - 1);
  v_week_end   := v_week_start + 6;

  select count(*) filter (where left_at is null and not opted_out),
         count(*) filter (where left_at is null and not opted_out and onboarding_done)
    into v_members, v_onboarded
    from public.members where team_id = p_team_id;

  select count(distinct a.member_id) into v_played
    from public.answers a
    join public.games g on g.id = a.game_id
   where g.team_id = p_team_id and g.type <> 'recap'
     and g.slot_date between v_week_start and v_week_end
     and g.status in ('posted', 'revealing', 'revealed');

  select count(*) into v_published
    from public.games
   where team_id = p_team_id and type <> 'recap' and status in ('posted', 'revealing', 'revealed');

  select min(slot_date) into v_next
    from public.games
   where team_id = p_team_id and status = 'queued' and type <> 'recap' and slot_date >= v_today;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'type', g.type, 'slot_date', g.slot_date, 'status', g.status,
           'skip_reason', g.skip_reason,
           'answers', (select count(*) from public.answers a where a.game_id = g.id),
           'correct', (select count(*) from public.answers a where a.game_id = g.id and a.correct_count > 0)
         ) order by g.slot_date desc), '[]'::jsonb)
    into v_recent
    from (select * from public.games
           where team_id = p_team_id and type <> 'recap'
             and status in ('posted', 'revealing', 'revealed', 'skipped')
           order by slot_date desc limit 10) g;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'detail', e.detail, 'created_at', e.created_at
         ) order by e.created_at desc), '[]'::jsonb)
    into v_events
    from (select * from public.events where team_id = p_team_id order by created_at desc limit 20) e;

  return jsonb_build_object(
    'members', v_members,
    'onboarded', v_onboarded,
    'played_this_week', v_played,
    'games_published', v_published,
    'next_slot_date', v_next,
    'last_tick_at', v_team.last_tick_at,
    'recent_games', v_recent,
    'recent_events', v_events
  );
end $$;

-- ---------------------------------------------------------------------------
-- Token del bot en Vault (E-1D). Solo service role.
-- ---------------------------------------------------------------------------
create or replace function public.set_bot_token(p_team_id uuid, p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_secret_id uuid;
  v_slack_team_id text;
begin
  select bot_token_secret_id, slack_team_id into v_secret_id, v_slack_team_id
    from public.teams where id = p_team_id;
  if not found then
    raise exception 'team % not found', p_team_id;
  end if;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_token, 'slack-bot-' || v_slack_team_id, 'Slack bot token');
    update public.teams set bot_token_secret_id = v_secret_id where id = p_team_id;
  else
    perform vault.update_secret(v_secret_id, p_token);
  end if;
  return v_secret_id;
end $$;

create or replace function public.get_bot_token(p_team_id uuid)
returns text language sql security definer set search_path = public as $$
  select s.decrypted_secret
    from public.teams t
    join vault.decrypted_secrets s on s.id = t.bot_token_secret_id
   where t.id = p_team_id;
$$;

-- ---------------------------------------------------------------------------
-- Barrido del tick: lo vencido, lo atascado, lo pausado y la muestra (E-1B, D-2D)
-- Devuelve las filas que marcó skipped (para eventos y DM al admin).
-- ---------------------------------------------------------------------------
create or replace function public.sweep_games(p_team_id uuid, p_now timestamptz default now())
returns setof public.games language plpgsql security definer set search_path = public as $$
declare
  v_team public.teams%rowtype;
begin
  select * into v_team from public.teams where id = p_team_id;
  if not found then
    return;
  end if;

  -- posting atascado (> 15 min) con intento incierto: nunca se re-publica
  return query
    update public.games g
       set status = 'skipped', skip_reason = 'post_uncertain', updated_at = p_now
     where g.team_id = p_team_id and g.status = 'posting'
       and g.updated_at < p_now - interval '15 minutes'
       and g.post_attempted_at is not null and g.slack_ts is null
    returning g.*;

  -- posting atascado que nunca llegó a llamar a Slack: vuelve a la cola
  update public.games g
     set status = 'queued', updated_at = p_now
   where g.team_id = p_team_id and g.status = 'posting'
     and g.updated_at < p_now - interval '15 minutes'
     and g.post_attempted_at is null;

  -- contenido de muestra: jamás al canal
  return query
    update public.games g
       set status = 'skipped', skip_reason = 'sample', updated_at = p_now
     where g.team_id = p_team_id and g.status = 'queued' and g.is_sample
       and g.scheduled_for <= p_now
    returning g.*;

  -- slots dentro de la pausa que ya vencieron
  return query
    update public.games g
       set status = 'skipped', skip_reason = 'paused', updated_at = p_now
     where g.team_id = p_team_id and g.status = 'queued'
       and v_team.paused_until is not null and g.slot_date <= v_team.paused_until
       and g.scheduled_for <= p_now
    returning g.*;

  -- fuera de la ventana de 2 horas
  return query
    update public.games g
       set status = 'skipped', skip_reason = 'out_of_window', updated_at = p_now
     where g.team_id = p_team_id and g.status = 'queued'
       and g.scheduled_for < p_now - interval '2 hours'
    returning g.*;
end $$;

-- ---------------------------------------------------------------------------
-- Reclamo atómico (4A + plan CEO 3 + E-1A). p_kind: 'post' | 'reveal'.
-- 'post': queued → posting dentro de la ventana [now-2h, now], sin pausa, equipo conectado.
--         Si la pausa ya venció, la limpia y marca payload.resumed = true en lo reclamado.
-- 'reveal': posted → revealing con posted_at ≥ 4 h y hora local ≥ 18:00; re-reclama
--         revealing atascado (> 15 min): chat.update es idempotente.
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_games(p_team_id uuid, p_kind text, p_now timestamptz default now())
returns setof public.games language plpgsql security definer set search_path = public as $$
declare
  v_team    public.teams%rowtype;
  v_today   date;
  v_resumed boolean := false;
begin
  -- serializa los reclamos de un mismo equipo
  select * into v_team from public.teams where id = p_team_id for update;
  if not found or v_team.disconnected_at is not null then
    return;
  end if;
  v_today := (p_now at time zone v_team.timezone)::date;

  if p_kind = 'post' then
    if v_team.paused_until is not null and v_team.paused_until < v_today then
      update public.teams set paused_until = null where id = p_team_id;
      v_resumed := true;
    end if;
    return query
      update public.games g
         set status = 'posting',
             updated_at = p_now,
             payload = case when v_resumed then g.payload || '{"resumed": true}'::jsonb else g.payload end
       where g.id in (
         select id from public.games
          where team_id = p_team_id and status = 'queued' and not is_sample
            and scheduled_for <= p_now and scheduled_for >= p_now - interval '2 hours'
            and (v_team.paused_until is null or slot_date > v_team.paused_until)
          order by scheduled_for
          for update skip locked)
      returning g.*;

  elsif p_kind = 'reveal' then
    return query
      update public.games g
         set status = 'revealing', updated_at = p_now
       where g.id in (
         select id from public.games
          where team_id = p_team_id and type <> 'recap'
            and (
              (status = 'posted' and posted_at <= p_now - interval '4 hours'
                 and (p_now at time zone v_team.timezone)::time >= time '18:00')
              or (status = 'revealing' and updated_at < p_now - interval '15 minutes')
            )
          order by posted_at
          for update skip locked)
      returning g.*;

  else
    raise exception 'unknown kind %', p_kind;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- submit_answer (4A): acepta solo mientras el juego está posted. Atómica.
-- ---------------------------------------------------------------------------
create or replace function public.submit_answer(p_game_id uuid, p_member_id uuid, p_value jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  -- bloquea la fila del juego: si el tick la está pasando a revealing, esperamos y re-evaluamos
  perform 1 from public.games where id = p_game_id and status = 'posted' for share;
  if not found then
    return false;
  end if;
  insert into public.answers (game_id, member_id, value)
  values (p_game_id, p_member_id, p_value)
  on conflict (game_id, member_id) do update
    set value = excluded.value, updated_at = now();
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- health(): la única función que puede llamar cualquiera. Prueba que la base contesta.
-- ---------------------------------------------------------------------------
create or replace function public.health()
returns timestamptz language sql stable as $$
  select now();
$$;

-- ---------------------------------------------------------------------------
-- RLS: encendido en todo. Sin políticas = nadie salvo service_role.
-- ---------------------------------------------------------------------------
alter table public.teams   enable row level security;
alter table public.members enable row level security;
alter table public.facts   enable row level security;
alter table public.games   enable row level security;
alter table public.answers enable row level security;
alter table public.events  enable row level security;

-- ---------------------------------------------------------------------------
-- Privilegios (ver nota al inicio). La web solo entra por las vistas y admin_activity.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant select on public.teams_admin, public.games_admin, public.events_admin to authenticated;
grant execute on function public.admin_activity(uuid) to authenticated;
grant execute on function public.health() to anon, authenticated;
