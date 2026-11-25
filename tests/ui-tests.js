#!/usr/bin/env node
/* ui-tests — the DOM layer, exercised in a real DOM (jsdom), not assumed.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite. This one proves the page is wired to it: the button
 * compares, the findings reach the list, the counters add up, a failed export says so,
 * and the page still works when the two documents are empty.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 *
 * jsdom is a dev-only dependency. Nothing ships with it; the app has no dependency.
 */
"use strict";
var path = require("path");
var { JSDOM } = require("jsdom");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

var PAGE = path.join(__dirname, "..", "docs", "play", "index.html");

var CONTRACT_A = [
  "1. The Supplier shall deliver the goods on or before 5 May 2026.",
  "2. Payment shall be made within thirty days of delivery.",
  "3. Either party may terminate this agreement with sixty days written notice."
].join("\n\n");

var CONTRACT_B = CONTRACT_A.replace("thirty days", "forty-five days");

(async function () {
  var dom = await JSDOM.fromFile(PAGE, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: "file://" + PAGE
  });
  var w = dom.window;
  var d = w.document;

  await new Promise(function (res) { w.addEventListener("load", res); setTimeout(res, 3000); });

  ok("the engine loaded into the page", !!w.DocDiffCore);
  ok("the export kit loaded into the page", !!w.Export);
  eq("the page starts with an empty findings list", d.querySelectorAll(".finding").length, 0);

  var a = d.getElementById("textA");
  var b = d.getElementById("textB");
  a.value = CONTRACT_A;
  b.value = CONTRACT_B;
  a.dispatchEvent(new w.Event("input", { bubbles: true }));
  b.dispatchEvent(new w.Event("input", { bubbles: true }));

  eq("the clause counter follows document A", d.getElementById("countA").textContent, "3 clauses");

  d.getElementById("compare").click();
  var findings = d.querySelectorAll(".finding");
  eq("one reworded clause renders exactly one finding", findings.length, 1);
  eq("the finding is labelled reworded", findings[0].className, "finding reworded");
  ok("the finding shows the before and after text",
    /thirty days/.test(findings[0].textContent) && /forty-five days/.test(findings[0].textContent));
  eq("the summary counts one reworded clause", d.getElementById("sReworded").textContent, "1");
  eq("the summary counts the other clauses unchanged", d.getElementById("sUnchanged").textContent, "2");
  ok("the status line reports the comparison", /Compared \d\d\/\d\d\/\d{4}/.test(d.getElementById("status").textContent),
    d.getElementById("status").textContent);
  ok("no word-level markup was rendered", !/<del|<ins|<mark/i.test(d.getElementById("findings").innerHTML));

  /* identical documents */
  b.value = CONTRACT_A;
  d.getElementById("compare").click();
  eq("identical documents render no findings", d.querySelectorAll(".finding").length, 0);
  ok("identical documents say nothing changed in meaning",
    /No clause changed in meaning/.test(d.getElementById("empty").textContent + d.getElementById("status").textContent));

  /* both empty */
  a.value = "";
  b.value = "";
  d.getElementById("compare").click();
  ok("two empty documents are refused with a reason",
    /Nothing to compare/.test(d.getElementById("status").textContent), d.getElementById("status").textContent);

  /* one side empty is 'empty', not 'all removed' */
  a.value = CONTRACT_A;
  b.value = "";
  d.getElementById("compare").click();
  ok("one empty side is reported as empty, not as removals",
    /Document B is empty/.test(d.getElementById("status").textContent), d.getElementById("status").textContent);
  eq("no removal finding is rendered for an empty document", d.querySelectorAll(".finding.removed").length, 0);

  /* the example */
  d.getElementById("example").click();
  ok("the example loads two versions", a.value.length > 50 && b.value.length > a.value.length);
  d.getElementById("compare").click();
  ok("the example produces at least one reworded finding", d.querySelectorAll(".finding.reworded").length >= 1);
  ok("the example is labelled as invented", /invented/.test(d.getElementById("status").textContent));

  /* export: success path, with the browser bits stubbed */
  w.URL.createObjectURL = function () { return "blob:stub"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  d.getElementById("exportMd").click();
  ok("a successful export names the file it wrote",
    /Wrote doc-diff-delta-\d{4}-\d\d-\d\d\.md/.test(d.getElementById("exportNote").textContent),
    d.getElementById("exportNote").textContent);

  /* export: failure path */
  w.URL.createObjectURL = function () { throw new Error("storage is full"); };
  d.getElementById("exportJson").click();
  var status = d.getElementById("status").textContent;
  ok("a failed export says the file was not written", /not written/.test(status), status);
  ok("a failed export leaves the comparison on screen", d.querySelectorAll(".finding").length >= 1);

  var total = passed + failed.length;
  if (total === 0) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
  if (failed.length) {
    console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
    failed.forEach(function (f) { console.error("  FAIL " + f); });
    process.exit(1);
  }
  console.log("ui-tests: " + passed + "/" + total + " assertions passed");
  dom.window.close();
})();
