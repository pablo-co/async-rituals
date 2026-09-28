-- 0003_onboarding.sql — onboarding por DM (hito 5)
--
--   entra al canal / Pablo guarda el canal ──▶ DM "Contestar" (solo si onboarding_invited_at es null: nunca dos veces)
--                                               └─▶ modal "Cuéntanos de ti" ──▶ facts (source onboarding) + onboarding_done
--
-- admin_activity devuelve además `invited` (activos invitados o que ya contestaron): Actividad muestra
-- "{n} de {m} contestaron «Cuéntanos de ti»" solo cuando la invitación ya salió.

alter table public.members add column onboarding_invited_at timestamptz;
comment on column public.members.onboarding_invited_at is 'Cuándo salió el DM de onboarding. Null = nunca invitado; se escribe solo si el DM llegó.';

create or replace function public.admin_activity(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team       public.teams%rowtype;
  v_today      date;
  v_week_start date;
  v_week_end   date;
  v_members    int;
  v_onboarded  int;
  v_invited    int;
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
         count(*) filter (where left_at is null and not opted_out and onboarding_done),
         count(*) filter (where left_at is null and not opted_out and (onboarding_invited_at is not null or onboarding_done))
    into v_members, v_onboarded, v_invited
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
    'invited', v_invited,
    'played_this_week', v_played,
    'games_published', v_published,
    'next_slot_date', v_next,
    'last_tick_at', v_team.last_tick_at,
    'recent_games', v_recent,
    'recent_events', v_events
  );
end $$;

-- ---------------------------------------------------------------------------
-- Privilegios: el mismo bloque que cierra 0001_init.sql.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant select on public.teams_admin, public.games_admin, public.events_admin to authenticated;
grant execute on function public.admin_activity(uuid) to authenticated;
grant execute on function public.health() to anon, authenticated;
