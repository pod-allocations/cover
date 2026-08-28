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
  // tap speaks
  bChip.dispatchEvent(new w.Event("click", {bubbles:true}));
  const tEl = w.document.getElementById("toast");
  ok("tapping a chip speaks its meaning", tEl && /was Pod C/.test(tEl.textContent), tEl && tEl.textContent);
  ok("…and does not open the cell edit", !w.document.querySelector("select.cellsel"));
  // drawer: simulate unlocked team, phone flow
  w.eval(`document.body.classList.add("teamopen");`);
  w.document.getElementById("btnTeamM").dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("shield button opens the drawer once inside", w.document.body.classList.contains("navopen"));
  w.document.getElementById("navbackdrop").dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("backdrop tap closes it", !w.document.body.classList.contains("navopen"));
  w.document.getElementById("btnTeamM").dispatchEvent(new w.Event("click",{bubbles:true}));
  const fairBtn = w.document.querySelector("#teamPanel button[data-tab='fair']");
  if (fairBtn) fairBtn.dispatchEvent(new w.Event("click",{bubbles:true}));
  ok("picking a page closes the drawer", fairBtn && !w.document.body.classList.contains("navopen"));
  ok("no thrown errors anywhere", errors.length === 0, errors.join(" | "));
  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  bad.forEach(b => console.log(" - " + b));
  process.exit(fail ? 1 : 0);
}, 900);

