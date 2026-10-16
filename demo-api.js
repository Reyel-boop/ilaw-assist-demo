// Demo mode: a stand-in for the server that runs in the browser (localStorage). No real AI, no real payments.
// Used when the site is opened from the demo address (github.io) or with ?demo in the URL.
import { generatePlan } from "./ilaw.js";

const KEY = "ilaw-demo-db-v1";
const PACKS = [{ id: "starter", credits: 5, price: 25 }, { id: "teacher", credits: 15, price: 60 }, { id: "pro", credits: 35, price: 120 }];
export const DEMO_LOGINS = [
  { role: "Teacher", email: "teacher@demo.ilaw", password: "demo-teacher", text: "Write plans, top up credits" },
  { role: "Owner", email: "owner@demo.ilaw", password: "demo-owner", text: "See the sales and users dashboard" }
];
const now = () => Date.now();
const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

function seed() {
  const t0 = now() - 6 * 86400000;
  const users = [
    { id: "u-owner", email: "owner@demo.ilaw", password: "demo-owner", name: "App Owner", school: "", credits: 0, created_at: t0 },
    { id: "u-teacher", email: "teacher@demo.ilaw", password: "demo-teacher", name: "Maria Santos", school: "San Vicente NHS", credits: 3, created_at: t0 },
    { id: "u-a", email: "jose.reyes@demo.ilaw", password: "x", name: "Jose Reyes", school: "Panabo City NHS", credits: 9, created_at: t0 + 3600000 },
    { id: "u-b", email: "liza.cruz@demo.ilaw", password: "x", name: "Liza Cruz", school: "Tagum NHS", credits: 21, created_at: t0 + 86400000 },
    { id: "u-c", email: "ana.lim@demo.ilaw", password: "x", name: "Ana Lim", school: "Davao City NHS", credits: 2, created_at: t0 + 2 * 86400000 }
  ];
  const sale = (uid, pack, d) => ({ id: id(), user_id: uid, pack: pack.id, credits: pack.credits, amount: pack.price * 100, status: "paid", paid_at: now() - d * 3600000 });
  const purchases = [sale("u-a", PACKS[1], 30), sale("u-b", PACKS[2], 20), sale("u-c", PACKS[0], 9), sale("u-a", PACKS[0], 3)];
  const gens = Array.from({ length: 23 }, (_, i) => ({ user_id: ["u-a", "u-b", "u-c"][i % 3], ok: 1, cost_usd: 0.004, created_at: now() - i * 7200000 }));
  return { users, tokens: {}, plans: [], ledger: [{ id: id(), user_id: "u-teacher", delta: 3, kind: "signup", amount: 0, note: "Free credits", created_at: t0 }], purchases, gens };
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } };
const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode */ } };
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, school: u.school, credits: u.credits, owner: u.email === "owner@demo.ilaw" });

export async function demoApi(path, opts = {}, token) {
  await new Promise((r) => setTimeout(r, 150));
  const db = load();
  const b = opts.body || {};
  const m = opts.method || "GET";
  const done = (x) => { save(db); return x; };
  if (path === "/config") return { app: "ILAW Assist", business: "ILAW Assist (demo)", support: "", packs: PACKS, freeCredits: 3, topups: true, demo: true, demoLogins: DEMO_LOGINS };
  if (path === "/signup") {
    if (db.users.some((u) => u.email === String(b.email).toLowerCase())) fail("That email already has an account. Sign in instead.");
    const u = { id: id(), email: String(b.email).toLowerCase(), password: b.password, name: b.name || "Teacher", school: b.school || "", credits: 3, created_at: now() };
    db.users.push(u);
    db.ledger.push({ id: id(), user_id: u.id, delta: 3, kind: "signup", amount: 0, note: "Free credits", created_at: now() });
    const t = id(); db.tokens[t] = u.id;
    return done({ token: t, user: pub(u) });
  }
  if (path === "/login") {
    const u = db.users.find((x) => x.email === String(b.email).toLowerCase() && x.password === b.password);
    if (!u) fail("Wrong email or password.", 401);
    const t = id(); db.tokens[t] = u.id;
    return done({ token: t, user: pub(u) });
  }
  const user = db.users.find((u) => u.id === db.tokens[token]);
  if (!user) fail("Please sign in.", 401);
  if (path === "/logout") { delete db.tokens[token]; return done({ ok: true }); }
  if (path === "/me" && m === "GET") return { user: pub(user) };
  if (path === "/me" && m === "PUT") { user.name = b.name || user.name; user.school = b.school || ""; return done({ user: pub(user) }); }
  if (path === "/plans" && m === "GET") return { plans: db.plans.filter((p) => p.user_id === user.id).sort((a, c) => c.updated_at - a.updated_at).map((p) => ({ id: p.id, title: p.data.title, week: p.data.week, updated_at: p.updated_at })) };
  if (path === "/plans" && m === "POST") { const p = { id: id(), user_id: user.id, data: b.data, updated_at: now() }; db.plans.push(p); return done({ id: p.id }); }
  const pm = path.match(/^\/plans\/(.+)$/);
  if (pm) {
    const p = db.plans.find((x) => x.id === pm[1] && x.user_id === user.id);
    if (!p) fail("Plan not found.", 404);
    if (m === "GET") return { id: p.id, data: p.data, updated_at: p.updated_at };
    if (m === "PUT") { p.data = b.data; p.updated_at = now(); return done({ ok: true }); }
    if (m === "DELETE") { db.plans = db.plans.filter((x) => x !== p); return done({ ok: true }); }
  }
  if (path === "/generate") {
    if (user.credits < 1) fail("You have no AI credits left. Top up to keep generating.", 402);
    await new Promise((r) => setTimeout(r, 1500));
    user.credits -= 1;
    db.ledger.push({ id: id(), user_id: user.id, delta: -1, kind: "ai", amount: 0, note: `AI plan: ${b.title}`, created_at: now() });
    const g = generatePlan({ ...b, teacher: user.name });
    return done({ cells: g.cells, sessions: g.sessions, references: g.references, credits: user.credits,
      aiUse: "DEMO: this sample text was not written by AI. In the live app, the AI writes this plan from your lesson details." });
  }
  if (path === "/ledger") return { ledger: db.ledger.filter((l) => l.user_id === user.id).sort((a, c) => c.created_at - a.created_at), credits: user.credits };
  if (path === "/checkout") {
    // Demo: no payment page. The live app opens PayMongo here (GCash, Maya, card).
    const pack = PACKS.find((p) => p.id === b.pack);
    if (!pack) fail("Choose a credit pack.");
    user.credits += pack.credits;
    db.purchases.push({ id: id(), user_id: user.id, pack: pack.id, credits: pack.credits, amount: pack.price * 100, status: "paid", paid_at: now() });
    db.ledger.push({ id: id(), user_id: user.id, delta: pack.credits, kind: "purchase", amount: pack.price * 100, note: `${pack.id} pack (demo, no real payment)`, created_at: now() });
    return done({ demo: true, credits: user.credits, added: pack.credits });
  }
  if (path === "/checkout/refresh") return { added: 0, credits: user.credits };
  if (path.startsWith("/owner/")) {
    if (user.email !== "owner@demo.ilaw") fail("Owner only.", 403);
    const paid = db.purchases.filter((p) => p.status === "paid"), since = now() - 30 * 86400000;
    const sum = (a, k) => a.reduce((n, x) => n + (x[k] || 0), 0);
    if (path === "/owner/summary") return {
      users: db.users.length, model: "claude-haiku-5-5 (demo figures)",
      sales: { n: paid.length, amount: sum(paid, "amount"), credits: sum(paid, "credits") },
      sales30: { n: paid.filter((p) => p.paid_at > since).length, amount: sum(paid.filter((p) => p.paid_at > since), "amount") },
      gens: { n: db.gens.length, cost: sum(db.gens, "cost_usd") }, gens30: { n: db.gens.length, cost: sum(db.gens, "cost_usd") },
      recent: paid.sort((a, c) => c.paid_at - a.paid_at).slice(0, 20).map((p) => ({ ...p, email: (db.users.find((u) => u.id === p.user_id) || {}).email }))
    };
    if (path === "/owner/users") return { users: db.users.map((u) => ({ email: u.email, name: u.name, school: u.school, credits: u.credits, created_at: u.created_at, gens: db.gens.filter((g) => g.user_id === u.id).length })) };
    if (path === "/owner/adjust") {
      const t = db.users.find((u) => u.email === String(b.email).toLowerCase());
      const delta = Math.trunc(Number(b.delta) || 0);
      if (!t || !delta) fail("Enter a user's email and a credit change (e.g. 5 or -2).");
      t.credits = Math.max(0, t.credits + delta);
      db.ledger.push({ id: id(), user_id: t.id, delta, kind: "owner", amount: Math.max(0, Number(b.amount) || 0) * 100, note: b.note || "Adjusted by owner", created_at: now() });
      return done({ ok: true });
    }
  }
  fail("Not found.", 404);
}
export function resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem("ilaw-token"); } catch { /* ignore */ } }
