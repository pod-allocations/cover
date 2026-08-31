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
  // Balanced comment markers in the page's own <style> — the fault above in its general form:
  // one stray closing marker silently disables every rule that follows it.
  const styleTxt = [...w.document.querySelectorAll("style")].map(s2 => s2.textContent).join("");
  ok("style block has balanced comment markers",
     (styleTxt.split("/*").length - 1) === (styleTxt.split("*/").length - 1),
     "opens " + (styleTxt.split("/*").length - 1) + " closes " + (styleTxt.split("*/").length - 1));
  // the published window can be LOWERED from the front end, with a confirm rather than a refusal (26.08.28)
  ok("published weeks input goes down to 1", /id='setPub' min='1'/.test(src));
  ok("…lowering asks instead of refusing", src.indexOf("takes back") >= 0 && !/can't go below that/.test(src));
  ok("…and the high-water mark follows it down", /cons\.pubHighWater = v;/.test(src));
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
  w.eval("try { sessionStorage.removeItem('consTeamUnlocked'); } catch(e){}");
  ok("a consultant cannot step past the last visible week", w.eval("canStepWeek(1)") === false);
  ok("…but can step back", w.eval("canStepWeek(-1)") === true);
  w.eval("try { sessionStorage.setItem('consTeamUnlocked','1'); } catch(e){}");
  ok("the rota team can step past it", w.eval("canStepWeek(1)") === true);
  /* The dash beyond the edge must explain itself with the SETTING, not the hardcoded "four" it
     carried until 28 Aug. Checked by rendering a week past the window and reading the cell. */
  w.eval(`try { sessionStorage.removeItem('consTeamUnlocked'); } catch(e){}
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
