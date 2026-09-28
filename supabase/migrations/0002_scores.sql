-- 0002_scores.sql — puntos, rachas y recap (hito 3)
--
-- Nada se guarda aparte: todo sale de answers + games + members (design doc, "Puntos").
--
--   answers ─┐
--   games ───┴─▶ game_points ─┬─▶ week_points(team, from, to) ────────▶ top 3 del recap
--                             └─▶ member_stats(team, member, from, to) ─▶ /rituales stats (hito 7)
--   games + answers + members ─▶ member_streaks(team) ─▶ racha más larga del recap · hitos 5/10/25 al revelar
--   games + answers + facts ───▶ week_moment(team, from, to) ─▶ momento de la semana (el recap lo pide aparte:
--                                                               si falla, la línea se omite y el recap sale)
--   lo anterior ───────────────▶ recap_data(team, week_start) ─▶ lib/games/recap.ts (una ida a la base)
--
-- Solo service role: la web del admin nunca ve puntos ni rachas por persona.

-- ---------------------------------------------------------------------------
-- game_points: una fila por persona y juego revelado (nunca por velocidad)
--   adivina quién / dos verdades: 1 por jugar + 2 por acertar; protagonista +1 por engañado (máx. 5)
--   trivia: 1 + 1 por pregunta acertada + 2 por ronda perfecta · esto o aquello: 1 · puzzle: 1 + 2
--   correct_count lo escribe el tick al revelar (score() de cada plantilla); null en esto o aquello.
-- ---------------------------------------------------------------------------
create view public.game_points as
  select g.team_id, g.id as game_id, g.type, g.slot_date, a.member_id,
         (case g.type
            when 'this_or_that' then 1
            when 'trivia' then
              1 + coalesce(a.correct_count, 0)
                + case when a.correct_count is not null
                        and jsonb_typeof(g.payload -> 'questions') = 'array'
                        and a.correct_count = jsonb_array_length(g.payload -> 'questions')
                       then 2 else 0 end
            else 1 + case when coalesce(a.correct_count, 0) > 0 then 2 else 0 end
          end)::int as points
    from public.answers a
    join public.games g on g.id = a.game_id
   where g.status = 'revealed' and g.type <> 'recap'
  union all
  -- el protagonista no contesta su propio juego: su bonus sale de las respuestas equivocadas de los demás
  select g.team_id, g.id, g.type, g.slot_date, m.id,
         least(5, count(*) filter (where a.correct_count = 0))::int
    from public.games g
    join public.answers a on a.game_id = g.id
    join public.members m on m.id::text = g.payload ->> 'featured_member_id'
   where g.status = 'revealed' and g.type in ('guess_who', 'two_truths')
   group by g.id, m.id
  having count(*) filter (where a.correct_count = 0) > 0;
comment on view public.game_points is 'Puntos por persona y juego revelado (design doc, tabla Puntos). Solo service role.';

create or replace function public.week_points(p_team_id uuid, p_from date, p_to date)
returns table (member_id uuid, points int)
language sql stable security definer set search_path = public as $$
  select gp.member_id, sum(gp.points)::int
    from public.game_points gp
   where gp.team_id = p_team_id and gp.slot_date between p_from and p_to
   group by gp.member_id
$$;

-- ---------------------------------------------------------------------------
-- member_streaks (plan CEO, "Vista de rachas"): juegos seguidos contestados, contando hacia atrás desde el
-- último juego revelado en el que la persona podía jugar. Solo cuentan los `revealed` (lo saltado, pausado o
-- sin respuestas ni suma ni rompe); los juegos donde fue protagonista no cuentan. 0 si no contestó el último.
-- Una fila por miembro activo (left_at null, sin opt-out), aunque su racha sea 0.
-- ---------------------------------------------------------------------------
create or replace function public.member_streaks(p_team_id uuid)
returns table (member_id uuid, streak int)
language sql stable security definer set search_path = public as $$
  with active as (
    select m.id from public.members m
     where m.team_id = p_team_id and m.left_at is null and not m.opted_out
  ),
  eligible as (
    select ac.id as member_id,
           exists (select 1 from public.answers a where a.game_id = g.id and a.member_id = ac.id) as answered,
           row_number() over (partition by ac.id order by g.slot_date desc, g.posted_at desc nulls last, g.id) as rn
      from active ac
      join public.games g on g.team_id = p_team_id
     where g.status = 'revealed' and g.type <> 'recap'
       and (g.payload ->> 'featured_member_id') is distinct from ac.id::text
  )
  select ac.id,
         coalesce((select (coalesce(min(e.rn) filter (where not e.answered) - 1, count(*)))::int
                     from eligible e where e.member_id = ac.id), 0)
    from active ac
$$;

-- /rituales stats (hito 7): "Esta semana: {p} puntos · racha: {r} juegos seguidos · total: {t}."
create or replace function public.member_stats(p_team_id uuid, p_member_id uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'week_points', coalesce((select sum(gp.points) from public.game_points gp
                              where gp.team_id = p_team_id and gp.member_id = p_member_id
                                and gp.slot_date between p_from and p_to), 0),
    'total_points', coalesce((select sum(gp.points) from public.game_points gp
                               where gp.team_id = p_team_id and gp.member_id = p_member_id), 0),
    'streak', coalesce((select s.streak from public.member_streaks(p_team_id) s where s.member_id = p_member_id), 0)
  )
$$;

-- ---------------------------------------------------------------------------
-- week_moment (plan CEO 2): el adivina quién o dos verdades revelado de la semana que engañó a más gente.
-- Solo si el protagonista sigue activo y su hecho existe (si salió, hizo opt-out o borró sus datos, no se
-- le nombra). N = respuestas con correct_count 0, M = todas. Empate: el más antiguo. N = 0 → null.
-- ---------------------------------------------------------------------------
create or replace function public.week_moment(p_team_id uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'game_id', g.id,
           'type', g.type,
           'slot_date', g.slot_date,
           'member_id', m.id,
           'text', case when g.type = 'two_truths'
                        then g.payload -> 'statements' ->> ((g.payload ->> 'lie_index')::int)
                        else g.payload ->> 'text' end,
           'fooled', count(*) filter (where a.correct_count = 0),
           'total', count(*))
    from public.games g
    join public.answers a on a.game_id = g.id
    join public.members m on m.id::text = g.payload ->> 'featured_member_id'
    join public.facts f on f.id::text = g.payload ->> 'fact_id'
   where g.team_id = p_team_id and g.status = 'revealed'
     and g.type in ('guess_who', 'two_truths')
     and g.slot_date between p_from and p_to
     and m.left_at is null and not m.opted_out
   group by g.id, m.id
  having count(*) filter (where a.correct_count = 0) > 0
   order by count(*) filter (where a.correct_count = 0) desc, g.slot_date asc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- recap_data: todo lo del recap del viernes menos el momento (D-1A, orden fijo en lib/games/recap.ts).
-- Semana = lunes p_week_start a viernes p_week_start + 4. revealed = 0 → el recap no se publica.
-- ---------------------------------------------------------------------------
create or replace function public.recap_data(p_team_id uuid, p_week_start date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_to        date := p_week_start + 4;
  v_revealed  int;
  v_played    int;
  v_members   int;
  v_top       jsonb;
  v_streak    int;
  v_streakers jsonb;
begin
  select count(*) into v_revealed
    from public.games
   where team_id = p_team_id and type <> 'recap' and status = 'revealed'
     and slot_date between p_week_start and v_to;

  select count(*) into v_members
    from public.members
   where team_id = p_team_id and left_at is null and not opted_out;

  select count(distinct a.member_id) into v_played
    from public.answers a
    join public.games g on g.id = a.game_id
    join public.members m on m.id = a.member_id
   where g.team_id = p_team_id and g.type <> 'recap'
     and g.status in ('posted', 'revealing', 'revealed')
     and g.slot_date between p_week_start and v_to
     and m.left_at is null and not m.opted_out;

  select coalesce(jsonb_agg(jsonb_build_object('member_id', t.member_id, 'points', t.points)
                            order by t.points desc, t.display_name), '[]'::jsonb)
    into v_top
    from (select w.member_id, w.points, m.display_name
            from public.week_points(p_team_id, p_week_start, v_to) w
            join public.members m on m.id = w.member_id
           where m.left_at is null and not m.opted_out and w.points > 0
           order by w.points desc, m.display_name
           limit 10) t;

  with s as (select * from public.member_streaks(p_team_id))
  select coalesce(max(s.streak), 0),
         coalesce(jsonb_agg(s.member_id) filter (where s.streak = (select max(streak) from s) and s.streak > 0), '[]'::jsonb)
    into v_streak, v_streakers
    from s;

  return jsonb_build_object(
    'week_start', p_week_start,
    'week_end', v_to,
    'revealed', v_revealed,
    'played', v_played,
    'members', v_members,
    'top', v_top,
    'streak', v_streak,
    'streak_member_ids', v_streakers
  );
end $$;

-- ---------------------------------------------------------------------------
-- Privilegios: el mismo bloque que cierra 0001_init.sql (Supabase concede ALL por default a anon y
-- authenticated sobre cada vista y función nueva). La web solo entra por las vistas *_admin y admin_activity.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant select on public.teams_admin, public.games_admin, public.events_admin to authenticated;
grant execute on function public.admin_activity(uuid) to authenticated;
grant execute on function public.health() to anon, authenticated;
