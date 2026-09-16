import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localParts } from "@/lib/time";

/**
 * In-memory stand-in for the Supabase query builder, just enough for the tick, the fill and the
 * answer handler: from().select/update/insert/delete + eq/neq/in/is/gte/gt/lte/lt/order/limit +
 * single/maybeSingle + head counts + one-level embedded relations ("members!inner(...)") and
 * dotted filters ("members.team_id"). rpc() dispatches to JS functions registered in `rpcs`;
 * `defaultRpcs` mimics the SQL of 0001_init.sql closely enough for unit tests. The real SQL is
 * exercised by scripts/smoke.ts, not here.
 */
export type Row = Record<string, unknown>;
type Op = "eq" | "neq" | "in" | "is" | "gte" | "gt" | "lte" | "lt";
type Filter = { col: string; op: Op; value: unknown };
type Result = { data: unknown; error: { message: string; code: string } | null; count: number | null };

export type FakeRpc = (args: Record<string, unknown>, db: FakeDb) => unknown;

/** Foreign keys the embed syntax can follow: facts.member_id → members, games.team_id → teams, … */
const RELATIONS: Record<string, Record<string, { table: string; key: string }>> = {
  facts: { members: { table: "members", key: "member_id" } },
  games: { teams: { table: "teams", key: "team_id" } },
  members: { teams: { table: "teams", key: "team_id" } },
  answers: { games: { table: "games", key: "game_id" }, members: { table: "members", key: "member_id" } },
};

/** Column defaults from 0001_init.sql that the code relies on when it inserts partial rows. */
const DEFAULTS: Record<string, Row> = {
  teams: { paused_until: null, material_alert_sent_at: null, channel_error_at: null, disconnected_at: null, last_tick_at: null },
  members: { onboarding_done: false, opted_out: false, left_at: null },
  facts: { used_at: null, retired: false, source: "seed" },
  games: {
    status: "queued",
    skip_reason: null,
    payload: {},
    post_attempted_at: null,
    posted_at: null,
    slack_channel_id: null,
    slack_ts: null,
    revealed_thread_ts: null,
    content_hash: null,
    is_sample: false,
  },
  answers: { correct_count: null },
  events: { team_id: null, run_id: null, game_id: null, detail: {} },
};

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, FakeRpc>;
  /** Every write, in order, so tests can assert "X happened before Y". */
  writes: { table: string; op: "update" | "insert" | "delete"; values?: unknown; at: number }[] = [];
  private seq = 0;

  constructor(seed: Record<string, object[]> = {}, rpcs: Record<string, FakeRpc> = defaultRpcs) {
    for (const [table, rows] of Object.entries(seed)) this.add(table, ...rows);
    this.rpcs = { ...rpcs };
  }

  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  /** Seeds full rows (typed fixtures welcome); defaults fill whatever the fixture left out. */
  add(table: string, ...rows: object[]): void {
    for (const row of rows) this.table(table).push({ ...(DEFAULTS[table] ?? {}), ...(row as Row) });
  }

  find<T extends object = Row>(table: string, id: string): T {
    const row = this.table(table).find((r) => r.id === id);
    if (!row) throw new Error(`${table}/${id} no existe en la base falsa`);
    return row as unknown as T;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<Result> {
    const fn = this.rpcs[name];
    if (!fn) return { data: null, error: { message: `función ${name} no registrada`, code: "42883" }, count: null };
    try {
      return { data: await fn(args, this), error: null, count: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : String(error), code: "P0001" }, count: null };
    }
  }

  nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  /** What the code under test receives. */
  client(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  events(kind?: string): Row[] {
    return this.table("events").filter((e) => !kind || e.kind === kind);
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "update" | "insert" | "delete" = "select";
  private filters: Filter[] = [];
  private values: Row | Row[] | null = null;
  private head = false;
  private countMode = false;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private columns = "*";

  constructor(
    private readonly db: FakeDb,
    private readonly tableName: string,
  ) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }): this {
    if (this.op === "select") this.columns = columns;
    this.head = Boolean(opts?.head);
    this.countMode = Boolean(opts?.count);
    return this;
  }
  update(values: Row): this {
    this.op = "update";
    this.values = values;
    return this;
  }
  insert(values: Row | Row[]): this {
    this.op = "insert";
    this.values = values;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  private where(op: Op, col: string, value: unknown): this {
    this.filters.push({ col, op, value });
    return this;
  }
  eq(col: string, value: unknown) {
    return this.where("eq", col, value);
  }
  neq(col: string, value: unknown) {
    return this.where("neq", col, value);
  }
  in(col: string, value: unknown[]) {
    return this.where("in", col, value);
  }
  is(col: string, value: unknown) {
    return this.where("is", col, value);
  }
  gte(col: string, value: unknown) {
    return this.where("gte", col, value);
  }
  gt(col: string, value: unknown) {
    return this.where("gt", col, value);
  }
  lte(col: string, value: unknown) {
    return this.where("lte", col, value);
  }
  lt(col: string, value: unknown) {
    return this.where("lt", col, value);
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onFulfilled ?? undefined, onRejected ?? undefined);
  }

  private related(row: Row, relation: string): Row | null {
    const rel = RELATIONS[this.tableName]?.[relation];
    if (!rel) throw new Error(`relación ${this.tableName}.${relation} no definida en la base falsa`);
    return this.db.table(rel.table).find((r) => r.id === row[rel.key]) ?? null;
  }

  private valueOf(row: Row, col: string): { found: boolean; value: unknown } {
    if (!col.includes(".")) return { found: true, value: row[col] };
    const [relation, field] = col.split(".", 2);
    const related = this.related(row, relation);
    return related ? { found: true, value: related[field] } : { found: false, value: undefined };
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const { found, value } = this.valueOf(row, f.col);
      if (!found) return false;
      switch (f.op) {
        case "eq":
          return value === f.value;
        case "neq":
          return value !== f.value;
        case "in":
          return (f.value as unknown[]).includes(value);
        case "is":
          return f.value === null ? value === null || value === undefined : value === f.value;
        case "gte":
          return compare(value, f.value) >= 0;
        case "gt":
          return compare(value, f.value) > 0;
        case "lte":
          return compare(value, f.value) <= 0;
        case "lt":
          return compare(value, f.value) < 0;
      }
    });
  }

  private project(row: Row): Row {
    if (this.columns.trim() === "*") return { ...row };
    const out: Row = {};
    for (const piece of splitColumns(this.columns)) {
      const embed = piece.match(/^(\w+)(?:!\w+)?\((.*)\)$/);
      if (embed) {
        const related = this.related(row, embed[1]);
        out[embed[1]] = related ? { ...related } : null;
      } else {
        out[piece] = row[piece];
      }
    }
    return out;
  }

  private run(): Result {
    const rows = this.db.table(this.tableName);
    const matched = rows.filter((r) => this.matches(r));
    const nowIso = new Date().toISOString();

    if (this.op === "select") {
      let out = matched.map((r) => this.project(r));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = [...out].sort((a, b) => compare(a[col], b[col]) * (asc ? 1 : -1));
      }
      if (this.limitN !== null) out = out.slice(0, this.limitN);
      const count = this.countMode ? matched.length : null;
      if (this.head) return { data: null, error: null, count };
      if (this.mode === "single") {
        if (out.length !== 1) return { data: null, error: { message: `esperaba 1 fila, hay ${out.length}`, code: "PGRST116" }, count };
        return { data: out[0], error: null, count };
      }
      if (this.mode === "maybeSingle") {
        if (out.length > 1) return { data: null, error: { message: `esperaba ≤ 1 fila, hay ${out.length}`, code: "PGRST116" }, count };
        return { data: out[0] ?? null, error: null, count };
      }
      return { data: out, error: null, count };
    }

    if (this.op === "update") {
      const values = this.values as Row;
      for (const row of matched) Object.assign(row, values, { updated_at: nowIso });
      this.db.writes.push({ table: this.tableName, op: "update", values, at: this.db.nextSeq() });
      return { data: matched.map((r) => ({ ...r })), error: null, count: null };
    }

    if (this.op === "insert") {
      const list = Array.isArray(this.values) ? this.values : [this.values as Row];
      for (const values of list) {
        const row: Row = { id: randomUUID(), created_at: nowIso, updated_at: nowIso, ...(DEFAULTS[this.tableName] ?? {}), ...values };
        const clash = uniqueClash(this.tableName, rows, row);
        if (clash) return { data: null, error: { message: clash, code: "23505" }, count: null };
        rows.push(row);
        this.db.writes.push({ table: this.tableName, op: "insert", values: row, at: this.db.nextSeq() });
      }
      return { data: null, error: null, count: null };
    }

    for (const row of matched) rows.splice(rows.indexOf(row), 1);
    this.db.writes.push({ table: this.tableName, op: "delete", at: this.db.nextSeq() });
    return { data: null, error: null, count: null };
  }
}

/** Mirrors the partial unique indexes of 0001_init.sql that the code relies on (23505 handling). */
function uniqueClash(table: string, rows: Row[], row: Row): string | null {
  if (table === "games" && row.type !== "recap" && !["vetoed", "skipped"].includes(String(row.status ?? "queued"))) {
    const dup = rows.find(
      (r) => r.team_id === row.team_id && r.slot_date === row.slot_date && r.type !== "recap" && !["vetoed", "skipped"].includes(String(r.status)),
    );
    if (dup) return "duplicate key value violates unique constraint games_slot_game_idx";
  }
  if (table === "answers") {
    const dup = rows.find((r) => r.game_id === row.game_id && r.member_id === row.member_id);
    if (dup) return "duplicate key value violates unique constraint answers_game_id_member_id_key";
  }
  return null;
}

function splitColumns(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: unknown) => new Date(String(value)).getTime();

/**
 * JS versions of the SQL functions the tick calls. They follow 0001_init.sql (windows, statuses,
 * pause, local 18:00 rule) but hold no locks: concurrency is the smoke script's job.
 */
export const defaultRpcs: Record<string, FakeRpc> = {
  sweep_games: ({ p_team_id, p_now }, db) => {
    const now = ms(p_now);
    const team = db.find("teams", String(p_team_id));
    const swept: Row[] = [];
    for (const g of db.table("games")) {
      if (g.team_id !== p_team_id) continue;
      const stale = g.status === "posting" && ms(g.updated_at) < now - 15 * MINUTE;
      if (stale && g.post_attempted_at && !g.slack_ts) {
        Object.assign(g, { status: "skipped", skip_reason: "post_uncertain", updated_at: iso(now) });
        swept.push({ ...g });
      } else if (stale && !g.post_attempted_at) {
        Object.assign(g, { status: "queued", updated_at: iso(now) });
      } else if (g.status === "queued" && g.is_sample && ms(g.scheduled_for) <= now) {
        Object.assign(g, { status: "skipped", skip_reason: "sample", updated_at: iso(now) });
        swept.push({ ...g });
      } else if (
        g.status === "queued" &&
        team.paused_until &&
        String(g.slot_date) <= String(team.paused_until) &&
        ms(g.scheduled_for) <= now
      ) {
        Object.assign(g, { status: "skipped", skip_reason: "paused", updated_at: iso(now) });
        swept.push({ ...g });
      } else if (g.status === "queued" && ms(g.scheduled_for) < now - 2 * HOUR) {
        Object.assign(g, { status: "skipped", skip_reason: "out_of_window", updated_at: iso(now) });
        swept.push({ ...g });
      }
    }
    return swept;
  },

  claim_due_games: ({ p_team_id, p_kind, p_now }, db) => {
    const now = ms(p_now);
    const team = db.find("teams", String(p_team_id));
    if (team.disconnected_at) return [];
    const local = localParts(new Date(now), String(team.timezone));
    const claimed: Row[] = [];
    if (p_kind === "post") {
      let resumed = false;
      if (team.paused_until && String(team.paused_until) < local.date) {
        team.paused_until = null;
        resumed = true;
      }
      for (const g of db.table("games")) {
        if (g.team_id !== p_team_id || g.status !== "queued" || g.is_sample) continue;
        const at = ms(g.scheduled_for);
        if (at > now || at < now - 2 * HOUR) continue;
        if (team.paused_until && String(g.slot_date) <= String(team.paused_until)) continue;
        Object.assign(g, {
          status: "posting",
          updated_at: iso(now),
          payload: resumed ? { ...(g.payload as Row), resumed: true } : g.payload,
        });
        claimed.push({ ...g });
      }
      return claimed.sort((a, b) => compare(a.scheduled_for, b.scheduled_for));
    }
    if (p_kind === "reveal") {
      for (const g of db.table("games")) {
        if (g.team_id !== p_team_id || g.type === "recap") continue;
        const due = g.status === "posted" && ms(g.posted_at) <= now - 4 * HOUR && local.hour >= 18;
        const stuck = g.status === "revealing" && ms(g.updated_at) < now - 15 * MINUTE;
        if (!due && !stuck) continue;
        Object.assign(g, { status: "revealing", updated_at: iso(now) });
        claimed.push({ ...g });
      }
      return claimed.sort((a, b) => compare(a.posted_at, b.posted_at));
    }
    throw new Error(`unknown kind ${String(p_kind)}`);
  },

  submit_answer: ({ p_game_id, p_member_id, p_value }, db) => {
    const game = db.table("games").find((g) => g.id === p_game_id);
    if (!game || game.status !== "posted") return false;
    const existing = db.table("answers").find((a) => a.game_id === p_game_id && a.member_id === p_member_id);
    const nowIso = new Date().toISOString();
    if (existing) Object.assign(existing, { value: p_value, updated_at: nowIso });
    else
      db.table("answers").push({
        id: randomUUID(),
        game_id: p_game_id,
        member_id: p_member_id,
        value: p_value,
        correct_count: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    return true;
  },

  get_bot_token: () => "xoxb-fake",
};
