/*
 * Render smoke test
 * -----------------
 * The rule suite exercises allocation LOGIC and never renders a page. On 4 Aug two rendering
 * bugs shipped past it: a helper that called itself (every change-log row blew the stack) and a
 * reader that printed [object Object] fourteen times. Neither could have been caught by tests
 * that never draw anything.
 *
 * So this one draws everything. It loads the real file, seeds enough data to make each page do
 * work, opens every tab and every dialog, and fails on ANY thrown error, unhandled rejection, or
 * blank page that should not be blank. It knows nothing about pod rules — that is the other
 * suite's job — and it should stay that way, because its value is that it is cheap to keep true.
 *
 * Run:  node tests/render-tests.js            (needs jsdom on NODE_PATH)
 * Exit: 0 all good, 1 something threw or rendered empty.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HERE = __dirname;
const PAGE = path.join(HERE, "..", "index.html");

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

function inlineAssets(html) {
  // core.css / core.js are separate files in the repo; jsdom will not fetch them.
  for (const f of ["core.css", "core.js"]) {
    const p = path.join(HERE, "..", f);
    if (!fs.existsSync(p)) continue;
    const body = fs.readFileSync(p, "utf8");
    html = f.endsWith(".css")
      ? html.replace(/<link rel="stylesheet" href="core\.css[^"]*">/, "<style>" + body + "</style>")
      : html.replace(/<script src="core\.js[^"]*"><\/script>/, "<script>" + body + "</script>");
  }
  /* k.js carries the flow URLs and is served alongside the page, so jsdom never fetches it and
     the page comes up with no keys at all — which means Setup shows its "connect the store"
     screen and none of the real page is ever tested. Stand in a fake one. The URLs are never
     called: every fetch is stubbed to reject, and postLive is replaced before any save. */
  html = html.replace(/<script src="k\.js[^"]*"><\/script>/,
    '<script>window.__POD_KEYS = { r: "https://example.invalid/resident-read", ' +
    'cv: "https://example.invalid/cover-read", cvs: "https://example.invalid/cover-save" };' +
    'window.__POD_TEST = false;</script>');
  return html;
}

function load() {
  let html = inlineAssets(fs.readFileSync(PAGE, "utf8"));
  html = html.replace("startUp();", "try{ if(!data) loadData(blankData()); }catch(e){}\nstartUp();");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.org/",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.scrollTo = () => {};
      w.requestAnimationFrame = cb => setTimeout(cb, 0);
      w.fetch = () => Promise.reject(new Error("no net"));
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.addEventListener("error", e => errors.push(String((e.error && e.error.message) || e.message)));
      w.addEventListener("unhandledrejection", e => {
        const m = String((e.reason && e.reason.message) || e.reason || "");
        if (!/no net/.test(m)) errors.push("unhandled rejection: " + m);
      });
    }
  });
  return new Promise(res => setTimeout(() => res({ w: dom.window, errors }), 900));
}

/* The consultant page keeps its rota in cdata and reads the resident board for staff. Seeded
   here so every tab has something to draw — a page that renders nothing cannot fail, which is
   how a stack overflow hid for half a day on the resident side. */
const SEED = `(function(){
  const T = new Date().toISOString().slice(0,10);
  data = { staff: [
    { id:"c1", name:"Anas Baiou", grade:"CON", active:true, aliases:[] },
    { id:"c2", name:"Nick Whitehouse", grade:"CON", active:true, aliases:[] },
    { id:"r1", name:"Alice Ring", grade:"ST", airway:true, active:true, aliases:[],
      profile:{ about:"Interested in echo", supervisor:"c1" } },
    { id:"r2", name:"Sam Aziz", grade:"CT", active:true, aliases:[] }
  ], weeks:{} };
  const K = mondayOf(T);
  data.weeks[K] = { days: Array.from({length:7}, function(){ return { pods:{A:{assign:[],super:[],student:""},B:{assign:[],super:[],student:""},C:{assign:[],super:[],student:""},D:{assign:[],super:[],student:""},E:{assign:[],super:[],student:""}}, night:{phone:null,AB:[],CDE:[],E:[],super:[]}, shadow:[], extras:[], phone:null }; }), roster:{} };
  const di = Math.round((new Date(T) - new Date(K)) / 86400000);
  data.weeks[K].days[di].pods.A.assign.push({ id:"r1", shift:"LD" });
  data.weeks[K].roster[T] = { r1:{code:"LD",kind:"day"}, r2:{code:"SD",kind:"day"} };
  curWeek = K;
  const now = new Date().toISOString();
  /* A COVER store, in the shape the carve leaves behind: the allocation at the top level and
     not one key of the consultant rota's paperwork. If this seed ever needs a jobPlans or a
     tariff to make the page draw, the split has come undone. */
  cdata = { v:"cover-1", pw:"", days:{}, map:{ AB:"Anas Baiou", NW:"Nick Whitehouse" },
    fair:{ AB:{ab:10,cd:8} }, window:{ AB:{ab:1,cd:0} },
    source:{ name:"Consultant Rota Aug.xlsx", modified:"2026-08-01T09:00:00Z",
             sheetUntil:"2026-11-08", unknownInitials:["ZZ"] },
    log: [
      { t: now, who:"AJC", kind:"manual", on:T, msg:"Cover swap " + T + ": Baiou to Whitehouse" },
      { t: now, who:"sync", kind:"auto",  on:T, msg:"Cover worked out again for " + T },
      { t: now, who:"AJC", kind:"manual", on:null, msg:"Editing password set" },
      /* What the Optima sync writes since 6 Aug: the person and the shift, not a count. */
      { t: now, who:"sync", kind:"auto", on:T, msg:"Kate Bailey on the rota, LD",
        d:{ act:"on", subj:"Kate Bailey", to:"LD" } },
      { t: now, who:"sync", kind:"auto", on:T, msg:"Sam Aziz moved from SD to LD",
        d:{ act:"shift", subj:"Sam Aziz", from:"SD", to:"LD" } }
    ] };
  cdata.days[T] = { auto:{ A:"AB" }, cur:{ A:"AB", oncall:"NW", cod:"AB" } };
  showJun = true;
  return "seeded";
})()`;

(async () => {
  console.log("=== Render smoke test ===");
  console.log("  page: " + path.basename(PAGE));
  const { w, errors } = await load();

  ok("page loads with no script errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  ok("the app booted", w.eval("typeof renderAll === 'function' && typeof showTab === 'function'"));

  try { w.eval(SEED); } catch (e) { ok("seed data applied", false, e.message); }

  /* Every tab, including the ones behind the staff password. A page that throws here would have
     been invisible to the rule suite. */
  const TABS = ["rota", "fair", "log", "setup"];
  for (const t of TABS) {
    const before = errors.length;
    let threw = "";
    try { w.eval("showTab(" + JSON.stringify(t) + "); renderAll();"); }
    catch (e) { threw = e.message; }
    ok("renders tab: " + t, !threw && errors.length === before, threw || errors.slice(before).join(" | "));
  }

  /* The change log is the page that broke twice. Check it actually drew rows, not just that it
     did not throw — "renders nothing" is how the stack overflow stayed hidden. */
  const logRows = w.eval("showTab('log'); renderLog(); document.querySelectorAll('#logBox tr').length");
  ok("change log draws rows", logRows > 3, "rows=" + logRows);

  for (const mode of ['logBy="made"', 'logBy="affects"; logWhen="ahead"', 'logBy="affects"; logWhen="past"']) {
    const before = errors.length;
    let threw = "";
    try { w.eval(mode + "; renderLog();"); } catch (e) { threw = e.message; }
    ok("change log renders with " + mode, !threw && errors.length === before, threw);
  }
  for (const f of ["all", "manual", "auto"]) {
    let threw = "";
    try { w.eval('logFilter="' + f + '"; renderLog();'); } catch (e) { threw = e.message; }
    ok("change log filter: " + f, !threw, threw);
  }

  /* Dialogs are unreachable from a tab switch and so are never otherwise exercised. */
  const DIALOGS = [];
  for (const d of DIALOGS) {
    const before = errors.length;
    let threw = "";
    try { w.eval("if (typeof " + d + " === 'function') { " + d + "(); closeModal(); }"); }
    catch (e) { threw = e.message; }
    ok("opens dialog: " + d, !threw && errors.length === before, threw);
  }

  /* Settings writes to data — make sure drawing it twice in a row is safe, since every control
     re-renders the page it lives on. */
  /* The grid must actually draw residents, since that is what the shared core.js and the
     resident pills feed. */
  ok("resident pills drawn on the grid",
     w.eval("showTab('rota'); renderRota(); document.querySelectorAll('#weekGrid .rpill').length") >= 1,
     w.eval("document.querySelectorAll('#weekGrid .rpill').length") + " pills");
  ok("hover profile card can be built",
     w.eval("(function(){ try { showCard(document.querySelector('.rpill') || document.body, 'r1'); return document.getElementById('hovercard').textContent.indexOf('Alice Ring') >= 0; } catch(e){ return 'ERR ' + e.message; } })()") === true);

  /* ---- the split (4 Aug 2026) -------------------------------------------------------------
     Cover reads the consultant rota workbook and the resident rota, and nothing else. These
     check the page cannot quietly grow a third appetite: that it draws from a cover-shaped
     store, that it never writes the paperwork back, and that it says so if it meets a store
     the carve has not reached. */
  console.log("\n-- the Cover/Consultant Rota split --");

  ok("Setup names both sources",
     (function(){ const t = w.eval("showTab('setup'); renderSetup(); document.getElementById('setupBox').textContent");
       return t.indexOf("Consultant Rota Aug.xlsx") >= 0 && t.indexOf("Resident rota") >= 0; })());
  /* Editing needs a NAME, not a password (Ali, 6 Aug): swapping people between days and moving
     badges is ordinary consultant work. The password guards the rota-team pages behind the
     shield, and it is the board's own — not a second one kept here. */
  ok("Setup no longer offers an editing password",
     w.eval("document.getElementById('setupBox').textContent").indexOf("Editing password") < 0);
  ok("and the edit gate is gone from the source",
     !/function ensureRota|cdata\.pw =/.test(require("fs").readFileSync(PAGE, "utf8")));
  ok("Setup shows no job plans, tariff or list skills",
     (function(){ const t = w.eval("document.getElementById('setupBox').textContent").toLowerCase();
       return !/job plan|tariff|list skills/.test(t); })());
  ok("the job-plan gate is gone from the page",
     w.eval("typeof myFigures") === "undefined" || w.eval("typeof myFigures") === "undefined");
  ok("Fairness draws without a My figures button",
     w.eval("showTab('fair'); renderFair(); document.querySelectorAll('#fairBox .mybtn').length") === 0);
  ok("Fairness still draws its rows",
     w.eval("document.querySelectorAll('#fairBox tr').length") > 1);

  /* What gets written. postLive is replaced so the payload can be read without a network. */
  w.eval("window.__sent = null; postLive = function(u, p){ window.__sent = p; return Promise.resolve(true); };");
  const sent = await (async () => {
    w.eval("saveC()");
    await new Promise(r => setTimeout(r, 50));
    return w.eval("window.__sent");
  })();
  ok("a save actually produced a payload", !!sent, String(sent).slice(0, 40));
  if (sent) {
    const o = JSON.parse(sent);
    ok("what is saved holds the allocation at the top level", !!o.days && !o.consRota);
    for (const k of ["jobPlans", "skills", "tariff", "admins", "pins", "adminPin"])
      ok("what is saved holds no " + k, o[k] === undefined);
  }

  /* An uncarved store: the page must leave the paperwork alone AND say so, rather than
     silently dropping it — there is no undo for a job plan nobody backed up. */
  w.eval("cdata.jobPlans = { AB: { weeklyPA: '10' } }; cdata.adminPin = 'zzz'; window.__sent = null; saveC();");
  await new Promise(r => setTimeout(r, 50));
  const sent2 = w.eval("window.__sent");
  ok("an uncarved store keeps its paperwork through a save",
     !!sent2 && JSON.parse(sent2).jobPlans && JSON.parse(sent2).jobPlans.AB.weeklyPA === "10");
  /* ...and does NOT put that on the page. The carve is one person's one-off migration task;
     printing it on a page the whole rota team opens was noise about our own plumbing. */
  ok("and Setup does not put the migration notice on the page",
     w.eval("showTab('setup'); renderSetup(); document.getElementById('setupBox').textContent")
       .indexOf("carved") < 0);
  /* The single most important thing this page can say. A board worked out from a stale copy
     looks identical to one worked out from this morning's rota — which is how it went unnoticed
     for a fortnight (Ali, 6 Aug: "FFS this is key to the whole thing"). */
  ok("a board built from a stale copy says so above the grid",
     (function(){ w.eval("cdata.source = { sheetUntil: '2026-11-08', fetchError: 'the flow returned The Pink Book.xlsx' };" +
       "showTab('rota'); renderRota();");
       const t = w.eval("document.getElementById('weekGrid').textContent");
       return /not worked out from the live rota/.test(t) && /Pink Book/.test(t); })());
  ok("and a board built from the live rota does not",
     (function(){ w.eval("cdata.source = { name: 'Consultant Rota Aug.xlsx', sheetUntil: '2026-11-08' };" +
       "renderRota();");
       return !/not worked out from the live rota/.test(
         w.eval("document.getElementById('weekGrid').textContent")); })());

  ok("Setup says where the allocation actually came from",
     w.eval("document.getElementById('setupBox').textContent").indexOf("Consultant Rota Aug.xlsx") >= 0);
  ok("and when the workbook was never fetched, it says so instead of leaving a blank",
     (function(){ w.eval("cdata.source = { sheetUntil: '2026-11-08' }; renderSetup();");
       const t = w.eval("document.getElementById('setupBox').textContent");
       w.eval("cdata.source = { name: 'Consultant Rota Aug.xlsx', sheetUntil: '2026-11-08' }; renderSetup();");
       /* Phrasing updated 28 Aug with the Setup rewrite: the warning moved out of the SOURCE
          card and onto the status line at the top, so it now reads "Never fetched — ... the copy
          kept in the repo". Same guarantee, said earlier and louder; the assertion checks the
          guarantee (it admits it, and names what it fell back to) rather than the old wording. */
       return /never fetched/i.test(t) && /copy kept in the repo/.test(t); })());

  /* Backwards compatibility: a store still using the old consRota wrapper must still draw. */
  w.eval("cdata = { v:1, consRota:{ days:{}, map:{ AB:'Anas Baiou' }, fair:{}, window:{}, source:{} }, rotaPin:'abc' };" +
         "for (const k of ['days','map','fair','window','source']) if (cdata[k]==null && cdata.consRota[k]!=null) cdata[k]=cdata.consRota[k];" +
         "delete cdata.consRota; if (!cdata.pw && cdata.rotaPin) cdata.pw = cdata.rotaPin;");
  ok("an old wrapped store is unwrapped on the way in",
     w.eval("!!cdata.map && !cdata.consRota && cdata.pw === 'abc'"));

  /* ---- Edit / Done, the Key, and the toolbar (4 Aug) ---------------------------------------
     The page used to ask for the password at the moment of the first change. It now asks up
     front, the same way the resident board does, so these check the lock is real: that a click
     on a cell while reading changes nothing, and that Done puts the lock back. */
  console.log("\n-- editing, the Key and the toolbar --");

  /* The split section above deliberately left cdata as a half-migrated store to prove the
     unwrapping. Put a whole one back before testing anything about the UI, or these assertions
     are really testing the leftovers of the previous test. */
  w.eval("cdata = { v:'cover-1', pw:'', days:{}, log:[], fair:{}, window:{}, source:{}," +
         "map:{ AB:'Anas Baiou', NW:'Nick Whitehouse', TF:'Timothy Fudge' } };" +
         "localStorage.removeItem('consEditor'); EDIT_MODE = false;" +
         "document.body.classList.remove('editing'); renderAll();");

  ok("the page opens read-only", w.eval("EDIT_MODE === false && !document.body.classList.contains('editing')"));
  ok("Edit and Done are both present", w.eval("!!document.getElementById('btnEdit') && !!document.getElementById('btnDone')"));
  ok("a cell click while reading changes nothing",
     w.eval("(function(){ const before = JSON.stringify(cdata.days); requireEdit(function(){ cdata.days.BROKEN = 1; }); return JSON.stringify(cdata.days) === before; })()"));

  w.eval("localStorage.setItem('consEditor','AB'); enterEdit();");
  await new Promise(r => setTimeout(r, 30));
  ok("Edit unlocks the page with no password asked for", w.eval("EDIT_MODE === true && document.body.classList.contains('editing')"));
  ok("and now an edit is allowed",
     w.eval("(function(){ let ran = false; requireEdit(function(){ ran = true; }); return ran; })()"));
  w.eval("leaveEdit();");
  ok("Done locks it again", w.eval("EDIT_MODE === false && !document.body.classList.contains('editing')"));

  /* Who's editing: a typeable list of consultants, and no residents in it. The store's map is
     the consultant list, so a resident cannot appear even by accident — but the seed puts
     residents on the resident side of the fixture, so this is worth asserting rather than
     assuming. */
  w.eval("pickWho();");
  await new Promise(r => setTimeout(r, 30));
  ok("the who's-editing picker is typeable, not a dropdown",
     w.eval("!!document.querySelector('#whoOverlay input[list]')"));
  ok("it offers the consultants",
     w.eval("document.querySelectorAll('#whoOverlay datalist option').length") >= 2);
  ok("and no residents",
     w.eval("[...document.querySelectorAll('#whoOverlay datalist option')].map(o=>o.value).join('|')")
       .indexOf("Alice Ring") < 0);
  ok("typing initials is enough to be recognised",
     w.eval("(function(){ const i = document.querySelector('#whoOverlay input[list]'); i.value = 'nw';" +
            "document.querySelector('#whoOverlay button').click();" +
            "return localStorage.getItem('consEditor'); })()") === "NW");

  w.eval("keyDialog();");
  await new Promise(r => setTimeout(r, 30));
  const keyTxt = w.eval("document.querySelector('#whoOverlay .box').textContent");
  ok("the Key opens and explains the grid",
     /Pods A and B/.test(keyTxt) && /Consultant of the day/.test(keyTxt) && /Fairfield/.test(keyTxt),
     keyTxt.slice(0, 60));
  ok("the Key covers the residents row too", /resident/i.test(keyTxt));
  /* The Key must borrow the board's pod colours, never restate them. Both pages load one
     byte-identical core.css, so a swatch written as a literal hex is a colour that will drift
     the first time the palette is touched — and the two pages sitting side by side in different
     blues is exactly the sort of thing that gets noticed and cannot be explained. */
  ok("the Key's swatches use the shared pod variables, not literal colours",
     (function(){ const h = w.eval("document.querySelector('#whoOverlay .box').innerHTML");
       return /var\(--podA\)/.test(h) && /var\(--podEb\)/.test(h) && !/#[0-9a-f]{6}/i.test(h); })());
  w.eval("document.querySelectorAll('#whoOverlay').forEach(function(o){ o.remove(); });");

  /* Ali, 4 Aug: "16:00–09:00 · 24h wknd — Not neeed, people know this." */
  ok("the on-call column no longer spells out the hours",
     w.eval("showTab('rota'); renderRota(); document.getElementById('weekGrid').textContent").indexOf("16:00") < 0);
  ok("every toolbar button but the name is an icon",
     w.eval("['btnJuniors','btnKey'].every(function(id){ var b = document.getElementById(id); return b && b.querySelector('svg') && !b.textContent.trim(); })"));

  /* Ali, 6 Aug: "Optima sync: 1 added ... this is a useless change log. need to know who the
     person is and which pod theyre allocated to!" These two rows are what replaced it. A row
     that draws the name but drops the shift code would look fine and still answer nothing, so
     check the cells, not just that nothing threw. */
  console.log("\n-- what the sync writes --");
  /* The UI section above swapped cdata for a clean store, so put a log back. */
  w.eval("(function(){ const now = new Date().toISOString(), T = new Date().toISOString().slice(0,10);" +
    "cdata.log = [" +
    "{ t: now, who:'sync', kind:'auto', on:T, msg:'Kate Bailey on the rota, LD'," +
    "  d:{ act:'on', subj:'Kate Bailey', to:'LD' } }," +
    "{ t: now, who:'sync', kind:'auto', on:T, msg:'Sam Aziz moved from SD to LD'," +
    "  d:{ act:'shift', subj:'Sam Aziz', from:'SD', to:'LD' } }]; })()");
  w.eval("logBy='made'; logFilter='all'; showTab('log'); renderLog();");
  const syncRow = w.eval("(function(){ const rows=[...document.querySelectorAll('#logBox tr.logrow')];" +
    "const r=rows.find(x=>x.textContent.indexOf('Kate Bailey')>=0);" +
    "return r ? [...r.children].map(c=>c.textContent.trim()).join('|') : 'NOT DRAWN'; })()");
  ok("a person joining the rota is named, with their shift",
     /Kate Bailey/.test(syncRow) && /LD/.test(syncRow), syncRow);
  const shiftRow = w.eval("(function(){ const rows=[...document.querySelectorAll('#logBox tr.logrow')];" +
    "const r=rows.find(x=>x.textContent.indexOf('Sam Aziz')>=0);" +
    "return r ? [...r.children].map(c=>c.textContent.trim()).join('|') : 'NOT DRAWN'; })()");
  ok("a shift change shows both the old code and the new",
     /SD/.test(shiftRow) && /LD/.test(shiftRow), shiftRow);
  /* And the pod. A freshly allocated day is one row that opens to show who went where. */
  w.eval("(function(){ const now=new Date().toISOString(), T=new Date().toISOString().slice(0,10);" +
    "cdata.log.push({ t:now, who:'sync', kind:'auto', on:T," +
    " msg:'Auto-allocated ' + T + ' — nobody had touched it'," +
    " d:{ act:'fix', label:'Day allocated', n:2, kids:[{subj:'Kate Bailey',to:'C'},{subj:'Sam Aziz',to:'A'}] } }); })()");
  w.eval("renderLog();");
  ok("an auto-allocated day says allocated, not tidied",
     w.eval("document.getElementById('logBox').textContent").indexOf("Day allocated") >= 0);
  ok("and counts placements rather than moves",
     w.eval("document.getElementById('logBox').textContent").indexOf("2 placed") >= 0);
  ok("opening it shows who went into which pod",
     w.eval("(function(){ const b=[...document.querySelectorAll('#logBox button')].find(x=>x.textContent==='\u25b8');" +
            "if(!b) return 'no expander'; b.onclick();" +
            "return document.getElementById('logBox').textContent; })()").indexOf("Kate Bailey") >= 0);

  ok("neither falls back to the wide plain-text row",
     w.eval("[...document.querySelectorAll('#logBox tr.logrow')].filter(function(r){" +
            "return /Kate Bailey|Sam Aziz/.test(r.textContent) && " +
            "[...r.children].some(function(c){ return c.colSpan > 1; }); }).length") === 0);

  /* The bug that made staging useless: no save key meant every edit returned at the guard, so
     a badge dragged to another pod snapped back and nothing said why (Ali, 6 Aug). */
  ok("an edit is possible on the test site with no save key at all",
     w.eval("(function(){ const keep = COVER_SAVE; return canSave(); })()") === true);
  ok("a dragged badge actually moves",
     (function(){ const before = w.eval("JSON.stringify(cdata.days)");
       w.eval("(function(){ const T = new Date().toISOString().slice(0,10);" +
              "cdata.days[T] = { auto:{A:'AB',B:'NW'}, cur:{A:'AB',B:'NW'} };" +
              "EDIT_MODE = true; applySwap(T, 'A', 'B'); })()");
       const after = w.eval("(function(){ const T = new Date().toISOString().slice(0,10);" +
              "return cdata.days[T].cur.A + cdata.days[T].cur.B; })()");
       return after === "NWAB"; })(), "the two did not swap");

  ok("no errors across the whole run", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (failures.length) { console.log("Failures:"); failures.forEach(f => console.log(" - " + f)); }
  process.exit(fail ? 1 : 0);
})();
