/*
 * Cover test suite
 * ----------------
 * Cover — which consultant covers which pod. The page had no tests at all, and every defect
 * found on 30–31 July was the same shape: a rule enforced in index.html and not here. These
 * assertions cover the things that actually went wrong, plus the hard rules the page can break.
 *
 * Rewritten 4 Aug 2026 for the SPLIT. Cover reads exactly two things (Ali):
 *     1. the consultant rota workbook on SharePoint — via the sync, which fills the cover store
 *     2. the resident rota, READ ONLY               — to show which residents sit under each pod
 * and writes exactly one: the cover store. The consultant rota's paperwork — job plans, PA
 * tariff, list skills, admins, per-consultant PINs — moved to a store of its own for a page
 * that has not been built yet, and this suite asserts it has not crept back.
 *
 * The allocation used to be wrapped in a key called consRota; in a file that holds nothing else
 * that wrapper said nothing, so days/map/fair/window/source now sit at the store's top level.
 *
 * The fixture serves two different files behind two different flows, and the suite asserts the
 * separation itself — see "The page cannot write the resident rota" below, which is the test
 * that would have caught the bug this whole refactor exists to prevent.
 *
 * Run:  node tests/cover-tests.js      (needs jsdom — npm i jsdom)
 * Exit code 0 = all pass, 1 = one or more failures.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const PAGE = path.join(__dirname, "..", "index.html");
const RESIDENT = path.join(__dirname, "resident-fixture.html");
const CORE_CSS = path.join(__dirname, "..", "core.css");
const CORE_JS = path.join(__dirname, "..", "core.js");

const LIVE = "https://rota.salford.icu/consultants.html";
const TEST = "https://alistaircranfield.github.io/pod-staging/consultants.html";

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

// ---- a small but realistic rota -------------------------------------------------------------
const MON = (() => { const d = new Date(); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d.toISOString().slice(0,10); })();
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };

function fakeConsRota() {
  const days = {};
  for (let i = 0; i < 7; i++) {
    const cur = { A:"TF", B:"MG", C:"WH", D:"AB", E:"CMAB", oncall:"NJC", cod:"CMAB", fgh:"", wkend:i>4, fin: i === 0 ? { TF:"18:00" } : {} };
    days[addDays(MON, i)] = { auto: JSON.parse(JSON.stringify(cur)), cur, note: "" };
  }
  // one day deliberately absent from consRota — the page must not fall over
  delete days[addDays(MON, 3)];
  return { days, map: { TF:"Fudge", MG:"Ghrew", WH:"Habeichi", AB:"Baiou", CMAB:"Booth", NJC:"Coffin" }, fair:{}, window:{} };
}

/* The resident board. It no longer carries consRota: that is the whole point of the separation,
   so the fixture must not quietly hand the page the thing it is supposed to have stopped using. */
function fakeRota(extra) {
  return Object.assign({
    version: 1,
    staff: [
      { id:"s1", name:"Test Consultant", grade:"CON", active:true, aliases:[] },
      { id:"s2", name:"Test Resident", grade:"ST", active:true, aliases:[] }
    ],
    weeks: { [MON]: { roster: {}, days: Array.from({length:7}, (_, di) => ({ pods:{A:{assign: di === 0 ? [{id:"s2",shift:"LD"}] : []},B:{assign:[]},C:{assign:[]},D:{assign:[]},E:{assign:[]}}, night:{AB:[],CDE:[],super:[],phone:null}, extras:[], phone:null, shadow:[] })) } },
    log: []
  }, extra || {});
}

/* The COVER store, in the shape the carve leaves behind: the allocation at the top level, one
   password, a log, and nothing else. If this fixture ever needs a jobPlans or a tariff to make
   the page work, the split has come undone and the suite should say so rather than be fixed. */
function fakeStore(extra) {
  return Object.assign({ v: "cover-1", pw: "", log: [] }, fakeConsRota(), extra || {});
}

// ---- load the page under controlled conditions ----------------------------------------------
/* opts.store === null loads the page with the cover store unreachable (COVER_READ unset), which
   is the state every browser is in until the store link has been used once. */
function loadPage({ url, testMode, keys, localKeys, resident, store }) {
  let html = fs.readFileSync(PAGE, "utf8");
  /* jsdom won't fetch external scripts, but the real page always loads core.js — and since the
     change-log reader moved in there, pretending it's absent tests a page that doesn't exist.
     Inline it so the fixture matches what a browser actually runs. */
  html = html.replace(/<script src="core\.js[^"]*"><\/script>/,
    "<script>" + fs.readFileSync(CORE_JS, "utf8") + "</script>");
  const posts = [];      // writes that reached the RESIDENT save flow — must always stay empty
  const cposts = [];     // writes that reached the COVER save flow — the URLs
  /* ...and what was actually IN them. Checking only that a write happened would have let the
     4 Aug split pass while the page went on posting job plans and PINs: the whole question is
     what the payload contains, not that there was one. postLive sends a Blob, so the body is
     kept as-is and read on demand. */
  const cbodies = [];
  const lastPayload = async () => {
    const b = cbodies[cbodies.length - 1];
    if (!b) return null;
    return JSON.parse(typeof b === "string" ? b : await b.text());
  };
  const hook = `window.__api = function(){ return {
    get data(){ return data; }, applyEdit, applySwap, postLive, rowLabel, weeksAvail,
    TESTMODE, READ, COVER_READ, COVER_SAVE,
    hasSaveKey: (typeof SAVE !== "undefined"),
    get alloc(){ return CR(); },
    get cdata(){ return cdata; }, setCdata: v => { cdata = v; },
    setJun: v => { showJun = v; }, renderRota, renderAll, setCurWeek: k => { curWeek = k; },
    renderAhead, aheadWeeks, pubUntil, PUB_WEEKS, showTab, draftOverrides, redraftDrafts,
    applyFinSwap: typeof applyFinSwap !== "undefined" ? applyFinSwap : null,
    profileFor: typeof profileFor !== "undefined" ? profileFor : null }; };`;
  html = html.replace("load().catch(", hook + "\nload().catch(");

  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url,
    beforeParse(w) {
      w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.scrollTo = () => {}; w.requestAnimationFrame = cb => setTimeout(cb, 0);
      /* jsdom ships no crypto.subtle, and the page hashes the rota-team password with it. Without
         this the password gate simply could not be exercised — which is how it went untested long
         enough for its markup to diverge from the resident board's unnoticed. Node's own WebCrypto
         is the same algorithm, so the hashes are the real ones. */
      try { Object.defineProperty(w, "crypto", { value: require("crypto").webcrypto, configurable: true }); } catch(e){}
      w.HTMLElement.prototype.scrollIntoView = () => {};
      // core.js is an external file jsdom won't fetch; it is the thing that sets this flag.
      if (testMode) w.__POD_TEST = true;
      if (keys) w.__POD_KEYS = keys;
      if (localKeys) { try { for (const k in localKeys) w.localStorage.setItem(k, localKeys[k]); } catch(e){} }
      try { w.localStorage.setItem("consEditor", "AJC"); } catch(e){}
      /* Routing matters here: "cread"/"csave" also match /read/ and /save/, so the consultant
         flows are tested for FIRST. Getting this the wrong way round would serve the resident
         board as the consultant store and hide exactly the bug the suite is looking for. */
      w.fetch = (u, opt) => {
        const target = String(u);
        const isPost = opt && String(opt.method).toUpperCase() === "POST";
        if (/csave/i.test(target)) { if (isPost) { cposts.push(target); cbodies.push(opt.body); } return Promise.resolve({ ok:true, text:()=>Promise.resolve("") }); }
        if (/cread/i.test(target)) {
          if (store === null) return Promise.reject(new Error("consultant store unreachable"));
          return Promise.resolve({ ok:true, json:()=>Promise.resolve(store || fakeStore()), text:()=>Promise.resolve("{}") });
        }
        if (/save/i.test(target)) { if (isPost) posts.push(target); return Promise.resolve({ ok:true, text:()=>Promise.resolve("") }); }
        if (/read/i.test(target)) {
          return Promise.resolve({ ok:true, json:()=>Promise.resolve(resident || fakeRota()), text:()=>Promise.resolve("{}") });
        }
        return Promise.reject(new Error("unexpected fetch: " + target));
      };
    }
  });
  return new Promise(res => setTimeout(() => res({ api: dom.window.__api && dom.window.__api(), win: dom.window, posts, cposts, lastPayload }), 700));
}

const KEYS = { r:"https://flow/read", s:"https://flow/save", cr:"https://flow/cread", cs:"https://flow/csave" };

(async () => {
  console.log("\n=== Consultant page suite ===\n");

  // 0) THE SEPARATION ---------------------------------------------------------------------
  /* This section is the reason the suite was rewritten. The consultant page used to post the
     whole of pod-data.json on every save, from a stale copy read at page load — so two people
     with the page open could silently wipe each other's resident board. The fix was not to be
     more careful about when it writes; it was to take the key away, so the write is impossible
     to express. These assertions hold that door shut. */
  console.log("The page cannot write the resident rota");
  {
    const src = fs.readFileSync(PAGE, "utf8");
    ok("the source never declares a resident SAVE key", !/\b(const|let|var)\s+SAVE\b/.test(src),
      (src.match(/\b(const|let|var)\s+SAVE\b.*/) || [""])[0]);
    ok("nothing is ever posted to SAVE", !/postLive\(\s*SAVE\b/.test(src) && !/fetch\(\s*SAVE\b/.test(src));
    const boot = await loadPage({ url: LIVE, testMode: false, keys: KEYS });
    ok("the running page has no SAVE binding at all", boot.api.hasSaveKey === false);

    // ...and behaviourally: exercise every writer on the LIVE host and watch the resident flow.
    const { api, posts, cposts } = await loadPage({ url: LIVE, testMode: false, keys: KEYS });
    /* Order matters: the finish swap trades the times held against two NAMES, so it has to run
       before the edit renames one of them, or it is a no-op and this proves nothing. */
    await api.applyFinSwap(MON, "A", "B");
    await api.applyEdit(addDays(MON, 1), "A", "ZZ");
    await api.applySwap(addDays(MON, 2), "C", "D");
    ok("after a finish swap, an edit and a pod swap the resident flow has had nothing", posts.length === 0,
      posts.length + " posts to the resident save flow");
    ok("all three writes went to the consultant store instead", cposts.length === 3, cposts.length + " posts to the cover save flow");

    // the link the admin panel builds must not hand the resident save key on either
    const linkLine = (src.match(/"#r=".*/) || [""])[0];
    ok("the shareable link carries no resident save key", !/&s=/.test(linkLine), linkLine.slice(0, 140));
  }

  console.log("The cover is read from the cover store, not the resident rota");
  {
    const { api } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    ok("the allocation resolves", !!api.alloc && !!api.alloc.days[MON]);
    ok("the cover store is where it came from", api.cdata === api.alloc);
    ok("it sits at the top level, not under a consRota wrapper", !api.cdata.consRota && !!api.cdata.days);
    ok("the resident rota is not carrying one", !api.data.consRota);

    // a stale consRota still sitting in pod-data.json must be ignored, not preferred
    const decoy = fakeConsRota(); decoy.days[MON].cur.A = "DECOY";
    const b = await loadPage({ url: TEST, testMode: true, keys: KEYS, resident: fakeRota({ consRota: decoy }) });
    ok("a leftover consRota in pod-data.json is ignored", b.api.alloc.days[MON].cur.A === "TF",
      b.api.alloc.days[MON].cur.A);
  }

  console.log("Cover holds none of the consultant rota's paperwork");
  {
    const { api, lastPayload } = await loadPage({ url: LIVE, testMode: false, keys: KEYS });
    const PAPER = ["jobPlans", "skills", "tariff", "admins", "pins", "adminPin"];
    for (const k of PAPER) ok("the store the page loaded has no " + k, api.cdata[k] === undefined);
    await api.applyEdit(addDays(MON, 1), "A", "ZZ");
    const sent = await lastPayload();
    for (const k of PAPER) ok("and nothing it writes has a " + k, sent[k] === undefined);
    ok("what it writes does hold the allocation", !!sent.days && !!sent.map);

    /* The one case where dropping keys would be worse than keeping them: a store the carve has
       not reached yet. The page must not be the thing that deletes a job plan — there is no
       undo for that and no backup unless split_stores.py made one. */
    const un = await loadPage({ url: LIVE, testMode: false, keys: KEYS,
      store: fakeStore({ jobPlans: { TF: { weeklyPA: "10" } }, adminPin: "zzz" }) });
    await un.api.applyEdit(addDays(MON, 1), "A", "ZZ");
    const kept = await un.lastPayload();
    ok("an uncarved store keeps its job plans through a save",
       kept.jobPlans && kept.jobPlans.TF.weeklyPA === "10");
  }

  console.log("With no consultant store connected the page changes nothing");
  {
    const { api, posts, cposts } = await loadPage({ url: LIVE, testMode: false, keys: { r: KEYS.r }, store: null });
    ok("the page still loads the resident data", !!api.data && !!api.data.staff);
    ok("there is no allocation to show", !api.alloc || !api.alloc.days);
    const before = JSON.stringify(api.cdata);
    await api.applyEdit(MON, "A", "ZZ");
    ok("an edit is refused rather than half-applied", JSON.stringify(api.cdata) === before);
    ok("and nothing was posted anywhere", posts.length === 0 && cposts.length === 0,
      posts.length + " resident, " + cposts.length + " consultant");
  }

  // 1) THE WRITE GATE ---------------------------------------------------------------------
  console.log("Never writes to the live rota from a test host");
  {
    const { api, posts, cposts } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    ok("page booted in test mode", api && api.TESTMODE === true, "TESTMODE=" + (api && api.TESTMODE));
    const day = addDays(MON, 0);
    await api.applyEdit(day, "A", "ZZ");
    ok("an edit posts nothing to either save flow", posts.length === 0 && cposts.length === 0,
      posts.length + " resident, " + cposts.length + " consultant");
    await api.applySwap(day, "A", "B");
    ok("a swap posts nothing to either save flow", posts.length === 0 && cposts.length === 0,
      posts.length + " resident, " + cposts.length + " consultant");
    ok("the edit still took effect locally", api.alloc.days[day].cur.A !== "TF");
  }

  // 2) ...but it DOES write when it is the live site --------------------------------------
  console.log("Writes normally on the live host");
  {
    const { api, posts, cposts } = await loadPage({ url: LIVE, testMode: false, keys: KEYS });
    ok("page booted in live mode", api && api.TESTMODE === false, "TESTMODE=" + (api && api.TESTMODE));
    await api.applyEdit(addDays(MON, 0), "A", "ZZ");
    ok("an edit posts exactly once to the consultant save flow", cposts.length === 1, cposts.length + " posts");
    ok("and never to the resident one", posts.length === 0, posts.length + " posts");
  }

  // 3) HARD RULE 7 — a swap exchanges two people, it never introduces a third --------------
  console.log("Hard rule 7 — nothing is added to a shift after the four-monthly write");
  {
    const { api } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    const day = addDays(MON, 0);
    const before = Object.assign({}, api.alloc.days[day].cur);
    const peopleBefore = ["A","B","C","D","E","oncall","cod"].map(k => before[k]).filter(Boolean).sort().join(",");
    await api.applySwap(day, "A", "B");
    const after = api.alloc.days[day].cur;
    const peopleAfter = ["A","B","C","D","E","oncall","cod"].map(k => after[k]).filter(Boolean).sort().join(",");
    ok("the same people are on the day after a swap", peopleBefore === peopleAfter, peopleBefore + " → " + peopleAfter);
    ok("the two pods actually exchanged", after.A === before.B && after.B === before.A);
    await api.applySwap(day, "A", "A");
    ok("swapping a pod with itself does nothing", api.alloc.days[day].cur.A === after.A);
  }

  // 4) HARD RULE 3 — everything logged -----------------------------------------------------
  /* The log moved into the consultant store with everything else. That is not just tidiness:
     while the log lived in the file the page was overwriting, a lost update erased the evidence
     of itself. It is also displayed for the first time — eight call sites wrote to it and no
     screen showed it. */
  console.log("Hard rule 3 — every change is logged, in the consultant store");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    const day = addDays(MON, 1);
    const n0 = api.cdata.log.length;
    /* An edit into an EMPTY pod is one row; replacing somebody is two, the arrival and the
       departure, so that neither consultant vanishes with only a sentence to say so (6 Aug).
       Read before the edit, because the edit is what changes it. */
    const wasOccupied = !!(api.alloc.days[day] && api.alloc.days[day].cur.C);
    await api.applyEdit(day, "C", "QQ");
    ok("an edit adds a log entry", api.cdata.log.length === n0 + (wasOccupied ? 2 : 1),
      (api.cdata.log.length - n0) + " added, pod was " + (wasOccupied ? "occupied" : "empty"));
    ok("the resident board's log is untouched", api.data.log.length === 0, api.data.log.length + " entries");
    const e = api.cdata.log[0] || {};
    ok("the entry names who made it", /AJC/.test(e.who || ""), JSON.stringify(e.who));
    /* The message is prose now and the DATE lives in `on`, which is what the page groups by —
       putting an ISO date in the sentence as well just repeated it in every row. */
    ok("the entry names the day and the change",
      e.on === day && (e.msg || "").includes("QQ"), JSON.stringify([e.on, e.msg]));
    ok("and carries the pod it moved to, as structured detail",
      !!e.d && e.d.act === "move" && e.d.to === "C", JSON.stringify(e.d));
    const n1 = api.cdata.log.length;
    await api.applySwap(day, "A", "B");
    ok("a swap adds its own log entry — one per person", api.cdata.log.length === n1 + 2,
      (api.cdata.log.length - n1) + " added");
    ok("an edit that changes nothing is not logged", await (async () => {
      const before = api.cdata.log.length;
      await api.applyEdit(day, "C", "QQ");            // same value again
      return api.cdata.log.length === before;
    })());
    api.renderAll();
    ok("the Log tab shows the entries", /QQ/.test(win.document.querySelector("#logBox").textContent),
      win.document.querySelector("#logBox").textContent.slice(0, 80));
    // the store must not grow without bound
    api.cdata.log = Array.from({length: 300}, (_, i) => ({ t:new Date().toISOString(), who:"AJC", msg:"consultant filler " + i }));
    await api.applyEdit(day, "C", "RR");
    ok("the log is capped at 300 entries", api.cdata.log.length === 300, api.cdata.log.length + " entries");
    ok("and it is the newest that survives", /RR/.test(api.cdata.log[0].msg), api.cdata.log[0].msg);
  }

  // 5) KEY RESOLUTION — the reason the page was blank on staging ---------------------------
  console.log("Key resolution");
  {
    const a = await loadPage({ url: TEST, testMode: true, keys: null,
      localKeys: { podR:"https://flow/read", podCR:"https://flow/cread", podCS:"https://flow/csave" } });
    ok("falls back to the keys cached in this browser", !!(a.api && a.api.READ), "READ=" + (a.api && a.api.READ));
    ok("and loads its data with them", !!(a.api && a.api.data && a.api.data.staff), "data " + (a.api && a.api.data ? "loaded" : "missing"));
    ok("including the cover store", !!(a.api && a.api.alloc && a.api.alloc.days));

    const b = await loadPage({ url: TEST, testMode: true, keys: KEYS, localKeys: { podR:"https://flow/WRONG" } });
    ok("k.js beats the cached copy", b.api.READ === KEYS.r, b.api.READ);
  }

  // 6) DOESN'T FALL OVER ON A GAP ----------------------------------------------------------
  console.log("Robustness");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    const missing = addDays(MON, 3);                  // deliberately absent from the allocation
    ok("a day with no cover does not throw", !api.alloc.days[missing]);
    let threw = null;
    try { await api.applySwap(missing, "A", "B"); } catch(e){ threw = e.message; }
    ok("swapping on a missing day is a no-op, not a crash", threw === null, threw);
    ok("the week grid rendered", !!win.document.querySelector("#weekGrid"));
  }

  // 7) STRUCTURAL — the shared files stay shared -------------------------------------------

  console.log("Finish-time pill (job b)");
  {
    const { api, win, posts, cposts } = await loadPage({ url: LIVE, testMode: false, keys: KEYS });
    const pill = win.document.querySelector("#weekGrid .finpill");
    ok("an 18:00 finish is a pill in the cell", !!pill, "no .finpill");
    ok("the pill is draggable like COD", !!pill && pill.getAttribute("draggable") === "true");
    ok("17:00 finishes are not drawn at all", win.document.querySelectorAll("#weekGrid .finpill").length === 1,
      win.document.querySelectorAll("#weekGrid .finpill").length + " pills");
    ok("initials lead every cell at the shared inset — no badge slot before them",
      [...win.document.querySelectorAll("#weekGrid td[data-pod] .cellwrap")].every(w => w.firstElementChild && w.firstElementChild.classList.contains("cell")));
    const codGhost = win.document.querySelector("#weekGrid .codpill");
    ok("COD is a ghost pill after the name, still draggable", !!codGhost &&
      codGhost.previousElementSibling && codGhost.previousElementSibling.classList.contains("cell") &&
      codGhost.getAttribute("draggable") === "true");
    ok("applyFinSwap exists", typeof api.applyFinSwap === "function");
    if (typeof api.applyFinSwap === "function") {
      const day = MON;
      const before = JSON.parse(JSON.stringify(api.alloc.days[day].cur));
      const n0 = cposts.length, l0 = api.cdata.log.length;
      await api.applyFinSwap(day, "A", "B");
      const after = api.alloc.days[day].cur;
      ok("a fin swap moves the finish time, not the people",
        after.A === before.A && after.B === before.B && (after.fin.MG || "") === "18:00" && !(after.fin.TF),
        JSON.stringify(after.fin));
      ok("a fin swap saves once to the consultant store and is logged",
        cposts.length === n0 + 1 && api.cdata.log.length === l0 + 1,
        (cposts.length - n0) + " posts, " + (api.cdata.log.length - l0) + " log entries");
      ok("and still nothing to the resident board", posts.length === 0, posts.length + " posts");
      const l1 = api.cdata.log.length;
      await api.applyFinSwap(day, "A", "fgh");   // nobody on Fairfield that day
      ok("a fin swap onto an empty slot is a no-op", api.cdata.log.length === l1);
    }
  }

  console.log("Hover card (job c)");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    ok("profileFor exists", typeof api.profileFor === "function");
    if (typeof api.profileFor === "function") {
      api.cdata.profiles = { s2: { about: "Keen on echo", supervisor: "TF" } };
      const p = api.profileFor("s2");
      ok("profileFor merges the staff record with the stored profile",
        !!p && p.name === "Test Resident" && p.grade === "ST" && p.about === "Keen on echo",
        JSON.stringify(p));
      ok("the educational supervisor is resolved to a name, not initials", !!p && /Fudge/.test(p.supervisorName || ""), p && p.supervisorName);
      api.setJun(true); api.renderRota();
      const pill = win.document.querySelector("#weekGrid .rpill[data-rid='s2']");
      ok("a resident pill carries its profile hook", !!pill, "no .rpill[data-rid]");
      if (pill) {
        pill.dispatchEvent(new win.Event("mouseenter", { bubbles: false }));
        const card = win.document.querySelector("#hovercard");
        ok("hovering shows the card with the resident's details",
          !!card && card.style.display !== "none" && /Test Resident/.test(card.textContent) && /Keen on echo/.test(card.textContent),
          card ? card.textContent.slice(0, 80) : "no card");
        pill.dispatchEvent(new win.Event("mouseleave", { bubbles: false }));
        ok("leaving hides it", card.style.display === "none");
      }
    }
  }

  console.log("Shield + rota-team gate (job f)");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    ok("the rail carries only Pods and the resident shield",
      !!win.document.querySelector("aside #btnTeam") &&
      !win.document.querySelector("aside button[data-tab='fair']") &&
      !win.document.querySelector("aside button[data-tab='log']") &&
      !win.document.querySelector("aside button[data-tab='admin']"));
    // no password set: the shield opens the inset menu straight onto Fairness
    win.document.querySelector("#btnTeam").click();
    /* Four items now, and the shield lands on Look ahead rather than Fairness (Ali, 6 Aug):
       what's coming up is the question the rota team opens the shield to answer. */
    ok("no password set: shield opens the inset menu",
      win.document.body.classList.contains("teamopen") &&
      win.document.querySelectorAll("#teamPanel .tpi").length === 4 &&
      win.document.querySelector("#tab-ahead").style.display !== "none" &&
      win.document.querySelector("#tab-fair").style.display === "none");
    win.document.querySelector("#tpBack").click();
    ok("Menu goes back to Pods", !win.document.body.classList.contains("teamopen") &&
      win.document.querySelector("#tab-rota").style.display !== "none");
    // with the rota-team password set, the shield asks for it first
    api.data.staffPw = "0123456789abcdef";
    win.sessionStorage.removeItem("consTeamUnlocked");
    win.document.querySelector("#btnTeam").click();
    /* The lock is a PAGE now, not a floating dialog — the resident board's pattern (Ali, 6 Aug).
       So the test asks what a person would see: the pane is the password box, the team menu is
       not there behind it, and there is no modal to dismiss. */
    ok("password set: the shield shows the gate, not the menu",
      win.document.body.classList.contains("teamlocked") &&
      win.document.querySelector("#tab-lock").style.display !== "none" &&
      !win.document.body.classList.contains("teamopen"));
    ok("the lock is a page, not a floating dialog", !win.document.querySelector("#whoOverlay"));
    ok("and every team page stays hidden behind it",
      ["ahead","fair","log","setup"].every(t => win.document.querySelector("#tab-" + t).style.display === "none"));
    /* It does not offer to SET or RESET the password: data.staffPw belongs to the resident board,
       and a second place to change one password is how two passwords appear. */
    ok("it does not offer to set or reset the password — that lives on the resident board",
      !win.document.querySelector("#lockReset") && /Unlock/.test(win.document.querySelector("#lockBtn").textContent));
    const lp = win.document.querySelector("#lockPw");
    lp.value = "nope"; win.document.querySelector("#lockBtn").click();
    await new Promise(r => setTimeout(r, 10));
    ok("a wrong password says so and keeps the door shut",
      /Wrong/.test(win.document.querySelector("#lockMsg").textContent) &&
      win.document.body.classList.contains("teamlocked"));
  }

  console.log("Four-week publication window");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    const far = addDays(MON, 42);                                      // six weeks out
    const full = { A:"TF",B:"MG",C:"WH",D:"AB",E:"CMAB",oncall:"NJC",cod:"CMAB",fgh:"",wkend:false,fin:{} };
    const put = d => { api.alloc.days[d] = { auto: Object.assign({}, full), cur: Object.assign({}, full) }; };
    put(far);
    api.data.staffPw = "0123456789abcdef";                             // a password exists, viewer not unlocked
    win.sessionStorage.removeItem("consTeamUnlocked");
    api.setCurWeek(addDays(MON, 42)); api.renderRota();
    const txt = win.document.querySelector("td[data-pod='A'][data-date='" + far + "']");
    ok("beyond four weeks the grid shows nothing, even when data exists",
      !!txt && !/TF/.test(txt.textContent) && /—/.test(txt.textContent), txt && txt.textContent.trim());
    ok("unpublished cells are not editable", !txt.querySelector(".cell[data-d]"));
    win.sessionStorage.setItem("consTeamUnlocked", "1"); api.renderRota();
    ok("the rota team sees the whole horizon once through the shield",
      /TF/.test(win.document.querySelector("td[data-pod='A'][data-date='" + far + "']").textContent));
    win.sessionStorage.removeItem("consTeamUnlocked");
    api.setCurWeek(MON); api.renderRota();
    ok("inside four weeks the grid shows the allocation",
      /TF/.test(win.document.querySelector("td[data-pod='A'][data-date='" + MON + "']").textContent));

    /* WEEK-ALIGNED, not rolling (Ali, 6 Aug). The edge is the SUNDAY of week+3 whatever day the
       suite is run on — which is the point: a rolling today+28 drew the fourth week half in
       names and half in dashes, and moved the edge every day. These two assertions are the
       whole rule, and they are deliberately written against MON rather than against today, so
       running the suite on a Friday tests the same boundary as running it on a Monday. */
    ok("the published edge is the Sunday of week+3, not today+28",
      api.pubUntil() === addDays(MON, 27), api.pubUntil() + " vs " + addDays(MON, 27));
    ok("four whole weeks are published", api.PUB_WEEKS === 4);
    put(addDays(MON, 27)); put(addDays(MON, 28));
    api.setCurWeek(addDays(MON, 21)); api.renderRota();
    ok("the last published week is drawn to its Sunday — no half-dashed week",
      /TF/.test(win.document.querySelector("td[data-pod='A'][data-date='" + addDays(MON, 27) + "']").textContent));
    api.setCurWeek(addDays(MON, 28)); api.renderRota();
    ok("the Monday after the edge is not published",
      /—/.test(win.document.querySelector("td[data-pod='A'][data-date='" + addDays(MON, 28) + "']").textContent));
  }

  console.log("Look ahead — the rota team's view past the edge");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    const full = { A:"TF",B:"MG",C:"WH",D:"AB",E:"CMAB",oncall:"NJC",cod:"CMAB",fgh:"",wkend:false,fin:{} };
    for (let i = 0; i < 77; i++)                                       // eleven weeks in the store
      api.alloc.days[addDays(MON, i)] = { auto: Object.assign({}, full), cur: Object.assign({}, full) };
    api.data.staffPw = "0123456789abcdef";
    win.sessionStorage.setItem("consTeamUnlocked", "1");

    /* The bug this page exists for. weeksAvail() reads data.weeks — the RESIDENT rota — and the
       fixture holds exactly one week of it, the same shape as the real thing where the resident
       rota is published far less far ahead than the consultant workbook reaches. An admin who
       unlocked the shield could still not page past it. Look ahead takes its weeks from the
       COVER store instead, so it reaches everything the allocator has actually allocated. */
    ok("the resident rota bounds the Pods week arrows to one week here",
      api.weeksAvail().length === 1, api.weeksAvail().length + " resident week(s)");
    ok("Look ahead reads its weeks from the cover store, not the resident rota",
      api.aheadWeeks().length === 11, api.aheadWeeks().length + " weeks");
    ok("it starts at this Monday", api.aheadWeeks()[0] === MON);

    api.showTab("ahead");
    const box = win.document.querySelector("#aheadBox");
    ok("a week table per week", box.querySelectorAll("table.rota").length === 11,
      box.querySelectorAll("table.rota").length + " tables");
    ok("the first four weeks are marked published",
      box.querySelectorAll(".ahchip.pub").length === 4,
      box.querySelectorAll(".ahchip.pub").length + " published");
    ok("the rest are marked draft, so nobody mistakes one for a promise",
      box.querySelectorAll(".ahchip:not(.pub)").length === 7,
      box.querySelectorAll(".ahchip:not(.pub)").length + " draft");
    ok("it says how far the rota actually reaches",
      /reaches/.test(box.textContent) && /11 weeks/.test(box.textContent));

    /* Editable, like the Pods grid — and by exactly the same code, which is what this asserts:
       a cell you can click and a badge you can pick up, in a week beyond the published edge. */
    const draftDay = addDays(MON, 56);
    const cell = box.querySelector("td[data-pod='A'][data-date='" + draftDay + "'] .cell[data-d]");
    ok("draft weeks are editable, not a read-only preview", !!cell && cell.dataset.k === "A");
    ok("and carry the same drag handles as the Pods grid",
      !!box.querySelector("td[data-pod='A'][data-date='" + draftDay + "'] .cell[draggable='true']"));

    /* Re-running the algorithm on the draft weeks. The button releases hand-made placements past
       the published edge so the nightly sync can reallocate them — a hand-edit makes `cur` differ
       from `auto` and the sync then leaves that day alone for ever, which silently freezes a draft
       week nobody has even seen. */
    ok("with nothing held by hand the button is offered but disabled",
      win.document.querySelector("#btnRedraft").disabled === true);
    api.alloc.days[draftDay].cur.A = "ZZ";                       // a hand edit in a draft week
    const pubDay = addDays(MON, 3);                              // ...and one in a PUBLISHED week
    api.alloc.days[pubDay].cur.A = "ZZ";
    api.renderAhead();
    ok("a hand-made draft placement enables it",
      win.document.querySelector("#btnRedraft").disabled === false);
    ok("and it counts the draft one only, never the published one",
      api.draftOverrides().length === 1 && api.draftOverrides()[0].d === draftDay,
      JSON.stringify(api.draftOverrides()));

    win.confirm = () => true;
    win.localStorage.setItem("consEditor", "TF");
    await api.redraftDrafts();
    ok("running it puts the draft day back to what the algorithm said",
      api.alloc.days[draftDay].cur.A === api.alloc.days[draftDay].auto.A);
    ok("the published week is left exactly alone", api.alloc.days[pubDay].cur.A === "ZZ");
    ok("it is logged once, as a person's decision, not once per placement",
      api.cdata.log[0].kind === "manual" && /handed back to the algorithm/.test(api.cdata.log[0].msg),
      api.cdata.log[0] && api.cdata.log[0].msg);

    /* A viewer who never got through the shield must not be able to reach this by any route. */
    win.sessionStorage.removeItem("consTeamUnlocked");
    api.renderAhead();
    ok("locked out, Look ahead shows no names either",
      !/TF/.test(win.document.querySelector("#aheadBox td[data-pod='A'][data-date='" + draftDay + "']").textContent));
  }

  console.log("The change log is drawn by the shared code, and styled for it");
  {
    /* Ali, 6 Aug: "the change log looks truly terrible on the live one". The FUNCTION was already
       shared — both pages call logPanel() out of core.js. What had drifted was this page's CSS,
       and it had drifted onto selectors the shared code no longer emits, so the log rendered
       essentially unstyled. These assertions are against the stylesheet rather than the render,
       because that is where the fault was and where it would come back. */
    /* Comments stripped first. The note explaining this fix necessarily QUOTES the broken rule it
       replaced, and without this the suite reads that quotation as the rule still being there —
       which it promptly did. A test that cannot tell code from prose about code is worse than no
       test, because it fails loudest exactly when someone has documented their reasoning. */
    /* WHAT THIS BLOCK IS ACTUALLY TESTING, restated 6 Aug after Ali pulled me up on it:
       "Parity has nothing to do with the residents page." He is right. Cover and the resident
       board share core.js and core.css and NOTHING else — the read-only resident rota is there to
       overlay residents onto pods and has no bearing on any of this. So an assertion of the form
       "Cover still has the same CSS rule the resident page has" is testing a relationship that
       does not exist, and it was doing real harm: it compared against tests/resident-fixture.html,
       a frozen snapshot already 100KB out of date, so it could pass while the thing it claimed to
       check was false.
       The contract that DOES exist is between the shared renderer and the stylesheet. logPanel()
       emits a fixed set of class names; something must style them; and after 6 Aug that something
       is core.css, where the renderer lives. These assertions read the class names out of core.js
       itself, so they cannot drift from what is actually emitted. */
    const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, "");
    const css = decomment(fs.readFileSync(PAGE, "utf8"));
    const corecss = decomment(fs.readFileSync(CORE_CSS, "utf8"));
    const corejs = fs.readFileSync(CORE_JS, "utf8");

    ok("the log is drawn by core.js's logPanel, not a second copy here",
      /logPanel\(/.test(css) && !/function logPanel/.test(css));

    /* Derived from the source, not typed here — a hand-written list is the same duplication one
       level up, and would go stale the same way the stylesheet did. */
    const emitted = new Set();
    for (const m of corejs.matchAll(/(?:class: *"|className *= *")([a-z][a-zA-Z -]*)"/g))
      m[1].split(/\s+/).forEach(c => c && emitted.add(c));
    for (const c of ["logrow", "loghead", "logfrom"]) {
      ok("core.js still emits ." + c + " — the class these rules are written for", emitted.has(c));
      ok("core.css styles ." + c + ", so the renderer's markup is never unstyled",
        new RegExp("\\." + c + "[ .:{,]").test(corecss));
    }

    /* The three that had drifted. Each was a selector pointing at markup core.js no longer emits,
       so the rule simply never applied — and the worst of them applied a flex layout to a <tr>,
       throwing away every column width the shared code sets. */
    ok("logrow is not forced to flex — it is a table row",
      !/\.logrow\{[^}]*display:flex/.test(corecss + css));
    ok("the timestamp rule targets .t, and the stale .lt is gone",
      /\.logrow \.t\{/.test(corecss) && !/\.logrow \.lt\{/.test(corecss + css));
    /* The count in a day heading: core.js appends a bare <span>, so a rule keyed on <b> — which
       is what this page had — could never apply. Asserted against core.js so that if the renderer
       ever changes the element, this fails rather than the styling silently vanishing again. */
    ok("the day-heading count is a span in core.js, and the rule says span",
      /\.loghead span\{/.test(corecss) && !/\.loghead b\{/.test(corecss + css) &&
      /class: *"loghead" *\}[\s\S]{0,120}?__el\("span"/.test(corejs));

    /* The page keeps ONLY what its own container needs. If a bare .logrow reappears here, the
       shared rules are being duplicated back into the page and the drift is starting again. */
    ok("the page no longer carries the shared log rules itself",
      !/^\.logrow\{/m.test(css) && !/^\.loghead\{/m.test(css));
    ok("what it does keep is scoped to its own container",
      /#logBox \.empty\{/.test(css) && /#logBox tr\{display:grid/.test(css) && !/^\.empty\{/m.test(css));
    ok("dead selectors for controls that no longer exist are gone",
      !/\.segbtn\{/.test(css) && !/\.logbar\{/.test(css));
    ok("the Menu back button is hidden by default and revealed only on a phone",
      /\.tpback\{display:none/.test(css) && /\.tpback\{display:flex\}/.test(css) &&
      css.indexOf(".tpback{display:flex}") > css.indexOf("@media(max-width:760px)"));
  }

  console.log("The log carries STRUCTURED detail, so it draws pods not sentences");
  {
    /* Ali, 6 Aug: "nice coloured pod letter styling and things missing." The columns were empty
       because nothing this page wrote carried `d` — core.js falls back to parsing the message
       text with regexes written for the RESIDENT board's phrasings, which ours never matched, and
       every row landed in the "one wide cell, no invented columns" branch. No amount of CSS could
       have fixed that, which is why matching the stylesheet three times did not. */
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    win.localStorage.setItem("consEditor", "TF");
    const day = addDays(MON, 1);

    await api.applySwap(day, "A", "B");
    const sw = api.cdata.log.slice(0, 2);
    ok("a pod swap writes one row per person, not one row for the pair", sw.length === 2 &&
      sw[0].d && sw[1].d && sw[0].d.subj !== sw[1].d.subj, JSON.stringify(sw.map(e => e.d)));
    ok("each carries the pods it moved between",
      sw.every(e => e.d.act === "move" && "ABCDE".includes(e.d.from) && "ABCDE".includes(e.d.to)),
      JSON.stringify(sw.map(e => e.d)));
    ok("and they are genuinely the two halves of one swap",
      sw[0].d.from === sw[1].d.to && sw[0].d.to === sw[1].d.from);

    await api.applyEdit(day, "C", "ZZ");
    const ed = api.cdata.log.slice(0, 2);
    ok("replacing a consultant logs BOTH the arrival and the departure", ed.length === 2 &&
      ed.some(e => e.d && e.d.to === "C") && ed.some(e => e.d && e.d.from === "C"),
      JSON.stringify(ed.map(e => e.d)));

    /* A COD handover moves no one between pods, so it must NOT invent a From and a To. */
    await api.applyEdit(day, "cod", "ZZ");
    ok("a COD handover stays a plain sentence — no invented pod columns", !api.cdata.log[0].d);

    /* The point of all of it: the rendered row carries pod chips, not an empty column. */
    win.renderLog();
    const chips = [...win.document.querySelectorAll("#logBox tr.logrow td")]
      .flatMap(td => [...td.querySelectorAll("span")])
      .filter(s => /^[A-E]$/.test(s.textContent.trim()) && /background:/.test(s.getAttribute("style") || ""));
    ok("the log now renders coloured pod letters", chips.length > 0, chips.length + " pod chips");
    ok("the Person column is filled in, not blank",
      [...win.document.querySelectorAll("#logBox tr.logrow")]
        .some(r => (r.children[1] || {}).textContent && r.children[1].textContent.trim().length > 0));
    ok("a From cell that has a pod in it gets the arrow hook",
      !!win.document.querySelector("#logBox td.logfrom"));
  }

  console.log("Combined fairness page");
  {
    const { win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    ok("the Totals tab is gone — one combined page", !win.document.querySelector("#tab-staff") && !win.document.querySelector("aside button[data-tab='staff']"));
    const heads = [...win.document.querySelectorAll("#fairBox table.fair th")].map(x => x.textContent.trim());
    ok("fairness table carries A&B, C&D, % neuro AND the staffing counts",
      ["A&B","C&D","% neuro","Pods/wk","On call","COD","Fairfield"].every(k => heads.some(hh => hh.includes(k))), heads.join(" | "));
    ok("it wears the resident table's colour language", !!win.document.querySelector("#fairBox .dot"));
    /* There used to be a "My figures" button on every row, opening a per-consultant PIN gate
       onto that person's job plan. Job plans are the Consultant Rota's, not Cover's, and they
       left with the rest of the paperwork on 4 Aug — so the button must be gone, and the page
       must no longer carry the PIN machinery behind it. Fairness itself stays: it is about
       pod balance, which is exactly what Cover decides. */
    ok("no My figures button — job plans are the Consultant Rota's",
       !win.document.querySelector("#fairBox .mybtn"));
    ok("and the per-consultant PIN gate has gone with it",
       !/function myFigures|cdata\.pins/.test(fs.readFileSync(PAGE, "utf8")));
    /* Including the styling. A dead CSS class is how a removed feature comes back: someone
       finds .mybtn, assumes it is used, and wires a button to it. */
    ok("and its styling too", !/mybtn/.test(fs.readFileSync(PAGE, "utf8")));
  }

  console.log("Transposed grid (job d)");
  {
    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    const ths = [...win.document.querySelectorAll("#weekGrid table.rota tr:first-child th")].map(x => x.textContent.trim());
    ok("pods run across the top", ["A","B","C","D","E"].every(p => ths.some(h => h.startsWith("Pod " + p))), ths.join(" | "));
    const podth = win.document.querySelector("#weekGrid th.podth");
    ok("each pod column wears the resident board's solid colour bar",
      !!podth && /var\(--pod[A-E]b\)/.test(podth.getAttribute("style") || ""), podth && podth.getAttribute("style"));
    const a = win.document.querySelector("td[data-pod='A'][data-date='" + MON + "']");
    const e = win.document.querySelector("td[data-pod='E'][data-date='" + MON + "']");
    ok("a day is one row with every pod on it", !!a && !!e && a.parentElement === e.parentElement);
    api.setJun(true); api.renderRota();
    const a2 = win.document.querySelector("td[data-pod='A'][data-date='" + MON + "']");
    ok("residents sit inside their pod's cell when shown", !!a2 && !!a2.querySelector(".rpill"),
      a2 ? a2.innerHTML.slice(0, 120) : "no cell");
  }

  console.log("Shared code stays shared");
  {
    const cons = fs.readFileSync(PAGE, "utf8");
    const res = fs.readFileSync(RESIDENT, "utf8");
    const core = fs.existsSync(CORE_CSS) ? fs.readFileSync(CORE_CSS, "utf8") : "";
    ok("core.css defines the pod palette", /--podA:/.test(core));
    ok("the consultant page does not redefine it", !/--podA:/.test(cons));
    ok("the resident page does not redefine it", !/--podA:/.test(res));
    ok("both pages load core.css", /core\.css/.test(cons) && /core\.css/.test(res));
    ok("both pages load core.js", /core\.js/.test(cons) && /core\.js/.test(res));
    ok("no raw fetch to a save flow outside postLive", (cons.match(/fetch\(\s*C?SAVE/g) || []).length === 0,
       (cons.match(/fetch\(\s*C?SAVE/g) || []).join(", "));
  }

  /* ── The change log ────────────────────────────────────────────────────────────────────────
     Two things are being protected here. First, that an entry says WHEN it was made, WHICH rota
     day it changed, and WHO decided — three separate facts that used to be one. Second, that the
     months of entries written before any of that existed still read correctly and are never
     rewritten. A migration that quietly restamps history would be worse than the original gap. */
  console.log("The change log — one shape, read two ways");
  {
    const core = fs.readFileSync(CORE_JS, "utf8");
    const sandbox = { window: {}, document: { addEventListener(){} }, location: { protocol: "https:", hostname: "x" } };
    /* Missing readers must show up as failed assertions, not as a crashed suite — a suite that
       dies on the first gap tells you nothing about the other twenty. */
    try {
      new Function("window", "document", "location",
        core + "\nwindow.__log = { groupLog, logKind, logOn, logMade, logDayLabel };")
        (sandbox.window, sandbox.document, sandbox.location);
    } catch (e) { /* reported by every assertion below */ }
    const miss = () => { throw new Error("core.js has no change-log reader"); };
    const L = sandbox.window.__log ||
      { groupLog: miss, logKind: miss, logOn: miss, logMade: miss, logDayLabel: miss };
    /* Any reader that is absent throws; catch it once here so the whole section reports as
       failures. Proven to have teeth by running this file against the pre-change build. */
    const guard = (f, empty) => function(){ try { return f.apply(null, arguments); } catch (e) { return empty; } };
    L.groupLog = guard(L.groupLog, []);
    ["logKind","logOn","logMade","logDayLabel"].forEach(k => L[k] = guard(L[k], "MISSING"));

    const entries = [
      { t: "2026-08-03T09:00:00.000Z", who: "Ali",  msg: "moved someone",  kind: "manual", on: "2026-08-11" },
      { t: "2026-08-03T08:30:00.000Z", who: "sync", msg: "Optima sync",    kind: "auto",   on: "2026-08-04" },
      { t: "2026-08-02T17:00:00.000Z", who: "Ali",  msg: "password set",   kind: "manual", on: null },
      { t: "2026-07-30T11:00:00.000Z", who: "Nick", msg: "written before kind and on existed" }
    ];
    const legacy = entries[3];

    ok("an entry with no kind reads as a person's decision", L.logKind(legacy) === "manual");
    ok("an entry with no rota date falls back to when it was made", L.logOn(legacy) === "2026-07-30");
    ok("reading an old entry does not change it",
      !("kind" in legacy) && !("on" in legacy), JSON.stringify(legacy));
    ok("when and which-day are genuinely different facts",
      L.logMade(entries[0]) === "2026-08-03" && L.logOn(entries[0]) === "2026-08-11");

    const made = L.groupLog(entries, "made", "all");
    ok("grouped by when changed: newest day first",
      made.map(g => g.date).join(",") === "2026-08-03,2026-08-02,2026-07-30", made.map(g => g.date).join(","));
    ok("two changes made on the same day sit in one group", !!made[0] && made[0].entries.length === 2);

    const aff = L.groupLog(entries, "affects", "all");
    ok("grouped by rota day: the day affected, not the day changed",
      aff.map(g => g.date).join(",") === "2026-08-11,2026-08-04,2026-08-02,2026-07-30",
      aff.map(g => g.date).join(","));
    ok("an undated change falls back to the day it was made (Ali, 3 Aug)",
      aff.some(g => g.date === "2026-08-02" && g.entries[0].msg === "password set"));

    ok("filter: automatic shows only the software's changes",
      L.groupLog(entries, "made", "auto").reduce((n, g) => n + g.entries.length, 0) === 1);
    ok("filter: manual shows the rest, old entries included",
      L.groupLog(entries, "made", "manual").reduce((n, g) => n + g.entries.length, 0) === 3);
    ok("filter: all shows everything", L.groupLog(entries, "made", "all")
      .reduce((n, g) => n + g.entries.length, 0) === 4);
    ok("nothing in, nothing out — no crash on an empty log", L.groupLog([], "made", "all").length === 0);
    ok("a null entry in the list is skipped, not thrown on",
      L.groupLog([null, entries[0]], "made", "all").length === 1);
    ok("today and yesterday are named, older days are dated",
      L.logDayLabel("2026-08-03", "2026-08-03") === "Today" &&
      L.logDayLabel("2026-08-02", "2026-08-03") === "Yesterday" &&
      /July/.test(L.logDayLabel("2026-07-30", "2026-08-03")));

    // ---- the page itself ----
    const cons = fs.readFileSync(PAGE, "utf8");
    ok("every writer goes through clog — no entry is built by hand any more",
      (cons.match(/cdata\.log\.unshift/g) || []).length === 1,
      (cons.match(/cdata\.log\.unshift/g) || []).length + " inline writers");
    ok("the Log tab no longer guesses by pattern-matching the message text",
      !/\/consultant\|on call\/i\.test/.test(cons));

    const { api, win } = await loadPage({ url: TEST, testMode: true, keys: KEYS });
    api.setCdata(Object.assign(api.cdata || {}, { log: entries.slice() }));
    win.renderLog();
    const heads = [...win.document.querySelectorAll("#logBox .loghead")].map(h => h.textContent);
    ok("the log renders grouped, with a count on each day", heads.length === 3 && /2$/.test(heads[0]), heads.join(" | "));
    /* These four were written against segmented buttons and went stale when the controls became
       dropdowns (Ali, 3 Aug: "Dropdown options for changelog"). They had been failing quietly
       ever since — a test that describes a UI nobody built is worse than no test, because the
       red is dismissed on sight. Rewritten 4 Aug against what is actually on the page. */
    const sels = [...win.document.querySelectorAll("#logBox select")];
    ok("both controls are on the page and neither needs a sentence to explain it",
      sels.length === 2 && sels.reduce((n, s2) => n + s2.options.length, 0) === 5,
      sels.length + " controls, " + sels.reduce((n, s2) => n + s2.options.length, 0) + " options");
    ok("the software's own changes are marked apart from a person's",
      win.document.querySelectorAll("#logBox .logrow.auto").length === 1);
    /* EVERY row, not some. Grouped by when the change was made, each row leads with the rota
       day it affects — including the pre-2 Aug entry that never recorded one, which falls back
       to the day it was made rather than showing a blank. If this ever drops below the row
       count, some rows are carrying a date the reader cannot see. */
    ok("the date NOT being grouped on is shown on every row, so both are always visible",
      win.document.querySelectorAll("#logBox tr.logrow td:first-child span").length ===
      win.document.querySelectorAll("#logBox tr.logrow").length,
      win.document.querySelectorAll("#logBox tr.logrow td:first-child span").length + " pills on " +
      win.document.querySelectorAll("#logBox tr.logrow").length + " rows");

    /* Driving the control the way a person does: set it and fire change, rather than reaching
       past it into the variable it sets. A control wired to nothing would still pass that. */
    const use = (i, v) => { const s2 = [...win.document.querySelectorAll("#logBox select")][i];
      if (!s2) return false; s2.value = v; s2.onchange({ target: s2 }); return true; };

    ok("choosing Automatic only redraws to just the software's changes",
      use(1, "auto") && win.document.querySelectorAll("#logBox .logrow").length === 1,
      win.document.querySelectorAll("#logBox .logrow").length + " rows");

    /* This assertion had been red since 3 Aug and was NOT a product fault — it was written before
       the third control existed. Grouping by the day a change AFFECTS brings in a Days control
       ("Today and ahead" / "Already been") which defaults to ahead, because someone reading by
       rota day wants the shifts they are about to work rather than a year of history. The one
       automatic entry in this fixture is dated in the past, so nought rows is the correct answer
       and the old expectation of one row was asking the page to ignore a control it had grown.
       Rewritten to test what the name actually claims — the filter survives the grouping change —
       and then to drive the new control and find the entry exactly where it should be. */
    use(0, "affects");
    ok("the two controls are independent — the filter survives changing the grouping",
      win.eval("logBy + ',' + logFilter") === "affects,auto", win.eval("logBy + ',' + logFilter"));
    const sels3 = [...win.document.querySelectorAll("#logBox select")];
    ok("grouping by the day affected grows a third control, for past vs ahead",
      sels3.length === 3, sels3.length + " controls");
    ok("and defaults to what's ahead, so a past change is not shown yet",
      win.document.querySelectorAll("#logBox .logrow").length === 0,
      win.document.querySelectorAll("#logBox .logrow").length + " rows");
    ok("switching to Already been finds it, still filtered to automatic",
      use(2, "past") && win.document.querySelectorAll("#logBox .logrow").length === 1 &&
      win.document.querySelectorAll("#logBox .logrow.auto").length === 1,
      win.document.querySelectorAll("#logBox .logrow").length + " rows");
  }

  console.log("\n" + (fail ? "=== " + pass + " passed, " + fail + " failed ===" : "=== " + pass + " passed, 0 failed ==="));
  if (fail) { console.log("\nFailures:"); failures.forEach(f => console.log(" - " + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("suite crashed:", e); process.exit(1); });
