/*
 * Change-badge probe
 * ------------------
 * Proves the 28 Aug change badges against seeded data rather than reasoning about them:
 * a hand move inside 48h draws the grey swap badge (amber-filled when within 24h of the
 * shift); a sync move credits the sync from `prev`; a 60h-old entry draws nothing; the
 * off-sheet pencil persists and marks taken-off cells; tapping a badge speaks its title
 * without opening the cell edit; and the phone drawer opens, closes on backdrop, and
 * closes when a page is picked.
 * Run:  node tests/chip-probe.js   (jsdom, same harness shape as render-tests)
 */
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const path0 = require("path");
const BASE = path0.join(__dirname, "..");
let html = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
for (const f of ["core.css","core.js"]) {
  const body = fs.readFileSync(path.join(BASE, f), "utf8");
  html = f.endsWith(".css")
    ? html.replace(/<link rel="stylesheet" href="core\.css[^"]*">/, "<style>" + body + "</style>")
    : html.replace(/<script src="core\.js[^"]*"><\/script>/, "<script>" + body + "</script>");
}
html = html.replace(/<script src="k\.js[^"]*"><\/script>/,
  '<script>window.__POD_KEYS={r:"https://x.invalid/r",cv:"https://x.invalid/cr",cvs:"https://x.invalid/cs"};window.__POD_TEST=false;</script>');
const errors = [];
const dom = new JSDOM(html, { runScripts:"dangerously", pretendToBeVisual:true, url:"https://example.org/",
  beforeParse(w){
    w.matchMedia = () => ({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo = () => {}; w.requestAnimationFrame = cb => setTimeout(cb,0);
    w.fetch = () => Promise.reject(new Error("no net"));
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.addEventListener("error", e => errors.push(String((e.error&&e.error.message)||e.message)));
  }});
setTimeout(() => {
  const w = dom.window;
  let pass=0, fail=0; const bad=[];
  const ok=(n,c,d)=>{ c?pass++:(fail++,bad.push(n+(d?" — "+d:""))); console.log((c?"  ok  ":"  FAIL ")+n+(!c&&d?" — "+d:"")); };
  w.eval(`
    const T = new Date().toISOString().slice(0,10);
    const H = n => new Date(Date.now()-n*3600e3).toISOString();
    data = { staff: [] , weeks:{} };
    curWeek = mondayOf(T);
    cdata = { v:"cover-1", pw:"", days:{}, map:{ AB:"Anas Baiou", NW:"Nick Whitehouse", JRG:"Jonathan Goodall" },
      fair:{}, window:{}, source:{},
      prevAt: H(10),
      prev: { [T]: { A:"AB", B:"", C:"NW", D:"JRG", E:"", oncall:"", fgh:"" } },
      log: [
        { t:H(3), who:"AJC (consultant page)", kind:"manual", on:T, msg:"m", d:{act:"move",subj:"NW",from:"C",to:"B"} },
        { t:H(60), who:"AJC", kind:"manual", on:T, msg:"old", d:{act:"move",subj:"JRG",from:"A",to:"D"} }
      ] };
    cdata.days[T] = { auto:{ A:"AB", B:"", C:"NW", D:"", E:"JRG" }, cur:{ A:"AB", B:"NW", C:"JRG", D:"JRG", E:"", cod:"AB" } };
    window.__T = T; renderRota();
  `);
  const q = s => w.document.querySelectorAll(s);
  // B: NW moved C→B 3h ago (log, manual, short: within 24h of shift start today) → chgpill.short
  const bChip = w.document.querySelector("td.col-B .chgpill");
  ok("manual move draws a chip", !!bChip);
  ok("…which is short-notice (amber)", !!bChip && bChip.className.includes("short"));
  ok("…title says where from and who", !!bChip && /was Pod C/.test(bChip.title) && /by AJC/.test(bChip.title), bChip && bChip.title);
  // B: cur NW vs auto "" → off-sheet chip too, on the same cell row
  ok("off-sheet chip beside it", !!w.document.querySelector("td.col-B .ofspill"));
  ok("both chips share the pill row", q("td.col-B .cellwrap .chgpill, td.col-B .cellwrap .ofspill").length === 2);
  // C: sync moved (prev C=NW, cur=JRG) → chip titled by the sync
  const cChip = w.document.querySelector("td.col-C .chgpill");
  ok("sync move draws a chip", !!cChip);
  ok("…credited to the sync", !!cChip && /by the sync/.test(cChip.title), cChip && cChip.title);
  // D: only a 60h-old log entry → no chip (aged out), but cur JRG vs auto "" → off-sheet only
  ok("48h expiry honoured", !w.document.querySelector("td.col-D .chgpill"));
  ok("…off-sheet persists past it", !!w.document.querySelector("td.col-D .ofspill"));
  // E: cur empty, auto JRG → taken-off chip on the empty cell, named
  const eOfs = w.document.querySelector("td.col-E .ofspill");
  ok("taken-off marked on the empty cell", !!eOfs && /Jonathan Goodall/.test(eOfs.title) && /taken off/.test(eOfs.title), eOfs && eOfs.title);
  // A: untouched → no chips at all
  ok("an unchanged cell stays clean", q("td.col-A .chgpill, td.col-A .ofspill").length === 0);
  ok("no dashed diff class remains", q(".cell.diff").length === 0);
  // tap speaks — in a bubble at the badge, not the bottom toast (26.08.28)
  bChip.dispatchEvent(new w.Event("click", {bubbles:true}));
  const tEl = w.document.getElementById("hovercard");
  ok("tapping a chip speaks at the badge", tEl && tEl.style.display === "block" && /was Pod C/.test(tEl.textContent), tEl && tEl.textContent);
  ok("…and does not open the cell edit", !w.document.querySelector("select.cellsel"));
  // drawer: the burger, its backdrop, and the rail/team levels (26.08.28 second pass)
  w.document.getElementById("hamburger").dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("burger opens the drawer", w.document.body.classList.contains("navopen"));
  w.document.getElementById("navbackdrop").dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("backdrop tap closes it", !w.document.body.classList.contains("navopen"));
  w.eval(`document.body.classList.add("teamopen");`);
  w.document.getElementById("hamburger").dispatchEvent(new w.Event("click",{bubbles:true}));
  w.document.getElementById("tpBack").dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("Menu steps back to the rail, not out of the section", w.document.body.classList.contains("railback") && w.document.body.classList.contains("navopen") && w.document.body.classList.contains("teamopen"));
  const fairBtn = w.document.querySelector("#teamPanel button[data-tab='log']");
  if (fairBtn) fairBtn.dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("picking a page closes the drawer", fairBtn && !w.document.body.classList.contains("navopen"));
  // Fairness is public in the rail and does not open the rota-team panel (26.08.28)
  const railFair = w.document.querySelector("aside button[data-tab='fair']");
  if (railFair) railFair.dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("fairness sits in the rail for everyone", !!railFair);
  ok("…and opening it does not open the team panel", railFair && !w.document.body.classList.contains("teamopen"));
  ok("…nor the counts that are the rota's business", (w.document.querySelector("#fairBox")||{innerHTML:""}).innerHTML.indexOf("Fairfield") < 0);
  // the whole card is the target on a phone; desktop keeps precise clicking (26.08.28)
  w.eval(`Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });`);
  const bTd = w.document.querySelector("td.col-B");
  let cellClicked = false;
  w.document.querySelector("td.col-B .cell").addEventListener("click", () => { cellClicked = true; });
  bTd.dispatchEvent(new w.Event("click", {bubbles:true}));
  ok("phone: tapping the card reaches the cell", cellClicked);
  w.eval(`Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });`);
  cellClicked = false;
  bTd.dispatchEvent(new w.Event("click", {bubbles:true}));
  ok("desktop: blank card space stays inert", !cellClicked);
  // structural: the badge tap halo and the scrollable overlay box are in the stylesheet (26.08.28)
  const src = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
  ok("badges carry an invisible tap halo", src.indexOf('.chgpill::after,.ofspill::after{content:"";position:absolute;inset:-9px}') >= 0);
  ok("overlay boxes scroll within the screen", src.indexOf("max-height:86dvh;overflow-y:auto") >= 0);
  // the Key can always be closed — the pinned X (26.08.28)
  w.eval("keyDialog();");
  const kov = w.document.getElementById("whoOverlay");
  const kx = kov && kov.querySelector("button[aria-label='Close']");
  ok("the Key opens with a pinned close", !!kx);
  /* THE KEY IS THE ONLY PLACE GESTURES ARE WRITTEN DOWN (rule 2 forbids on-screen explainers), so
     a Key that is out of date is worse than no Key — it is the single source, teaching the old
     product. It described "tap a name to pick it up, then tap another name to swap the two" for
     three days after one tap started opening the person sheet instead, and told phone users to
     DRAG the COD and finish pills, which touch cannot do (rule 14). Both pinned here. */
  const keyTxt = kov ? kov.textContent : "";
  ok("the Key describes the gesture that exists", /one tap on a name opens their card/i.test(keyTxt), keyTxt.slice(0, 80));
  ok("…and not the pick-up-and-swap that was replaced", !/pick it up, then tap another name/i.test(keyTxt));
  ok("…and never says only-drag for a pill a phone must tap",
     !/COD<\/span>[\s\S]{0,40}Drag it to hand it over/.test(src) && /Tap it, then tap the pod taking over/.test(keyTxt),
     keyTxt.slice(0, 80));
  if (kx) kx.click();
  ok("…and the X closes it", !w.document.getElementById("whoOverlay"));
  // the day column matches the resident board: MON over the date, and a width fixed layout reads (26.08.28)
  const dnEl = w.document.querySelector("td.rowh .dn"), dEl = w.document.querySelector("td.rowh .d");
  ok("day column uses the resident board's dn/d", !!dnEl && !!dEl);
  ok("…day name above, uppercase", dnEl && /^[A-Z]{3}$/.test(dnEl.textContent.trim()), dnEl && dnEl.textContent);
  /* THE RULE HAS TO SURVIVE THE PARSER, NOT JUST EXIST IN THE FILE — 28 Aug. This assertion used
     to be src.indexOf("table.rota th:first-child{...}"), and it passed green on a build where the
     rule was dead: a comment above it had been closed early, so six lines of prose sat raw in the
     stylesheet, Chrome's error-recovery ate the rules that followed, and the column measured 173px
     on the live site while the test said fine.
     Asking the CSSOM is the better question, but be clear what it does and does not catch here:
     checked against that exact broken build, jsdom RECOVERED and still exposed the rule, so these
     two assertions stayed green. It is the balanced-marker check below that actually fails on this
     fault. These are kept for rules malformed in ways jsdom does reject. */
  const sheet = [...w.document.styleSheets].find(sh => { try { return [...sh.cssRules].some(r => /table\.rota th:first-child/.test(r.cssText || "")); } catch(e){ return false; } });
  const widthRule = sheet && [...sheet.cssRules].find(r => /table\.rota th:first-child/.test(r.cssText || ""));
  ok("the day-column width rule actually parsed", !!widthRule, widthRule && widthRule.cssText);
  ok("…and it is the 96px the date needs", widthRule && /96px/.test(widthRule.cssText), widthRule && widthRule.cssText);
  /* The log's TO column has to hold a full name, not just a pod letter — see the note at
     #logBox th:nth-child(4). Checked through the CSSOM rather than by searching the source, for
     the same reason the day-column rule above is: a rule that sits inside a broken comment is
     still present in the text and does nothing at all. */
  const allRules = [...w.document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch(e){ return []; } });
  const toRule = allRules.find(r2 => r2.selectorText === "#logBox th:nth-child(4)");
  const toWrap = allRules.find(r2 => r2.selectorText === "#logBox td:nth-child(4) > span");
  ok("the log's To column is wide enough for a name", toRule && /10\.6rem/.test(toRule.cssText), toRule && toRule.cssText);
  ok("…and a longer one wraps rather than overhanging",
     toWrap && /normal/.test(toWrap.style.whiteSpace) && toWrap.style.getPropertyPriority("white-space") === "important",
     toWrap && toWrap.cssText);
  // Balanced comment markers in the page's own <style> — the fault above in its general form:
  // one stray closing marker silently disables every rule that follows it.
  const styleTxt = [...w.document.querySelectorAll("style")].map(s2 => s2.textContent).join("");
  ok("style block has balanced comment markers",
     (styleTxt.split("/*").length - 1) === (styleTxt.split("*/").length - 1),
     "opens " + (styleTxt.split("/*").length - 1) + " closes " + (styleTxt.split("*/").length - 1));
  /* ONE ROW, TWO BADGES — 31 Aug (Ali: "one row per swap"). A swap is now a single log entry
     naming both people, so chgFor has to read the individual legs off `swap` rather than the
     row's own subj/to. If that ever regresses, the consultant named SECOND loses their badge:
     the move happened, was logged, and left no mark on the board — the quietest possible failure
     and the reason this is asserted on both cells rather than one. */
  w.eval(`
    const T2 = window.__T;
    cdata.days[T2].cur  = { A:"AB", B:"", C:"JRG", D:"NW", E:"", oncall:"", cod:"", fgh:"" };
    cdata.days[T2].auto = { A:"AB", B:"", C:"JRG", D:"NW", E:"", oncall:"", cod:"", fgh:"" };
    cdata.log = [{ t: new Date(Date.now() - 3600e3).toISOString(), who: "AJC (consultant page)",
      kind: "manual", on: T2, msg: "NW and JRG swap Pod C and Pod D",
      d: { act: "move", subj: "NW ↔ JRG", from: "D", to: "C",
           swap: [{ subj: "NW", from: "C", to: "D" }, { subj: "JRG", from: "D", to: "C" }] } }];
    renderRota();
  `);
  ok("a swap badges the person named first in the row", !!w.document.querySelector("td.col-D .chgpill"));
  /* "Is there a badge?" is NOT enough here, and this was caught by breaking chgFor on purpose:
     with the legs ignored, the second consultant's cell STILL drew a badge — the `prev` snapshot
     fallback picked it up and credited it to the sync. The assertion has to be that the badge
     came from the swap ENTRY, which is what naming the editor and the right pod proves. */
  ok("…and the one named second, from the log rather than the sync fallback",
     /by AJC/.test((w.document.querySelector("td.col-C .chgpill") || {}).title || ""),
     (w.document.querySelector("td.col-C .chgpill") || {}).title);
  ok("…each saying the pod they actually came from",
     /was Pod C/.test((w.document.querySelector("td.col-D .chgpill") || {}).title || "") &&
     /was Pod D/.test((w.document.querySelector("td.col-C .chgpill") || {}).title || ""),
     (w.document.querySelector("td.col-D .chgpill") || {}).title);
  ok("…and applySwap writes one row, not one per person",
     /swap " \+ rowLabel\(k1\) \+ " and " \+ rowLabel\(k2\)/.test(src) && !/clog\(nameOf\(b\)/.test(src));
  // the published window can be LOWERED from the front end, with a confirm rather than a refusal (26.08.28)
  ok("published weeks input goes down to 1", /id='setPub' min='1'/.test(src));
  ok("…lowering asks instead of refusing", src.indexOf("takes back") >= 0 && !/can't go below that/.test(src));
  ok("…and the high-water mark follows it down", /cons\.pubHighWater = v;/.test(src));
  /* ONE DECISION, ONE ROW — 31 Aug (Ali: "mess", photographing four log rows sharing one
     timestamp). A number input fires `change` on every press of its spinner, so stepping
     5 → 4 → 3 → 2 confirmed three times and logged four rows, one of them for a value that was
     only passed through. Nothing may be written while the number is still moving. Asserted
     behaviourally — fire the events the spinner fires and count what reached the log — because
     the old code's fault was in when it acted, which no amount of reading the source shows. */
  /* confirm() MUST be stubbed to yes, or this proves nothing. jsdom leaves it unimplemented, so
     the first version of this test passed against deliberately broken code: every step tripped
     the "takes back days people can see" confirm, got a falsy answer, and returned before it
     could log. A test whose subject never runs is worse than no test. */
  w.confirm = () => true;
  /* And an editor must be on file, or ensureWho() opens the who-are-you picker and the callback
     that does the logging never runs — the second way this same test passed against broken code.
     Both stubs exist to make the subject actually execute; verified by putting the old immediate
     commit back and watching this fail. */
  w.eval("localStorage.setItem('consEditor','Probe');");
  w.eval("cdata.log = []; cdata.pubWeeks = 5; cdata.pubHighWater = 5; renderSetup();");
  const pubInput = w.document.querySelector("#setPub");
  ["4", "3", "2"].forEach(v2 => { pubInput.value = v2; pubInput.dispatchEvent(new w.Event("change")); });
  ok("stepping the spinner writes nothing while the number is still moving",
     w.eval("(cdata.log || []).length") === 0, w.eval("(cdata.log || []).length") + " rows logged");
  ok("…and the commit is debounced rather than fired per keypress", /PUB_PAUSE_MS/.test(src));
  ok("…and landing back on the old number decides nothing",
     /if \(v === PUB_WEEKS\) return;/.test(src));
  // the window is week-aligned, so it steps a whole week at Monday 00:00 and never mid-week
  ok("window is week-aligned to Monday",
     new Date(w.eval("pubUntil()") + "T12:00:00").getDay() === 0 &&
     w.eval("pubUntil()") > w.eval("mondayOf(todayISO())"),
     w.eval("pubUntil()") + " from " + w.eval("mondayOf(todayISO())"));
  /* Landing on a Sunday is the whole claim here; the exact count of weeks is checked by weeksOf()
     just below, which is the right place for it. An earlier version asserted the epoch difference
     was a whole number of weeks minus a day, and that failed under TZ=Pacific/Auckland — not
     because the window was wrong but because `addDays` built its date at LOCAL noon and read it
     back in UTC, so a step across a daylight-saving change landed a day out. Both helpers are
     pure UTC now and the suite passes in four zones; this note stays because the shape of that
     mistake — a test and its subject sharing an assumption — is the one to watch for. */
  /* WEEKS VISIBLE MEANS WHAT IT SAYS — 28 Aug (Ali: "its not that i want to set, its number that
     can be seen ahead by consultants"). The count includes this week, and the arrows stop at the
     same edge the cells do, so "2 weeks" cannot mean "2 weeks then a gridful of dashes you can
     still scroll into". The rota team is exempt: Look ahead is their job. */
  const mon = w.eval("mondayOf(new Date().toISOString().slice(0,10))");
  const weeksOf = n2 => { w.eval("cdata.pubWeeks = " + n2 + "; cdata.pubHighWater = " + n2 + ";");
    return w.eval("pubUntil()"); };
  /* UTC throughout, matching the app's addDays after 31 Aug. This helper is the expected VALUE the
     window is checked against, and it used to carry the same local-noon technique the app did — so
     under TZ=Pacific/Auckland it agreed with the bug rather than catching it, and then disagreed
     with the fix. A test that reimplements the thing it is testing only ever proves they were
     written by the same person on the same day. */
  const addD = (iso, k) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0,10); };
  ok("2 weeks reaches the Sunday of next week", weeksOf(2) === addD(mon, 13), weeksOf(2) + " vs " + addD(mon, 13));
  ok("4 weeks reaches three Sundays later", weeksOf(4) === addD(mon, 27), weeksOf(4) + " vs " + addD(mon, 27));
  ok("1 week is this week only", weeksOf(1) === addD(mon, 6), weeksOf(1));
  /* Seed enough weeks either side that the arrows have somewhere to go, then check the stop.
     weeksAvail() reads the RESIDENT store (data.weeks), not the cover days — the board shows
     consultant cover for the weeks the resident rota knows about. */
  w.eval(`cdata.pubWeeks = 2; cdata.pubHighWater = 2;
    const m = mondayOf(new Date().toISOString().slice(0,10));
    data.weeks = {};
    for (let i = -1; i <= 5; i++) data.weeks[addDays(m, i * 7)] = { days: [] };
    curWeek = addDays(m, 7);
    data.staffPw = "x";`);
  w.eval("TEAM_OK = false;");
  ok("a consultant cannot step past the last visible week", w.eval("canStepWeek(1)") === false);
  ok("…but can step back", w.eval("canStepWeek(-1)") === true);
  /* THE STOP IS THE SAME FOR EVERYONE — 31 Aug (Ali: "just stop anyone looking ahead more than 2
     weeks in main view... rota team has the look ahead view for that exact reason"). This used to
     assert the opposite, that the rota team could step past; the exemption made Pods behave
     differently depending on who was looking, and the person it fooled was the one who owns the
     page. Look ahead is where the rota team goes further, and it has its own arrows. */
  w.eval("TEAM_OK = true;");
  ok("and NEITHER can the rota team, on Pods", w.eval("canStepWeek(1)") === false);
  ok("…the rota team can still step back", w.eval("canStepWeek(-1)") === true);
  /* Look ahead must NOT have been caught by that change: it runs on its own bounds and on
     cellHTML's teamUnlocked test, which is untouched. Unlocked, a day past the edge draws a real
     name, not a dash — the thing that would silently empty the page if the two were confused. */
  ok("Look ahead still draws real names past the edge when unlocked",
     /class='cellwrap'/.test(w.eval("TEAM_OK = true; cellHTML({cur:{A:'XX'},auto:{A:'XX'}}, 'A', addDays(pubUntil(), 7))"))
     && !/cell empty/.test(w.eval("cellHTML({cur:{A:'XX'},auto:{A:'XX'}}, 'A', addDays(pubUntil(), 7))")));
  /* AND THE UNLOCK DIES WITH THE DOCUMENT — 31 Aug (Ali: "the unlock should expire on reload").
     A flag left in sessionStorage survived every reload for the life of the tab. Asserting the
     source, not just the variable, because the fault was that a stale reader stayed behind. */
  ok("the unlock is not kept in browser storage", !/consTeamUnlocked/.test(src), "consTeamUnlocked still in source");
  ok("…and a fresh document starts locked", w.eval("TEAM_OK = false; data.staffPw = 'x'; teamUnlocked()") === false);
  /* The dash beyond the edge must explain itself with the SETTING, not the hardcoded "four" it
     carried until 28 Aug. Checked by rendering a week past the window and reading the cell. */
  w.eval(`TEAM_OK = false;
    curWeek = addDays(mondayOf(new Date().toISOString().slice(0,10)), 28); renderRota();`);
  const dash = w.document.querySelector("#weekGrid .cell.empty[title]");
  ok("the dash names the real number of weeks", dash && /Cover is shown 2 weeks ahead/.test(dash.title),
     dash && dash.title);
  ok("…and no longer claims four", !(dash && /four weeks/.test(dash.title)));
  ok("Setup calls it what it is", /Weeks visible/.test(src) && src.indexOf("sectlab'>PUBLISHED") < 0);
  /* ── PRE-LAUNCH AUDIT GUARDS, 31 Aug ──────────────────────────────────────────────────────────
     Four defects found by reading the file the day it went live, each of which would have been
     invisible until somebody hit it. Pinned here because none of them shows up in a render. */
  /* Every function the page calls must exist. `uiConfirm` did not, and because the caller was
     async the ReferenceError became an unhandled rejection: the only undo in the product was a
     button that did nothing and said nothing. Checked generically — any `await <name>(` where
     <name> is neither defined in the file nor a known global. */
  const called = [...src.matchAll(/await\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const known = /^(fetch|sha|Promise|JSON|new)$/;
  const defined = n => new RegExp("(function\\s+" + n + "\\s*\\(|(const|let|var)\\s+" + n + "\\s*=)")
    .test(src + " " + fs.readFileSync(path.join(BASE, "core.js"), "utf8"));
  const undefinedCalls = [...new Set(called)].filter(n => !known.test(n) && !defined(n));
  ok("every awaited function actually exists", undefinedCalls.length === 0, undefinedCalls.join(", "));
  /* A direct postLive writes a savedAt of its own. saveCover() decides whether somebody ELSE has
     been in the file by comparing that stamp against the baseline, so a write that does not bank
     it makes the next ordinary save refuse as a phantom conflict AND put the change back on
     screen — for the rest of the session. Feedback needs no unlock, so anyone could trigger it. */
  const posts = [...src.matchAll(/await postLive\(COVER_SAVE/g)].map(m => m.index);
  const unbanked = posts.filter(i => {
    const before = src.slice(Math.max(0, i - 900), i);
    return !/ourStamps\.add\(/.test(before) && !/TESTMODE/.test(before);   // TESTMODE = the sandbox door
  });
  ok("every direct save banks its stamp", unbanked.length === 0,
     unbanked.length + " of " + posts.length + " posts bank nothing");
  /* The feedback button is hidden after TRIAL_END. Set to 2026-09-02 it would have vanished on
     day two of live use, silently. */
  const trial = (src.match(/TRIAL_END = "([\d-]+)"/) || [])[1];
  ok("the feedback trial has not already expired", trial && trial > new Date().toISOString().slice(0,10), trial);
  /* Warning and brand must not be the same colour, or "this is current" and "this needs you"
     are one tint. core.css ships them identical; Cover overrides amber. */
  const rootRule = allRules.find(r2 => r2.selectorText === ":root" && /--amber/.test(r2.cssText));
  ok("warning colour is not the brand colour",
     rootRule && rootRule.style.getPropertyValue("--amber").trim() !== rootRule.style.getPropertyValue("--accent").trim(),
     rootRule && rootRule.cssText);
  /* "TODAY" MUST BE LOCAL. toISOString() is UTC, so between 00:00 and 01:00 British Summer Time it
     answers YESTERDAY — the phone opened on the wrong day, and on a Monday in that hour the board
     opened on last week with the published window a week short. Two assertions, because either
     alone is weak: the helper must actually return the local date, and no site may go back to
     asking UTC. Comments are stripped before the source scan so the note explaining this does not
     satisfy its own test. */
  const localToday = (() => { const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); })();
  ok("todayISO() is the local date, not the UTC one", w.eval("todayISO()") === localToday, w.eval("todayISO()"));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("…and nothing asks UTC for today any more",
     !/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(code),
     (code.match(/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/g) || []).length + " left");
  /* THE TOP BAR MUST FIT ON ONE LINE ON A PHONE — 1 Sept 2026 (Ali, with a photograph: "annoying
     there are 2 lines of buttons on mobile"). #topbar is flex-wrap:wrap, so this fails by wrapping
     rather than by overflowing — nothing throws, nothing looks broken in a test, you just lose a
     whole row of a 390px screen to one button. jsdom does no layout so the wrap itself cannot be
     measured; what can be pinned is the arithmetic that made it fit: five 44px squares plus the
     burger plus the title, which needs Edit and Done to be squares with their words dropped.
     Asserted through the CSSOM inside the phone media block, because a rule sitting outside that
     block, or inside a broken comment, is present in the source and does nothing. */
  const phoneBlock = [...w.document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch(e){ return []; } })
    .filter(r => r.media && /760px/.test(r.conditionText || r.media.mediaText || ""))
    .flatMap(r => [...(r.cssRules || [])]);
  const inPhone = sel => phoneBlock.find(r => (r.selectorText || "").split(",").map(s => s.trim()).includes(sel));
  const sqRule = inPhone("#btnEdit") || inPhone("#btnDone");
  ok("Edit and Done are 44px squares on a phone", !!sqRule && /44px/.test(sqRule.cssText), sqRule && sqRule.cssText);
  ok("…with their words dropped", !!phoneBlock.find(r => /#btnEdit \.blabel/.test(r.selectorText || "") && /none/.test(r.style.display)));
  /* A square with nothing in it is worse than a word. Done's tick is a ::before mask, drawn only
     at phone width, so check the rule carries one rather than trusting that it looks right. */
  const doneIcon = phoneBlock.find(r => /#btnDone::before/.test(r.selectorText || ""));
  ok("…and Done shows a tick rather than an empty square",
     !!doneIcon && /mask/.test(doneIcon.cssText) && /path/.test(doneIcon.cssText), doneIcon && doneIcon.selectorText);
  ok("…and every one of the five is still 44px, so the row cannot shuffle",
     !!phoneBlock.find(r => /min-height:\s*44px/.test(r.cssText)) &&
     !!phoneBlock.find(r => /min-width:\s*44px/.test(r.cssText)));
  /* ACKNOWLEDGE IS PER MESSAGE, NOT PER VISIT — 1 Sept 2026 (Ali: "have a physical acknowelge
     button and then grey out when clicked"). Opening the Feedback page used to mark every message
     read for everybody, so one could not be dealt with and another left outstanding. Checked by
     RENDERING the page rather than by reading the source, because the button is built per card and
     the thing that matters is that an unread message gets one and a read message does not. */
  w.eval(`cdata.feedback = [
    { t: new Date().toISOString(), name: "A tester", kind: "problem", msg: "still to deal with" },
    { t: new Date(Date.now() - 6e5).toISOString(), name: "B tester", msg: "already handled",
      read: true, readBy: "AJC", readAt: new Date().toISOString() } ];
    try { localStorage.removeItem("coverFbRead"); } catch(e){}
    showTab("feedback");`);
  const cards = [...w.document.querySelectorAll("#fbList > div > div")];
  const acks = [...w.document.querySelectorAll("#fbList button")].filter(b => /Acknowledge/.test(b.textContent));
  ok("an unread message offers an Acknowledge button", acks.length === 1, acks.length + " buttons on " + cards.length + " cards");
  ok("…and one already dealt with says so instead",
     /Acknowledged by AJC/.test(w.document.getElementById("fbList").textContent));
  ok("…and opening the page no longer marks the lot read",
     !/renderFeedback\(\); markFeedbackRead\(\);/.test(src) && /if \(t === "feedback"\) renderFeedback\(\);/.test(src));
  /* The local half of the mark has to use the key the reader reads, or acknowledging works until
     you reload and then the message comes back. Caught by writing consFbRead against a reader
     looking for coverFbRead. */
  ok("…and the local mark uses the same key the reader does",
     (src.match(/coverFbRead/g) || []).length >= 2 && !/consFbRead/.test(src));
  ok("no thrown errors anywhere", errors.length === 0, errors.join(" | "));
  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  bad.forEach(b => console.log(" - " + b));
  process.exit(fail ? 1 : 0);
}, 900);
