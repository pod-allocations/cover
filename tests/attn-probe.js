const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const BASE = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
for (const f of ["core.css","core.js"]) {
  const b = fs.readFileSync(path.join(BASE, f), "utf8");
  html = f.endsWith(".css") ? html.replace(/<link rel="stylesheet" href="core\.css[^"]*">/, "<style>"+b+"</style>")
                            : html.replace(/<script src="core\.js[^"]*"><\/script>/, "<script>"+b+"</script>");
}
html = html.replace(/<script src="k\.js[^"]*"><\/script>/, '<script>window.__POD_KEYS={r:"https://x.invalid/r",cv:"https://x.invalid/cr",cvs:"https://x.invalid/cs"};window.__POD_TEST=false;</script>');
const errors = [];
const dom = new JSDOM(html, { runScripts:"dangerously", pretendToBeVisual:true, url:"https://example.org/",
  beforeParse(w){ w.matchMedia = () => ({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.requestAnimationFrame=cb=>setTimeout(cb,0); w.fetch=()=>Promise.reject(new Error("no net"));
    w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.addEventListener("error", e => errors.push(String((e.error&&e.error.message)||e.message))); }});
setTimeout(() => {
  const w = dom.window; let pass=0, fail=0; const bad=[];
  const ok=(n,c,d)=>{ c?pass++:(fail++,bad.push(n+(d?" — "+d:""))); console.log((c?"  ok  ":"  FAIL ")+n+(!c&&d?" — "+d:"")); };
  const AT = "2026-08-30T11:03:00.000Z";
  w.eval(`
    data = { staff: [], weeks:{} };
    cdata = { v:"cover-1", pw:"", days:{}, map:{ FW:"Fiona Wallace", TH:"Tim Holzmann", KB:"Kate Bailey" },
      fair:{}, window:{}, source:{}, log:[], sorted:{} };
    const blank = () => ({A:"",B:"",C:"",D:"",E:"",oncall:"",cod:"",fgh:"",fin:{}});
    // a fully-staffed day, so the unrelated "this pod has nobody" rows stay quiet and the
    // assertions below are about the sync-run row and nothing else
    const full = () => ({A:"TH",B:"TH",C:"KB",D:"KB",E:"FW",oncall:"KB",cod:"TH",fgh:"",fin:{}});
    // one 11:03 run: same swap on two pods of 6 Sept, and on call of 9 Sept
    cdata.days["2026-09-06"] = { auto:full(), cur:full(), pubChanged:[
      { pod:"A", from:"FW", to:"TH", at:"${AT}" }, { pod:"B", from:"FW", to:"TH", at:"${AT}" } ] };
    cdata.days["2026-09-09"] = { auto:full(), cur:full(), pubChanged:[
      { pod:"oncall", from:"FW", to:"KB", at:"${AT}" } ] };
    curWeek = mondayOf(new Date().toISOString().slice(0,10));
  `);
  const items = w.eval("attnItems().filter(i => i.kind === 'pub')");
  ok("one row for the whole run, not four", items.length === 1, "got " + items.length);
  const it = items[0];
  ok("…titled in plain English", /^Cover changed after publishing/.test(it.title), it.title);
  ok("…no 'circulated' anywhere", !/circulated/i.test(it.title + " " + it.detail));
  ok("…says how many days moved", /2 days/.test(it.detail), it.detail);
  ok("…one line per day", (it.lines || []).length === 2, JSON.stringify((it.lines||[]).length));
  const l6 = (it.lines||[]).find(l => /6 Sep/.test(l.day));
  ok("…same swap on two pods reads once", l6 && l6.text === "Fiona Wallace → Tim Holzmann, Pods A and B", l6 && l6.text);
  const l9 = (it.lines||[]).find(l => /9 Sep/.test(l.day));
  ok("…non-pod slots keep their own words", l9 && /on call/.test(l9.text), l9 && l9.text);
  ok("only one button, and it acknowledges", it.sortLabel === "Acknowledge" && !it.alt && !it.act,
     "sort=" + it.sortLabel + " alt=" + it.alt + " act=" + it.act);
  // acknowledging once clears the lot
  w.eval("cdata.sorted['" + it.id + "'] = { t: new Date().toISOString(), who: 'AJC' };");
  const after = w.eval("attnItems().filter(i => i.kind === 'pub')");
  ok("acknowledging once settles the whole run", after.length === 1 && after[0].done === true,
     "len=" + after.length + " done=" + (after[0]||{}).done);
  // legacy: acknowledged under the OLD per-pod ids, before this change shipped
  w.eval(`cdata.sorted = {};
    for (const id of ["pub:2026-09-06:A:${AT}","pub:2026-09-06:B:${AT}","pub:2026-09-09:oncall:${AT}"])
      cdata.sorted[id] = { t: new Date().toISOString(), who: "AJC" };`);
  const legacy = w.eval("attnItems().filter(i => i.kind === 'pub')");
  ok("old acknowledgements still count", legacy.length === 1 && legacy[0].done === true,
     "done=" + (legacy[0]||{}).done);
  // ...but a run only half-ticked under the old scheme must still ask
  w.eval(`cdata.sorted = {}; cdata.sorted["pub:2026-09-06:A:${AT}"] = { t:new Date().toISOString(), who:"AJC" };`);
  const half = w.eval("attnItems().filter(i => i.kind === 'pub')");
  ok("…a half-ticked run still asks", half.length === 1 && !half[0].done, "done=" + (half[0]||{}).done);
  w.eval("cdata.sorted = {}; showTab('attn');");
  const rows = w.document.querySelectorAll("#attnBox .attnrow[data-id^='pubrun:']");
  ok("renders as a single row on screen", rows.length === 1, "rows=" + rows.length);
  const btns = rows[0] ? [...rows[0].querySelectorAll("button")].map(b => b.textContent.trim()) : [];
  ok("…with exactly one button", btns.length === 1 && btns[0] === "Acknowledge", JSON.stringify(btns));
  ok("…and the day lines are drawn", rows[0] && rows[0].querySelectorAll(".attnlines div").length === 2);
  const pubUnsettled = w.eval("attnItems().filter(i => i.kind === 'pub' && !i.done).length");
  ok("the run counts once toward the badge", pubUnsettled === 1, "count=" + pubUnsettled);
  ok("no thrown errors", errors.length === 0, errors.join(" | "));
  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  bad.forEach(b => console.log(" - " + b));
  process.exit(fail ? 1 : 0);
}, 900);
