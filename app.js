// ILAW Assist - browser app. Talks to the worker's /api; keeps the session token in localStorage.
import { ILAW_HEAD, planRows, blankPlan, generatePlan, ilawPrint } from "./ilaw.js";
import { demoApi, resetDemo } from "./demo-api.js";

// Demo copy (github.io or ?demo): runs in the browser with sample text instead of AI and no real payments.
const DEMO = location.hostname.endsWith("github.io") || new URLSearchParams(location.search).has("demo");

const $ = (s) => document.querySelector(s);
const main = $("#main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const peso = (centavos) => `₱${(Number(centavos || 0) / 100).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const when = (ms) => new Date(ms).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const AREAS = ["English", "Filipino", "Math", "Science", "Araling Panlipunan", "TLE", "Values Education", "MAPEH"];
const USD_PHP = 58;

const btn = "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors";
const btnPrimary = `${btn} bg-brand-600 hover:bg-brand-700 text-white`;
const btnLight = `${btn} border border-slate-300 bg-white hover:bg-slate-50 text-slate-800`;
const input = "w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500";
const card = "bg-white rounded-xl border border-slate-200 shadow-sm";

const state = { token: localStorage.getItem("ilaw-token") || "", user: null, cfg: null, view: "plans", plans: [], plan: null, planId: null, authMode: "signup", busy: false };

// ---------- API ----------
async function api(path, opts = {}) {
  if (DEMO) {
    try { return await demoApi(path, opts, state.token); }
    catch (e) { if (e.status === 401 && state.token && !path.startsWith("/login")) signOutLocal(); throw e; }
  }
  const r = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json", ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && state.token && !path.startsWith("/login")) { signOutLocal(); throw new Error("Please sign in again."); }
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `fixed bottom-5 right-5 z-50 max-w-sm text-white text-sm px-4 py-3 rounded-lg shadow-xl ${bad ? "bg-red-700" : "bg-slate-900"}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 4500);
}
function openModal(html) { const m = $("#modal"); m.innerHTML = `<div class="${card} w-full max-w-xl max-h-[92vh] overflow-y-auto">${html}</div>`; m.classList.remove("hidden"); m.classList.add("flex"); icons(); }
function closeModal() { const m = $("#modal"); m.classList.add("hidden"); m.classList.remove("flex"); m.innerHTML = ""; }
const icons = () => window.lucide && window.lucide.createIcons();
const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
const field = (id, label, type = "text", attrs = "") => `<div><label for="${id}" class="block text-xs font-semibold text-slate-700 mb-1">${label}</label><input id="${id}" type="${type}" ${attrs} class="${input}"></div>`;

// ---------- Shell ----------
function renderTop() {
  const u = state.user;
  const tab = (v, label) => `<button data-act="view" data-v="${v}" class="px-3 py-2 rounded-lg text-sm font-semibold ${state.view === v ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}">${label}</button>`;
  $("#top").innerHTML = `<div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
    <a href="/" class="flex items-center gap-2 font-bold text-slate-900 mr-2"><span class="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center"><i data-lucide="lamp" class="w-5 h-5 text-sun"></i></span>${esc(state.cfg ? state.cfg.app : "ILAW Assist")}</a>
    ${u ? `<nav class="flex gap-1">${tab("plans", "My lesson plans")}${tab("credits", "Credits")}${u.owner ? tab("owner", "Owner") : ""}</nav>
      <span class="flex-1"></span>
      <button data-act="view" data-v="credits" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold"><i data-lucide="zap" class="w-4 h-4"></i><span class="tabular">${u.credits}</span> credit${u.credits === 1 ? "" : "s"}</button>
      <button data-act="profile" class="text-sm text-slate-600 hover:text-slate-900">${esc(u.name)}</button>
      <button data-act="signout" class="${btnLight} !py-1.5">Sign out</button>` : ""}
  </div>`
    + (DEMO ? `<div class="bg-slate-900 text-white text-xs"><div class="max-w-6xl mx-auto px-4 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2"><span><strong>Demo version</strong> · sample text instead of real AI · no real payments · data stays in this browser</span><button data-act="demo-reset" class="underline">Reset demo</button></div></div>` : "");
  const c = state.cfg || {};
  $("#foot").innerHTML = `<div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap gap-x-4 gap-y-1 justify-between">
    <span>${esc(c.business || "ILAW Assist")} · AI writing by Claude (Anthropic). Teachers review and are responsible for their final lesson plans.</span>
    <span><button data-act="terms" class="hover:underline">Terms &amp; refunds</button>${c.support ? ` · <a class="hover:underline" href="mailto:${esc(c.support)}">${esc(c.support)}</a>` : ""}</span></div>`;
}

function render() {
  renderTop();
  if (!state.user) renderLanding();
  else if (state.view === "editor" && state.planId) renderEditor();
  else if (state.view === "credits") renderCredits();
  else if (state.view === "owner" && state.user.owner) renderOwner();
  else renderPlans();
  icons();
}

// ---------- Landing / auth ----------
function renderLanding() {
  const c = state.cfg || { packs: [] };
  const mode = state.authMode;
  main.innerHTML = `<div class="grid lg:grid-cols-2 gap-10 items-start py-6">
    <div>
      <div class="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-3 py-1">For DepEd teachers · ILAW format</div>
      <h1 class="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-tight">Your ILAW lesson plan,<br><span class="text-brand-600">written by AI in minutes.</span></h1>
      <p class="mt-4 text-lg text-slate-600 max-w-lg">Enter the lesson title, competency and number of sessions. The AI writes every part of the ILAW: intentions, learning experience, assessment and ways forward. You edit, then print or save as PDF.</p>
      <ul class="mt-6 space-y-2 text-slate-700">
        ${["Follows the Daily Lesson Logs | ILAW Format, session by session", "Add sessions or your own rows; edit everything", "Declaration of AI use filled in for you", `${c.freeCredits || 0} free AI credits when you sign up`].map((t) => `<li class="flex gap-2"><i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-600 flex-shrink-0"></i>${t}</li>`).join("")}
      </ul>
      ${c.packs.length ? `<div class="mt-8"><div class="text-sm font-semibold text-slate-700 mb-2">Top up when you need more (1 credit = 1 AI-written plan)</div>
        <div class="grid grid-cols-3 gap-2 max-w-md">${c.packs.map((p) => `<div class="${card} p-3 text-center"><div class="text-xl font-bold">${p.credits}</div><div class="text-xs text-slate-500">credits</div><div class="mt-1 font-semibold text-brand-700">₱${p.price}</div></div>`).join("")}</div>
        <div class="text-xs text-slate-500 mt-2">Pay with GCash, Maya or card through PayMongo.</div></div>` : ""}
    </div>
    <div class="${card} p-6 sm:p-8 max-w-md w-full lg:justify-self-end">
      <div class="flex p-1 bg-slate-100 rounded-lg mb-5">
        ${[["signup", "Create account"], ["login", "Sign in"]].map(([m, t]) => `<button data-act="auth-mode" data-m="${m}" class="flex-1 py-1.5 text-sm font-semibold rounded-md ${mode === m ? "bg-white shadow-sm" : "text-slate-500"}">${t}</button>`).join("")}
      </div>
      ${c.demoLogins ? `<div class="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div class="text-xs font-bold uppercase tracking-wide text-amber-900">Try the demo · one click</div>
        <div class="mt-2 space-y-2">${c.demoLogins.map((d, i) => `<button type="button" data-act="demo-login" data-i="${i}" class="w-full text-left rounded-lg border border-amber-200 bg-white hover:bg-amber-100 px-3 py-2 text-sm">
          <span class="font-bold">${esc(d.role)}</span> <span class="text-slate-600">${esc(d.text)}</span><div class="font-mono text-[11px] text-slate-500">${esc(d.email)} · ${esc(d.password)}</div></button>`).join("")}</div></div>` : ""}
      <form id="auth" class="space-y-3">
        ${mode === "signup" ? field("a-name", "Full name", "text", 'required maxlength="120" autocomplete="name"') + field("a-school", 'School <span class="font-normal text-slate-400">(optional)</span>', "text", 'maxlength="160"') : ""}
        ${field("a-email", "Email", "email", 'required autocomplete="email"')}
        ${field("a-pass", "Password", "password", `required minlength="8" autocomplete="${mode === "signup" ? "new-password" : "current-password"}"`)}
        <div id="a-err" class="hidden text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
        <button class="${btnPrimary} w-full !py-2.5">${mode === "signup" ? `Create account · ${c.freeCredits || 0} free credits` : "Sign in"}</button>
        ${mode === "signup" ? `<p class="text-[11px] text-slate-500">By creating an account you agree to the <button type="button" data-act="terms" class="underline">terms</button>.</p>` : ""}
      </form>
    </div>
  </div>`;
}
async function submitAuth() {
  const err = $("#a-err");
  try {
    const signup = state.authMode === "signup";
    const r = await api(signup ? "/signup" : "/login", { method: "POST", body: signup
      ? { name: val("a-name"), school: val("a-school"), email: val("a-email"), password: $("#a-pass").value }
      : { email: val("a-email"), password: $("#a-pass").value } });
    state.token = r.token; localStorage.setItem("ilaw-token", r.token);
    state.user = r.user; state.view = "plans";
    await loadPlans();
    render();
    if (signup) toast(`Welcome! You have ${r.user.credits} free AI credits.`);
  } catch (e) { err.textContent = e.message; err.classList.remove("hidden"); }
}
function signOutLocal() { state.token = ""; state.user = null; localStorage.removeItem("ilaw-token"); render(); }

// ---------- Plans list ----------
async function loadPlans() { state.plans = (await api("/plans")).plans; }
function renderPlans() {
  main.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><h2 class="text-2xl font-bold">My lesson plans</h2><p class="text-sm text-slate-600 mt-1">Each plan follows the ILAW format. 1 credit writes one plan with AI.</p></div>
      <button data-act="new" class="${btnPrimary}"><i data-lucide="sparkles" class="w-4 h-4"></i>New lesson plan</button>
    </div>
    <div class="${card} overflow-hidden">${state.plans.length ? `<table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 border-b border-slate-200"><tr><th class="text-left px-4 py-2.5">Lesson</th><th class="text-left px-4 py-2.5">Week</th><th class="text-left px-4 py-2.5">Last edited</th><th></th></tr></thead>
      <tbody class="divide-y divide-slate-100">${state.plans.map((p) => `<tr data-act="open" data-id="${p.id}" class="cursor-pointer hover:bg-brand-50/50">
        <td class="px-4 py-3 font-semibold">${esc(p.title) || "Untitled lesson"}</td><td class="px-4 py-3 text-slate-600">${esc(p.week) || "—"}</td>
        <td class="px-4 py-3 text-slate-500">${when(p.updated_at)}</td>
        <td class="px-4 py-3 text-right"><button data-act="del" data-id="${p.id}" title="Delete" class="p-1.5 rounded-md text-red-600 hover:bg-red-50"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join("")}</tbody></table>`
      : `<div class="p-12 text-center text-slate-500"><i data-lucide="file-pen-line" class="w-10 h-10 mx-auto text-slate-300"></i><p class="mt-3">No lesson plans yet. Click <strong>New lesson plan</strong> and let the AI write your first ILAW.</p></div>`}</div>`;
}

// ---------- Generator ----------
function openGenerator(existing) {
  const p = existing ? state.plan : {};
  const u = state.user;
  openModal(`<div class="px-6 pt-5 pb-2"><h3 class="text-lg font-bold">${existing ? "Rewrite with AI" : "New lesson plan"}</h3>
      <p class="text-sm text-slate-600">The AI writes every part of the ILAW for each session. You can edit everything after.</p></div>
    <div class="px-6 pb-4 space-y-3">
      ${existing ? `<p class="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This replaces the text in the plan's parts and sessions.</p>` : ""}
      ${field("g-title", "Lesson title", "text", `value="${esc(p.title || "")}" maxlength="200" placeholder="e.g. Photosynthesis"`)}
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label for="g-area" class="block text-xs font-semibold text-slate-700 mb-1">Learning area</label><select id="g-area" class="${input}">${AREAS.map((a) => `<option ${p.area === a ? "selected" : ""}>${a}</option>`).join("")}</select></div>
        ${field("g-grade", "Grade level and section", "text", `value="${esc(p.gradeSection || "")}" maxlength="120" placeholder="e.g. Grade 7 – Rosal"`)}
      </div>
      <div><label for="g-comp" class="block text-xs font-semibold text-slate-700 mb-1">Learning competency and standards <span class="font-normal text-slate-400">(paste from the curriculum guide; optional)</span></label>
        <textarea id="g-comp" rows="3" maxlength="2000" class="${input}">${esc(existing ? ((p.cells || {}).competency || [])[0] || "" : "")}</textarea></div>
      <div class="grid sm:grid-cols-3 gap-3">
        ${field("g-n", "Sessions", "number", `min="1" max="6" value="${existing ? Math.min(6, (p.sessions || []).length) : 3}"`)}
        <div><label for="g-lang" class="block text-xs font-semibold text-slate-700 mb-1">Language</label><select id="g-lang" class="${input}"><option value="en">English</option><option value="fil">Filipino</option></select></div>
        ${field("g-school", "School", "text", `value="${esc(p.school || u.school || "")}" maxlength="160"`)}
      </div>
      <div><label for="g-focus" class="block text-xs font-semibold text-slate-700 mb-1">Focus of each session <span class="font-normal text-slate-400">(optional, one line each)</span></label>
        <textarea id="g-focus" rows="3" maxlength="1200" class="${input}" placeholder="Parts of a leaf&#10;The process&#10;Why it matters"></textarea></div>
      <div><label for="g-ctx" class="block text-xs font-semibold text-slate-700 mb-1">About your learners <span class="font-normal text-slate-400">(optional)</span></label>
        <textarea id="g-ctx" rows="2" maxlength="1500" class="${input}" placeholder="e.g. 45 learners, mostly visual, some struggling readers"></textarea></div>
      <div id="g-err" class="hidden text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"></div>
    </div>
    <div class="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex flex-wrap justify-end gap-2">
      <button data-act="close" class="px-3 py-2 text-sm text-slate-600">Cancel</button>
      ${existing ? "" : `<button data-act="gen-blank" class="${btnLight}">Blank</button><button data-act="gen-free" class="${btnLight}" title="Built-in template text, no AI, no credit">Free template draft</button>`}
      <button data-act="gen-ai" data-existing="${existing ? 1 : ""}" class="${btnPrimary}"><i data-lucide="sparkles" class="w-4 h-4"></i>Write with AI · 1 credit</button>
    </div>`);
}
function genInput() {
  return { title: val("g-title"), area: val("g-area"), gradeSection: val("g-grade"), competency: val("g-comp"), sessions: Math.max(1, Math.min(6, Number(val("g-n")) || 1)),
    language: val("g-lang"), school: val("g-school"), focus: val("g-focus").split("\n").map((x) => x.trim()), context: val("g-ctx") };
}
async function createPlan(data) {
  const r = await api("/plans", { method: "POST", body: { data } });
  state.planId = r.id; state.plan = data; state.view = "editor";
  closeModal(); await loadPlans(); render(); window.scrollTo({ top: 0 });
}
async function generate(mode, existing) {
  const inp = genInput();
  const err = $("#g-err");
  if (mode !== "blank" && !inp.title) { err.textContent = "Enter the lesson title."; err.classList.remove("hidden"); return; }
  const base = { ...blankPlan(), title: inp.title, area: inp.area, teachers: state.user.name, gradeSection: inp.gradeSection, school: inp.school, week: "", region: "", division: "" };
  if (mode === "blank") return createPlan(base);
  if (mode === "free") {
    const g = generatePlan({ ...inp, teacher: state.user.name });
    return createPlan({ ...base, ...g, school: inp.school });
  }
  if (state.user.credits < 1) { closeModal(); state.view = "credits"; render(); toast("You're out of AI credits. Top up to keep writing with AI.", true); return; }
  const b = document.querySelector('[data-act="gen-ai"]');
  b.disabled = true; b.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>Writing… this can take a minute`; icons();
  try {
    const r = await api("/generate", { method: "POST", body: { ...inp, planId: existing ? state.planId : "" } });
    state.user.credits = r.credits;
    const filled = { cells: r.cells, sessions: r.sessions, references: r.references, aiUse: r.aiUse };
    if (existing) {
      Object.assign(state.plan, filled, { title: inp.title, area: inp.area, gradeSection: inp.gradeSection, school: inp.school });
      closeModal(); await savePlan(); render(); toast("Rewritten with AI. Review each part.");
    } else {
      await createPlan({ ...base, ...filled });
      toast(`Written with AI. ${r.credits} credit${r.credits === 1 ? "" : "s"} left.`);
    }
  } catch (e) {
    err.textContent = e.message; err.classList.remove("hidden");
    b.disabled = false; b.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i>Write with AI · 1 credit`; icons();
    try { state.user = (await api("/me")).user; renderTop(); icons(); } catch { /* ignore */ }
  }
}

// ---------- Editor ----------
async function openPlan(id) {
  const r = await api(`/plans/${id}`);
  state.planId = id; state.plan = r.data; state.view = "editor";
  render(); window.scrollTo({ top: 0 });
}
function renderEditor() {
  const p = state.plan;
  p.sessions = p.sessions && p.sessions.length ? p.sessions : ["Session 1"];
  const n = p.sessions.length;
  const ta = (id, attrs, value, rows = 3) => `<textarea id="${id}" ${attrs} rows="${rows}" class="w-full text-sm px-2.5 py-2 rounded-md border border-slate-300 focus:ring-1 focus:ring-brand-500 resize-y">${esc(value || "")}</textarea>`;
  const head = [["school", "School"], ["division", "Schools Division"], ["region", "Region"], ["week", "Week / dates"]];
  main.innerHTML = `
    <button data-act="back" class="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"><i data-lucide="arrow-left" class="w-4 h-4"></i>My lesson plans</button>
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div><h2 class="text-2xl font-bold">${esc(p.title) || "Untitled lesson"}</h2><span id="saved" class="text-xs text-slate-400">All changes saved</span></div>
      <div class="flex flex-wrap gap-2">
        <button data-act="rewrite" class="${btnLight}"><i data-lucide="sparkles" class="w-4 h-4"></i>Rewrite with AI · 1 credit</button>
        <button data-act="print" class="${btnPrimary}"><i data-lucide="printer" class="w-4 h-4"></i>Print / PDF</button>
      </div>
    </div>
    <div class="${card} p-5 mb-4">
      <h3 class="font-bold mb-3">Lesson details</h3>
      <div class="grid lg:grid-cols-2 gap-3">
        ${head.map(([k, label]) => `<div><label class="block text-xs font-semibold text-slate-700 mb-1">${label}</label>${ta(`f-${k}`, `data-act="pf" data-k="${k}"`, p[k], 1)}</div>`).join("")}
        ${ILAW_HEAD.map(([k, label, help]) => `<div class="${k === "references" || k === "aiUse" ? "lg:col-span-2" : ""}"><label class="block text-xs font-semibold text-slate-700 mb-1">${label}</label>${help ? `<p class="text-[11px] text-slate-500 mb-1">${help}</p>` : ""}${ta(`f-${k}`, `data-act="pf" data-k="${k}"`, p[k], k === "references" || k === "aiUse" ? 3 : 1)}</div>`).join("")}
        <div class="text-sm text-slate-600">No. of sessions: <strong>${n}</strong></div>
      </div>
    </div>
    <div class="mb-4 flex flex-wrap items-center gap-2"><span class="text-sm font-semibold">Sessions</span>
      ${p.sessions.map((s, i) => `<span class="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white pl-2 pr-1 py-1">
        <input id="s-${i}" data-act="slabel" data-i="${i}" value="${esc(s)}" maxlength="60" class="w-32 text-sm border-0 p-0 focus:ring-0">
        ${n > 1 ? `<button data-act="sdel" data-i="${i}" title="Remove session" class="p-1 text-slate-400 hover:text-red-600"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>` : ""}</span>`).join("")}
      ${n < 10 ? `<button data-act="sadd" class="${btnLight} !py-1.5"><i data-lucide="plus" class="w-4 h-4"></i>Add session</button>` : ""}
    </div>
    <div class="space-y-4">${planRows(p).map((part) => `<div class="${card} overflow-hidden">
      <div class="px-5 py-3 bg-slate-100 border-b border-slate-200"><div class="font-bold">${part.title}</div><div class="text-xs text-slate-600 whitespace-pre-line mt-0.5">${esc(part.intro)}</div></div>
      <div class="divide-y divide-slate-100">${part.rows.map((r) => `<div class="p-4">
        <div class="flex items-start justify-between gap-2"><div><div class="text-sm font-semibold">${esc(r.label)}</div>
          ${r.help ? `<details class="text-[11px] text-slate-500"><summary class="cursor-pointer">Guide</summary><div class="whitespace-pre-line mt-1">${esc(r.help)}</div></details>` : ""}</div>
          ${r.custom ? `<button data-act="rowdel" data-id="${esc(r.key)}" title="Remove row" class="p-1.5 text-red-600 hover:bg-red-50 rounded-md"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ""}</div>
        <div class="mt-2 overflow-x-auto"><div class="grid gap-2" style="grid-template-columns:repeat(${n},minmax(240px,1fr))">
          ${p.sessions.map((s, i) => `<div><div class="text-[11px] font-semibold text-slate-500 mb-0.5">${esc(s)}</div>${ta(`c-${r.key}-${i}`, `data-act="cell" data-k="${esc(r.key)}" data-i="${i}"`, ((p.cells || {})[r.key] || [])[i], r.key === "flow" ? 8 : 4)}</div>`).join("")}
        </div></div></div>`).join("")}
        <div class="px-4 pb-4"><button data-act="rowadd" data-part="${part.key}" class="text-xs font-semibold text-brand-600 hover:underline">+ Add row</button></div>
      </div></div>`).join("")}</div>`;
}
let saveTimer;
function saveSoon() { const s = $("#saved"); if (s) s.textContent = "Saving…"; clearTimeout(saveTimer); saveTimer = setTimeout(savePlan, 900); }
async function savePlan() {
  clearTimeout(saveTimer);
  const p = state.plan;
  for (const k of Object.keys(p.cells || {})) p.cells[k] = p.sessions.map((_, i) => String((p.cells[k] || [])[i] || ""));
  try { await api(`/plans/${state.planId}`, { method: "PUT", body: { data: p } }); const s = $("#saved"); if (s) s.textContent = "All changes saved"; }
  catch (e) { toast(e.message, true); }
}
function printPlan() {
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to print.", true);
  w.document.write(ilawPrint({ ...state.plan, name: state.plan.teachers || state.user.name }, { esc, baseUrl: location.origin + "/", checkedBy: "" }));
  w.document.close();
}

// ---------- Credits ----------
async function renderCredits() {
  const c = state.cfg;
  main.innerHTML = `<h2 class="text-2xl font-bold">Credits</h2>
    <p class="text-sm text-slate-600 mt-1">1 credit = 1 lesson plan written or rewritten with AI. If writing fails, the credit is returned automatically.</p>
    <div class="mt-5 grid lg:grid-cols-3 gap-4">
      <div class="${card} p-5"><div class="text-sm text-slate-600">Your balance</div><div class="mt-1 text-4xl font-bold tabular">${state.user.credits}</div><div class="text-sm text-slate-500">AI credits</div></div>
      <div class="lg:col-span-2 grid sm:grid-cols-3 gap-3">${c.packs.map((p) => `<div class="${card} p-5 flex flex-col">
        <div class="text-3xl font-bold">${p.credits}</div><div class="text-sm text-slate-500">credits</div>
        <div class="mt-2 text-xl font-bold text-brand-700">₱${p.price}</div><div class="text-xs text-slate-500">₱${(p.price / p.credits).toFixed(2)} per plan</div>
        <button data-act="buy" data-pack="${p.id}" ${c.topups ? "" : "disabled"} class="mt-3 ${btnPrimary} ${c.topups ? "" : "opacity-50 cursor-not-allowed"}">Buy</button></div>`).join("")}</div>
    </div>
    <p class="mt-3 text-xs text-slate-500">${c.topups ? `Secure payment through PayMongo (GCash, Maya, card). Receipts are issued by ${esc(c.business)}. Credits are added as soon as the payment is confirmed.` : "Top-ups open soon."}</p>
    <div class="${card} mt-6 overflow-hidden"><div class="px-5 py-3 font-bold border-b border-slate-200">History</div><div id="ledger" class="p-5 text-sm text-slate-500">Loading…</div></div>`;
  icons();
  try {
    const r = await api("/ledger");
    const label = { signup: "Free credits", purchase: "Top-up", ai: "AI writing", refund: "Returned", owner: "Adjustment" };
    $("#ledger").outerHTML = r.ledger.length ? `<table class="w-full text-sm"><tbody class="divide-y divide-slate-100">${r.ledger.map((l) => `<tr>
        <td class="px-5 py-2.5 text-slate-500 whitespace-nowrap">${when(l.created_at)}</td><td class="px-5 py-2.5">${label[l.kind] || l.kind}<div class="text-xs text-slate-500">${esc(l.note)}</div></td>
        <td class="px-5 py-2.5 text-right">${l.amount ? peso(l.amount) : ""}</td><td class="px-5 py-2.5 text-right font-bold tabular ${l.delta > 0 ? "text-emerald-700" : "text-slate-700"}">${l.delta > 0 ? "+" : ""}${l.delta}</td></tr>`).join("")}</tbody></table>`
      : `<div class="p-5 text-sm text-slate-500">No activity yet.</div>`;
  } catch (e) { toast(e.message, true); }
}
async function buy(pack) {
  try {
    const r = await api("/checkout", { method: "POST", body: { pack } });
    if (r.demo) { state.user.credits = r.credits; render(); toast(`Demo: +${r.added} credits added without payment. The live app opens PayMongo (GCash, Maya, card) here.`); return; }
    location.href = r.url;
  }
  catch (e) { toast(e.message, true); }
}
// Back from PayMongo: ask the server to confirm the payment (a few tries while it settles).
async function confirmTopup() {
  toast("Confirming your payment…");
  for (let i = 0; i < 8; i++) {
    try {
      const r = await api("/checkout/refresh", { method: "POST" });
      if (r.added) { state.user.credits = r.credits; render(); toast(`Payment received: +${r.added} credits.`); return; }
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 3000));
  }
  toast("Payment not confirmed yet. If you paid, your credits will appear shortly - refresh this page in a minute.", true);
}

// ---------- Owner dashboard ----------
async function renderOwner() {
  main.innerHTML = `<h2 class="text-2xl font-bold">Owner dashboard</h2><div id="own" class="mt-4 text-sm text-slate-500">Loading…</div>`;
  try {
    const [s, u] = await Promise.all([api("/owner/summary"), api("/owner/users")]);
    const tile = (label, v, sub = "") => `<div class="${card} p-4"><div class="text-sm text-slate-600">${label}</div><div class="text-2xl font-bold tabular mt-1">${v}</div>${sub ? `<div class="text-xs text-slate-500">${sub}</div>` : ""}</div>`;
    const aiPhp = (usd) => `₱${(usd * USD_PHP).toFixed(2)}`;
    $("#own").outerHTML = `<div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${tile("Sales (all time)", peso(s.sales.amount), `${s.sales.n} payments · ${s.sales.credits} credits`)}
        ${tile("Sales (30 days)", peso(s.sales30.amount), `${s.sales30.n} payments`)}
        ${tile("AI cost (30 days)", aiPhp(s.gens30.cost), `${s.gens30.n} generations · ${esc(s.model)}`)}
        ${tile("Users", s.users, `${s.gens.n} plans written · ${aiPhp(s.gens.cost)} AI cost total`)}
      </div>
      <p class="text-xs text-slate-500 mt-2">AI cost is estimated at ₱${USD_PHP}/US$. PayMongo fees are not included; see your PayMongo dashboard for payouts.</p>
      <div class="grid lg:grid-cols-2 gap-4 mt-5">
        <div class="${card} overflow-hidden"><div class="px-5 py-3 font-bold border-b">Recent sales</div>${s.recent.length ? `<table class="w-full text-sm"><tbody class="divide-y divide-slate-100">${s.recent.map((r) => `<tr><td class="px-4 py-2 text-slate-500 whitespace-nowrap">${when(r.paid_at)}</td><td class="px-4 py-2">${esc(r.email)}</td><td class="px-4 py-2">${r.credits} cr</td><td class="px-4 py-2 text-right font-semibold">${peso(r.amount)}</td></tr>`).join("")}</tbody></table>` : `<div class="p-5 text-sm text-slate-500">No sales yet.</div>`}</div>
        <div class="${card} p-5"><div class="font-bold">Add or remove credits</div><p class="text-xs text-slate-500 mt-1">For payments received outside PayMongo, refunds or goodwill credits.</p>
          <div class="mt-3 grid grid-cols-2 gap-2">${field("o-email", "User email", "email")}${field("o-delta", "Credits (+/-)", "number", 'value="5"')}${field("o-amount", "Amount paid ₱ (optional)", "number", 'value="0" min="0"')}${field("o-note", "Note", "text", 'placeholder="e.g. GCash payment"')}</div>
          <button data-act="adjust" class="mt-3 ${btnPrimary}">Apply</button></div>
      </div>
      <div class="${card} overflow-hidden mt-5"><div class="px-5 py-3 font-bold border-b">Users (${u.users.length})</div><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500"><tr><th class="text-left px-4 py-2">User</th><th class="text-left px-4 py-2">School</th><th class="text-right px-4 py-2">Credits</th><th class="text-right px-4 py-2">AI plans</th><th class="text-left px-4 py-2">Joined</th></tr></thead>
        <tbody class="divide-y divide-slate-100">${u.users.map((x) => `<tr><td class="px-4 py-2"><div class="font-semibold">${esc(x.name)}</div><div class="text-xs text-slate-500">${esc(x.email)}</div></td><td class="px-4 py-2 text-slate-600">${esc(x.school)}</td><td class="px-4 py-2 text-right tabular">${x.credits}</td><td class="px-4 py-2 text-right tabular">${x.gens}</td><td class="px-4 py-2 text-slate-500">${when(x.created_at)}</td></tr>`).join("")}</tbody></table></div></div>
    </div>`;
  } catch (e) { toast(e.message, true); }
}

function showTerms() {
  const c = state.cfg || {};
  openModal(`<div class="p-6 space-y-3 text-sm text-slate-700"><h3 class="text-lg font-bold">Terms &amp; refunds</h3>
    <p>${esc(c.app)} is operated by ${esc(c.business)}. AI credits are used to have lesson plans written by AI (Claude by Anthropic). One credit writes or rewrites one plan.</p>
    <p>AI-written plans are drafts. You are responsible for reviewing, correcting and adapting every plan before use, and for declaring AI use as your school requires.</p>
    <p>Credits do not expire and are non-transferable. If a generation fails, the credit is returned automatically. For payment problems or refunds of unused credits, contact ${c.support ? `<a class="underline" href="mailto:${esc(c.support)}">${esc(c.support)}</a>` : "us"} within 7 days of purchase.</p>
    <p>Your lesson plans are stored so you can edit them later and are not shared with other users. Lesson details you enter are sent to the AI provider to write your plan.</p>
    <div class="text-right"><button data-act="close" class="${btnLight}">Close</button></div></div>`);
}

// ---------- Events ----------
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) { if (e.target.id === "modal") closeModal(); return; }
  const a = el.dataset.act;
  if (el.tagName === "TR" && e.target.closest("button")) return; // row buttons handle themselves
  switch (a) {
    case "auth-mode": state.authMode = el.dataset.m; render(); break;
    case "demo-login": { const d = state.cfg.demoLogins[Number(el.dataset.i)]; state.authMode = "login"; render(); $("#a-email").value = d.email; $("#a-pass").value = d.password; submitAuth(); break; }
    case "demo-reset": resetDemo(); location.reload(); break;
    case "view": if (state.view === "editor") await savePlan(); state.view = el.dataset.v; state.planId = null; if (state.view === "plans") await loadPlans(); render(); break;
    case "signout": try { await api("/logout", { method: "POST" }); } catch { /* ignore */ } signOutLocal(); break;
    case "profile": openModal(`<div class="p-6 space-y-3"><h3 class="text-lg font-bold">Profile</h3>${field("p-name", "Name", "text", `value="${esc(state.user.name)}"`)}${field("p-school", "School", "text", `value="${esc(state.user.school)}"`)}
        <div class="flex justify-end gap-2"><button data-act="close" class="px-3 py-2 text-sm">Cancel</button><button data-act="profile-save" class="${btnPrimary}">Save</button></div></div>`); break;
    case "profile-save": try { state.user = (await api("/me", { method: "PUT", body: { name: val("p-name"), school: val("p-school") } })).user; closeModal(); render(); } catch (err) { toast(err.message, true); } break;
    case "terms": showTerms(); break;
    case "close": closeModal(); break;
    case "new": openGenerator(false); break;
    case "rewrite": openGenerator(true); break;
    case "gen-blank": generate("blank"); break;
    case "gen-free": generate("free"); break;
    case "gen-ai": generate("ai", !!el.dataset.existing); break;
    case "open": openPlan(el.dataset.id); break;
    case "del":
      if (!confirm("Delete this lesson plan? This can't be undone.")) return;
      try { await api(`/plans/${el.dataset.id}`, { method: "DELETE" }); await loadPlans(); render(); toast("Deleted"); } catch (err) { toast(err.message, true); }
      break;
    case "back": await savePlan(); state.view = "plans"; state.planId = null; await loadPlans(); render(); break;
    case "print": await savePlan(); printPlan(); break;
    case "sadd": state.plan.sessions.push(`Session ${state.plan.sessions.length + 1}`); await savePlan(); render(); break;
    case "sdel": { const i = Number(el.dataset.i); state.plan.sessions.splice(i, 1); for (const k of Object.keys(state.plan.cells || {})) (state.plan.cells[k] || []).splice(i, 1); await savePlan(); render(); break; }
    case "rowadd": { const label = prompt("Name of the new row:"); if (!label) return; (state.plan.custom ||= []).push({ id: `c${Date.now()}`, part: el.dataset.part, label: label.slice(0, 80) }); await savePlan(); render(); break; }
    case "rowdel": state.plan.custom = (state.plan.custom || []).filter((c) => c.id !== el.dataset.id); delete (state.plan.cells || {})[el.dataset.id]; await savePlan(); render(); break;
    case "buy": buy(el.dataset.pack); break;
    case "adjust":
      try { await api("/owner/adjust", { method: "POST", body: { email: val("o-email"), delta: Number(val("o-delta")), amount: Number(val("o-amount")), note: val("o-note") } }); toast("Credits updated"); render(); }
      catch (err) { toast(err.message, true); }
      break;
  }
});
document.addEventListener("input", (e) => {
  const el = e.target, p = state.plan;
  if (!p || state.view !== "editor") return;
  if (el.dataset.act === "pf") { p[el.dataset.k] = el.value; saveSoon(); }
  if (el.dataset.act === "cell") { const c = (p.cells ||= {}); (c[el.dataset.k] ||= [])[Number(el.dataset.i)] = el.value; saveSoon(); }
  if (el.dataset.act === "slabel") { p.sessions[Number(el.dataset.i)] = el.value; saveSoon(); }
});
document.addEventListener("submit", (e) => { if (e.target.id === "auth") { e.preventDefault(); submitAuth(); } });

// ---------- Verse of the moment (King James Version, public domain) ----------
const VERSES = [
  ["Thy word is a lamp unto my feet, and a light unto my path.", "Psalm 119:105"],
  ["Train up a child in the way he should go: and when he is old, he will not depart from it.", "Proverbs 22:6"],
  ["And whatsoever ye do, do it heartily, as to the Lord, and not unto men.", "Colossians 3:23"],
  ["If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.", "James 1:5"],
  ["I can do all things through Christ which strengtheneth me.", "Philippians 4:13"],
  ["Commit thy works unto the LORD, and thy thoughts shall be established.", "Proverbs 16:3"],
  ["But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.", "Isaiah 40:31"],
  ["And let us not be weary in well doing: for in due season we shall reap, if we faint not.", "Galatians 6:9"],
  ["Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.", "Proverbs 3:5-6"],
  ["Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", "Joshua 1:9"],
  ["I will instruct thee and teach thee in the way which thou shalt go: I will guide thee with mine eye.", "Psalm 32:8"],
  ["Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.", "Matthew 5:16"],
  ["Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.", "2 Timothy 2:15"],
  ["Give instruction to a wise man, and he will be yet wiser: teach a just man, and he will increase in learning.", "Proverbs 9:9"],
  ["Be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.", "1 Corinthians 15:58"],
  ["And let the beauty of the LORD our God be upon us: and establish thou the work of our hands upon us.", "Psalm 90:17"],
  ["Rejoicing in hope; patient in tribulation; continuing instant in prayer.", "Romans 12:12"],
  ["His compassions fail not. They are new every morning: great is thy faithfulness.", "Lamentations 3:22-23"],
  ["What doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?", "Micah 6:8"],
  ["The fear of the LORD is the beginning of wisdom: and the knowledge of the holy is understanding.", "Proverbs 9:10"]
];
let verseAt = Math.floor(Math.random() * VERSES.length);
function showVerse() {
  const box = document.getElementById("verse");
  if (!box) return;
  const [text, ref] = VERSES[verseAt % VERSES.length];
  if (!box.firstElementChild) box.innerHTML = '<div class="max-w-6xl mx-auto px-4 sm:px-6 py-2 text-sm flex items-start gap-2"><span aria-hidden="true">&#10013;</span><p id="verse-text" class="italic"></p></div>';
  const p = document.getElementById("verse-text");
  p.style.opacity = 0;
  setTimeout(() => { p.innerHTML = `"${esc(text)}" <span class="not-italic font-semibold">- ${esc(ref)}</span>`; p.style.opacity = 1; }, 300);
}
showVerse();
setInterval(() => { verseAt++; showVerse(); }, 15000);

// ---------- Start ----------
(async () => {
  try { state.cfg = await api("/config"); } catch { state.cfg = { app: "ILAW Assist", packs: [] }; }
  if (state.token) {
    try { state.user = (await api("/me")).user; await loadPlans(); } catch { state.user = null; }
  }
  render();
  const q = new URLSearchParams(location.search);
  if (state.user && q.get("paid")) { history.replaceState(null, "", "/"); state.view = "credits"; render(); confirmTopup(); }
  else if (q.get("topup")) { history.replaceState(null, "", "/"); toast("Top-up cancelled."); }
})();
