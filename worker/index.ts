import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type {
  ChordQuality,
  SessionUser,
  Song,
  SongSummary,
} from "../shared/types";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ALLOWED_EMAILS: string;
}

type Variables = { user: SessionUser | null };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const qualitySchema = z.enum([
  "major",
  "minor",
  "dominant7",
  "diminished",
  "augmented",
  "half_diminished7",
]);
const blockSchema = z.object({
  id: z.string().min(1),
  startBeat: z.number().int().min(0),
  duration: z.number().int().min(1).max(4),
  degree: z.number().int().min(0).max(11).nullable(),
  quality: qualitySchema.nullable(),
  bassDegree: z.number().int().min(0).max(11).nullable(),
});
const songUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bpm: z.number().int().min(20).max(400),
  initialKey: z.number().int().min(0).max(11),
  sourceUrl: z.string().url().max(2000).nullable().or(z.literal("")),
  status: z.enum(["draft", "published"]),
  version: z.number().int().positive(),
  blocks: z.array(blockSchema).min(1),
  keyChanges: z.array(
    z.object({
      id: z.string().min(1),
      startBeat: z.number().int().positive(),
      keyPitchClass: z.number().int().min(0).max(11),
    }),
  ),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
  progressions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(80),
      startBeat: z.number().int().min(0),
      endBeat: z.number().int().positive(),
    }).refine((value) => value.endBeat > value.startBeat),
  ),
});

app.use("/api/*", async (c, next) => {
  c.set("user", await readSession(c.env, getCookie(c, "session")));
  await next();
});

app.get("/auth/google", (c) => {
  const state = crypto.randomUUID();
  setCookie(c, "oauth_state", state, cookieOptions(c.req.url, 600));
  const callback = `${new URL(c.req.url).origin}/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callback,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
});

app.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || state !== getCookie(c, "oauth_state")) {
    return c.text("Invalid OAuth state", 400);
  }
  deleteCookie(c, "oauth_state", { path: "/" });
  const callback = `${new URL(c.req.url).origin}/auth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callback,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return c.text("Google authentication failed", 401);
  const tokens = await tokenResponse.json<{ access_token: string }>();
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) return c.text("Google profile request failed", 401);
  const profile = await profileResponse.json<{
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
  }>();
  if (!profile.email_verified) return c.text("Verified email required", 403);
  const allowed = allowedEmails(c.env).has(profile.email.toLowerCase());
  const user: SessionUser = {
    id: profile.sub,
    email: profile.email,
    displayName: profile.name ?? profile.email,
    avatarUrl: profile.picture ?? null,
    allowed,
  };
  if (allowed) {
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, display_name, avatar_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(user.id, user.email, user.displayName, user.avatarUrl).run();
  }
  setCookie(c, "session", await createSession(c.env, user), cookieOptions(c.req.url, 60 * 60 * 24 * 14));
  return c.redirect("/");
});

app.post("/auth/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/session", (c) => c.json({ user: c.get("user") }));

app.get("/api/suggestions", async (c) => {
  const [tags, progressions] = await Promise.all([
    c.env.DB.prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE").all<{ name: string }>(),
    c.env.DB.prepare("SELECT name FROM progression_names ORDER BY name COLLATE NOCASE").all<{ name: string }>(),
  ]);
  return c.json({
    tags: tags.results.map((item) => item.name),
    progressions: progressions.results.map((item) => item.name),
  });
});

app.get("/api/songs", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const mine = c.req.query("mine") === "1";
  const user = c.get("user");
  if (mine && (!user || !user.allowed)) return c.json({ error: "Forbidden" }, 403);
  const where = mine ? "s.created_by_user_id = ?" : "s.status = 'published'";
  const binding = mine ? user!.id : undefined;
  const countQuery = c.env.DB.prepare(`SELECT COUNT(*) AS count FROM songs s WHERE ${where}`);
  const rowsQuery = c.env.DB.prepare(
    `SELECT s.*, u.display_name AS creator_name,
      COALESCE(group_concat(DISTINCT t.name), '') AS tag_names
     FROM songs s
     JOIN users u ON u.id = s.created_by_user_id
     LEFT JOIN song_tags st ON st.song_id = s.id
     LEFT JOIN tags t ON t.id = st.tag_id
     WHERE ${where}
     GROUP BY s.id
     ORDER BY ${mine ? "s.updated_at" : "s.published_at"} DESC
     LIMIT 12 OFFSET ?`,
  );
  const [count, rows] = await Promise.all([
    binding ? countQuery.bind(binding).first<{ count: number }>() : countQuery.first<{ count: number }>(),
    binding
      ? rowsQuery.bind(binding, (page - 1) * 12).all<Record<string, unknown>>()
      : rowsQuery.bind((page - 1) * 12).all<Record<string, unknown>>(),
  ]);
  return c.json({
    items: rows.results.map(mapSummary),
    page,
    totalPages: Math.max(1, Math.ceil(Number(count?.count ?? 0) / 12)),
  });
});

app.post("/api/songs", async (c) => {
  const user = requireAllowed(c.get("user"));
  if (user instanceof Response) return user;
  const id = crypto.randomUUID();
  const slug = `${new Date().toISOString().slice(0, 10)}-${id.slice(0, 8)}`;
  const blockId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO songs (id, slug, title, created_by_user_id)
       VALUES (?, ?, '無題のコードメモ', ?)`,
    ).bind(id, slug, user.id),
    c.env.DB.prepare(
      `INSERT INTO chord_blocks (id, song_id, start_beat, duration)
       VALUES (?, ?, 0, 4)`,
    ).bind(blockId, id),
  ]);
  return c.json({ slug }, 201);
});

app.get("/api/songs/:slug", async (c) => {
  const song = await loadSong(c.env.DB, c.req.param("slug"), c.get("user"));
  if (!song) return c.json({ error: "Not found" }, 404);
  return c.json(song);
});

app.put("/api/songs/:id", async (c) => {
  const user = requireAllowed(c.get("user"));
  if (user instanceof Response) return user;
  const parsed = songUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid data", details: parsed.error.flatten() }, 400);
  const data = parsed.data;
  const invalid = validateTimeline(data.blocks);
  if (invalid) return c.json({ error: invalid }, 400);
  const current = await c.env.DB.prepare(
    "SELECT created_by_user_id, status, published_at FROM songs WHERE id = ?",
  ).bind(c.req.param("id")).first<{ created_by_user_id: string; status: string; published_at: string | null }>();
  if (!current) return c.json({ error: "Not found" }, 404);
  if (current.created_by_user_id !== user.id) return c.json({ error: "Forbidden" }, 403);
  const publishedAt =
    data.status === "published" ? current.published_at ?? new Date().toISOString() : current.published_at;
  const updated = await c.env.DB.prepare(
    `UPDATE songs SET title = ?, bpm = ?, initial_key = ?, source_url = ?,
      status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
     WHERE id = ? AND version = ?`,
  ).bind(
    data.title,
    data.bpm,
    data.initialKey,
    data.sourceUrl || null,
    data.status,
    publishedAt,
    c.req.param("id"),
    data.version,
  ).run();
  if (!updated.meta.changes) return c.json({ error: "Version conflict" }, 409);

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("DELETE FROM chord_blocks WHERE song_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM key_changes WHERE song_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM song_tags WHERE song_id = ?").bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM song_progressions WHERE song_id = ?").bind(c.req.param("id")),
  ];
  for (const block of data.blocks) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO chord_blocks
       (id, song_id, start_beat, duration, degree, quality, bass_degree)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      block.id,
      c.req.param("id"),
      block.startBeat,
      block.duration,
      block.degree,
      block.quality,
      block.bassDegree === block.degree ? null : block.bassDegree,
    ));
  }
  for (const change of data.keyChanges) {
    statements.push(c.env.DB.prepare(
      "INSERT INTO key_changes (id, song_id, start_beat, key_pitch_class) VALUES (?, ?, ?, ?)",
    ).bind(change.id, c.req.param("id"), change.startBeat, change.keyPitchClass));
  }
  for (const name of uniqueNames(data.tags)) {
    const id = await stableId("tag", name);
    statements.push(
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO tags (id, name, created_by_user_id) VALUES (?, ?, ?)",
      ).bind(id, name, user.id),
      c.env.DB.prepare("INSERT INTO song_tags (song_id, tag_id) VALUES (?, ?)").bind(c.req.param("id"), id),
    );
  }
  for (const range of data.progressions) {
    const nameId = await stableId("progression", range.name);
    statements.push(
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO progression_names (id, name, created_by_user_id) VALUES (?, ?, ?)",
      ).bind(nameId, range.name.trim(), user.id),
      c.env.DB.prepare(
        `INSERT INTO song_progressions
         (id, song_id, progression_name_id, start_beat, end_beat)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(range.id, c.req.param("id"), nameId, range.startBeat, range.endBeat),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ version: data.version + 1, publishedAt });
});

app.delete("/api/songs/:id", async (c) => {
  const user = requireAllowed(c.get("user"));
  if (user instanceof Response) return user;
  const result = await c.env.DB.prepare(
    "DELETE FROM songs WHERE id = ? AND created_by_user_id = ?",
  ).bind(c.req.param("id"), user.id).run();
  if (!result.meta.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

function cookieOptions(url: string, maxAge: number) {
  return {
    httpOnly: true,
    secure: new URL(url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
    maxAge,
  };
}

function allowedEmails(env: Env) {
  return new Set(env.ALLOWED_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function secret(env: Env) {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

async function createSession(env: Env, user: SessionUser) {
  return new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret(env));
}

async function readSession(env: Env, token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(env));
    const email = String(payload.email);
    return {
      id: String(payload.id),
      email,
      displayName: String(payload.displayName),
      avatarUrl: payload.avatarUrl ? String(payload.avatarUrl) : null,
      allowed: allowedEmails(env).has(email.toLowerCase()),
    };
  } catch {
    return null;
  }
}

function requireAllowed(user: SessionUser | null): SessionUser | Response {
  return user?.allowed ? user : Response.json({ error: "Forbidden" }, { status: 403 });
}

function validateTimeline(blocks: z.infer<typeof blockSchema>[]) {
  const sorted = [...blocks].sort((a, b) => a.startBeat - b.startBeat);
  let end = 0;
  for (const block of sorted) {
    if (block.startBeat !== end) return "Chord blocks must form a continuous timeline";
    if (Math.floor(block.startBeat / 4) !== Math.floor((block.startBeat + block.duration - 1) / 4)) {
      return "A chord block cannot cross a bar line";
    }
    if ((block.degree === null) !== (block.quality === null)) return "Invalid N.C. block";
    end += block.duration;
  }
  return null;
}

function uniqueNames(names: string[]) {
  const byLower = new Map<string, string>();
  for (const name of names) byLower.set(name.trim().toLowerCase(), name.trim());
  return [...byLower.values()];
}

async function stableId(prefix: string, name: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name.trim().toLowerCase()));
  return `${prefix}_${[...new Uint8Array(bytes)].slice(0, 12).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

async function loadSong(db: D1Database, slug: string, user: SessionUser | null): Promise<Song | null> {
  const row = await db.prepare(
    `SELECT s.*, u.display_name AS creator_name FROM songs s
     JOIN users u ON u.id = s.created_by_user_id WHERE s.slug = ?`,
  ).bind(slug).first<Record<string, unknown>>();
  if (!row) return null;
  const isOwner = Boolean(user?.allowed && user.id === row.created_by_user_id);
  if (row.status !== "published" && !isOwner) return null;
  const songId = String(row.id);
  const [blocks, changes, tags, progressions] = await Promise.all([
    db.prepare("SELECT * FROM chord_blocks WHERE song_id = ? ORDER BY start_beat").bind(songId).all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM key_changes WHERE song_id = ? ORDER BY start_beat").bind(songId).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT t.name FROM tags t JOIN song_tags st ON st.tag_id = t.id
       WHERE st.song_id = ? ORDER BY t.name COLLATE NOCASE`,
    ).bind(songId).all<{ name: string }>(),
    db.prepare(
      `SELECT sp.id, pn.name, sp.start_beat, sp.end_beat
       FROM song_progressions sp JOIN progression_names pn ON pn.id = sp.progression_name_id
       WHERE sp.song_id = ? ORDER BY sp.start_beat`,
    ).bind(songId).all<Record<string, unknown>>(),
  ]);
  return {
    id: songId,
    slug: String(row.slug),
    title: String(row.title),
    bpm: Number(row.bpm),
    initialKey: Number(row.initial_key),
    sourceUrl: row.source_url ? String(row.source_url) : null,
    status: row.status as Song["status"],
    createdByUserId: String(row.created_by_user_id),
    creatorName: String(row.creator_name),
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
    blocks: blocks.results.map((item) => ({
      id: String(item.id),
      startBeat: Number(item.start_beat),
      duration: Number(item.duration),
      degree: item.degree === null ? null : Number(item.degree),
      quality: item.quality as ChordQuality | null,
      bassDegree: item.bass_degree === null ? null : Number(item.bass_degree),
    })),
    keyChanges: changes.results.map((item) => ({
      id: String(item.id),
      startBeat: Number(item.start_beat),
      keyPitchClass: Number(item.key_pitch_class),
    })),
    tags: tags.results.map((item) => item.name),
    progressions: progressions.results.map((item) => ({
      id: String(item.id),
      name: String(item.name),
      startBeat: Number(item.start_beat),
      endBeat: Number(item.end_beat),
    })),
    canEdit: isOwner,
  };
}

function mapSummary(row: Record<string, unknown>): SongSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    bpm: Number(row.bpm),
    initialKey: Number(row.initial_key),
    tags: String(row.tag_names || "").split(",").filter(Boolean),
    creatorName: String(row.creator_name),
    publishedAt: row.published_at ? String(row.published_at) : null,
    status: row.status as SongSummary["status"],
  };
}

export default app;
