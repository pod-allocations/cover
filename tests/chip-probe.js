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
  ok("window is week-aligned to Monday", src.indexOf("addDays(mondayOf(new Date().toISOString().slice(0, 10)), PUB_WEEKS * 7 - 1)") >= 0);
  /* WEEKS VISIBLE MEANS WHAT IT SAYS — 28 Aug (Ali: "its not that i want to set, its number that
     can be seen ahead by consultants"). The count includes this week, and the arrows stop at the
     same edge the cells do, so "2 weeks" cannot mean "2 weeks then a gridful of dashes you can
     still scroll into". The rota team is exempt: Look ahead is their job. */
  const mon = w.eval("mondayOf(new Date().toISOString().slice(0,10))");
  const weeksOf = n2 => { w.eval("cdata.pubWeeks = " + n2 + "; cdata.pubHighWater = " + n2 + ";");
    return w.eval("pubUntil()"); };
  const addD = (iso, k) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + k); return d.toISOString().slice(0,10); };
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
  ok("no thrown errors anywhere", errors.length === 0, errors.join(" | "));
  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  bad.forEach(b => console.log(" - " + b));
  process.exit(fail ? 1 : 0);
}, 900);
