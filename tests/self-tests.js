#!/usr/bin/env node
/* self-tests — Doc Diff. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Every "must not" in the spec is a named test below, so it fails if the app ever
 * starts doing it. Every "when things go wrong" case is a case. A suite of zero
 * assertions is a failure, not a pass, so the count is printed and checked.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var CORE_PATH = path.join(ROOT, "docs", "play", "diff-core.js");
var C = require(CORE_PATH);

var passed = 0;
var failed = [];
var group = "";

function section(name) { group = name; }

function ok(name, cond, detail) {
  if (cond) { passed++; return; }
  failed.push(group + " :: " + name + (detail ? " — " + detail : ""));
}

function eq(name, actual, expected) {
  ok(name, actual === expected, "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}

function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }

/* ---------------------------------------------------------------- fixtures */

var CONTRACT_A = [
  "1. The Supplier shall deliver the goods on or before 5 May 2026.",
  "2. Payment shall be made within thirty days of delivery.",
  "3. Either party may terminate this agreement with sixty days written notice.",
  "4. The price is Rs 1,00,000, exclusive of GST."
].join("\n\n");

var CONTRACT_B = [
  "1. The Supplier shall deliver the goods on or before 5 May 2026.",
  "2. Payment shall be made within forty-five days of delivery.",
  "3. Either party may terminate this agreement with sixty days written notice.",
  "4. The price is Rs 1,00,000, exclusive of GST."
].join("\n\n");

/* ============================================================ the mechanic */

section("mechanic — compares by clause, not by line");

var reflowed = CONTRACT_A.replace("The Supplier shall deliver the goods on or before 5 May 2026.",
  "The Supplier shall deliver the goods\non or before 5 May 2026.").replace(/\n\n2\./, "\n\n\n2.");
var rReflow = C.compare(CONTRACT_A, reflowed);
eq("a reflowed paragraph is not a change", rReflow.findings.length, 0);
ok("a reflow is reported as identical", rReflow.identical === true);

var renumbered = CONTRACT_A.replace(/^(\d)/gm, function (d) { return String(Number(d) + 10); });
var rRenum = C.compare(CONTRACT_A, renumbered);
eq("a renumbered clause is not a change", rRenum.findings.length, 0);

var moved = [
  "1. The Supplier shall deliver the goods on or before 5 May 2026.",
  "2. Either party may terminate this agreement with sixty days written notice.",
  "3. Payment shall be made within thirty days of delivery.",
  "4. The price is Rs 1,00,000, exclusive of GST."
].join("\n\n");
eq("a moved clause is not a change", C.compare(CONTRACT_A, moved).findings.length, 0);

var rOne = C.compare(CONTRACT_A, CONTRACT_B);
eq("one reworded clause produces exactly one finding", rOne.findings.length, 1);
eq("that finding is the reworded clause", rOne.findings[0].type, "reworded");
eq("the other three clauses are counted unchanged", rOne.counts.unchanged, 3);
ok("the reworded finding carries both texts",
  /thirty days/.test(rOne.findings[0].aText) && /forty-five days/.test(rOne.findings[0].bText));

var rAdd = C.compare(CONTRACT_A, CONTRACT_B + "\n\n5. Late delivery attracts a penalty of 2% per week.");
eq("an added clause is one addition", rAdd.counts.added, 1);
eq("an added clause adds no removal", rAdd.counts.removed, 0);

var rRem = C.compare(CONTRACT_A, "1. The Supplier shall deliver the goods on or before 5 May 2026.\n\n2. Payment shall be made within thirty days of delivery.\n\n3. Either party may terminate this agreement with sixty days written notice.");
eq("a dropped clause is one removal", rRem.counts.removed, 1);

var rUnc = C.compare("Payment shall be made within thirty days of delivery.",
  "Payment must be settled inside thirty days of the delivery date.");
eq("a clause it cannot call is reported as uncertain", rUnc.findings.length && rUnc.findings[0].type, "uncertain");
ok("the uncertain band is narrower than reworded",
  rUnc.findings[0].similarity >= C.UNCERTAIN_MIN && rUnc.findings[0].similarity < C.REWORD_MIN,
  "similarity " + rUnc.findings[0].similarity);
ok("it says it cannot tell", /cannot tell/.test(C.say(rUnc.findings[0])));

section("mechanic — clause splitting");
var cl = C.splitClauses("4. The price is Rs 1,00,000, exclusive of GST.");
eq("a list marker is stripped from the compared text", cl[0].text, "The price is Rs 1,00,000, exclusive of GST.");
eq("the marker is kept for display", cl[0].marker, "4.");
eq("a decimal point is not a sentence break", C.splitClauses("The rate is 1.5 per cent. It applies to all invoices.").length, 2);
eq("a rupee amount survives tokenising", C.tokens("Rs \u20b91,00,000").indexOf("\u20b91") >= 0 || C.tokens("Rs \u20b91,00,000").indexOf("1") >= 0, true);
eq("an empty document has no clauses", C.splitClauses("   \n\n  ").length, 0);
eq("identical clauses score 1", C.similarity("the same words here", "the same words here"), 1);

section("mechanic — invariants");
var inv = C.compare(CONTRACT_A, CONTRACT_B);
eq("every clause in A is accounted for",
  inv.counts.unchanged + inv.counts.reworded + inv.counts.removed + inv.counts.uncertain, inv.aCount);
eq("every clause in B is accounted for",
  inv.counts.unchanged + inv.counts.reworded + inv.counts.added + inv.counts.uncertain, inv.bCount);
eq("the same input twice gives the same answer",
  JSON.stringify(C.compare(CONTRACT_A, CONTRACT_B)), JSON.stringify(C.compare(CONTRACT_A, CONTRACT_B)));

/* ======================================================== the must-nots */

section("must-not 1 — no word-level colouring");
var coreSrc = read("docs/play/diff-core.js");
var appSrc = read("docs/play/app.js");
var pageSrc = read("docs/play/index.html");
ok("must_not_word_level_diff: the engine exposes no word or character diff",
  !/diffWords|wordDiff|charDiff|inlineDiff|markWord/.test(coreSrc));
ok("must_not_word_level_diff: the page renders no <del> or <ins> markup",
  !/<del\b|<ins\b|<mark\b/i.test(pageSrc) && !/<del\b|<ins\b|<mark\b/i.test(appSrc));
ok("must_not_word_level_diff: a finding has no word-level field",
  Object.keys(rOne.findings[0]).every(function (k) {
    return ["type", "aIndex", "bIndex", "aText", "bText", "aMarker", "bMarker", "similarity"].indexOf(k) >= 0;
  }), Object.keys(rOne.findings[0]).join(","));
ok("must_not_word_level_diff: the export carries clause text, not word marks",
  !/<del\b|<ins\b/.test(C.toMarkdown(rOne, { when: "24/11/2026" })));

section("must-not 2 — an unreadable file is refused, not compared");
["pdf", "docx", "doc", "odt", "rtf", "html"].forEach(function (ext) {
  var gate = C.classifyFile("contract." + ext, "application/octet-stream");
  ok("must_not_compare_unreadable_input: ." + ext + " is refused", gate.ok === false);
  ok("must_not_compare_unreadable_input: ." + ext + " says nothing was compared",
    /Nothing was compared/.test(gate.reason), gate.reason);
});
ok("must_not_compare_unreadable_input: .txt is accepted", C.classifyFile("contract.txt", "text/plain").ok === true);
ok("must_not_compare_unreadable_input: .md is accepted", C.classifyFile("notes.md", "text/markdown").ok === true);
var badBytes = C.decodeDocument(new Uint8Array([0x41, 0x00, 0x42]));
ok("must_not_compare_unreadable_input: binary bytes are refused", badBytes.ok === false);
ok("must_not_compare_unreadable_input: the refusal names the reason", /NUL|binary/.test(badBytes.reason));
var badUtf8 = C.decodeDocument(new Uint8Array([0xff, 0xfe, 0x41]));
ok("must_not_compare_unreadable_input: invalid UTF-8 is refused, not guessed", badUtf8.ok === false);
ok("must_not_compare_unreadable_input: the app refuses before comparing",
  /classifyFile/.test(appSrc) && /decodeDocument/.test(appSrc) && /return;/.test(appSrc));

section("must-not 3 — an empty document is empty, not 'all removed'");
var rEmptyB = C.compare(CONTRACT_A, "");
eq("must_not_report_empty_as_all_removed: status is empty-b", rEmptyB.status, "empty-b");
eq("must_not_report_empty_as_all_removed: nothing is reported removed", rEmptyB.counts.removed, 0);
ok("must_not_report_empty_as_all_removed: it says the document is empty", /empty/.test(rEmptyB.note));
var rEmptyA = C.compare("", CONTRACT_B);
eq("must_not_report_empty_as_all_removed: status is empty-a", rEmptyA.status, "empty-a");
eq("must_not_report_empty_as_all_removed: nothing is reported added", rEmptyA.counts.added, 0);

section("must-not 4 — no clauses is not 'no changes'");
var rNone = C.compare("   ", "\n\n\t");
eq("must_not_certify_when_no_clauses: status is no-comparable-clauses", rNone.status, "no-comparable-clauses");
eq("must_not_certify_when_no_clauses: it is not called identical", rNone.identical, false);
ok("must_not_certify_when_no_clauses: the note refuses to certify",
  /not the same as/.test(rNone.note), rNone.note);

section("must-not 5 — nothing leaves the device");
["docs/play/app.js", "docs/play/diff-core.js", "docs/play/sw.js", "docs/play/web-kit.js", "docs/play/export-kit.js"].forEach(function (f) {
  var src = read(f);
  ok("must_not_call_the_network: " + f + " has no fetch call", !/\bfetch\s*\(/.test(src));
  ok("must_not_call_the_network: " + f + " has no XHR or WebSocket",
    !/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
});
ok("must_not_call_the_network: the page forbids connections in its CSP",
  /connect-src 'none'/.test(pageSrc));
ok("must_not_call_the_network: the service worker is cache-only", !/caches\.match\([^)]*\)\s*\.then\([^)]*fetch/.test(read("docs/play/sw.js")) && !/\bfetch\s*\(/.test(read("docs/play/sw.js")));

section("must-not 6 — nothing is stored");
ok("must_not_store_documents: the page never touches localStorage, sessionStorage or IndexedDB",
  !/localStorage|sessionStorage|indexedDB/.test(appSrc) && !/localStorage|sessionStorage|indexedDB/.test(pageSrc));
ok("must_not_store_documents: the engine holds no state between calls",
  !/var\s+(cache|store|saved)\s*=\s*\{/.test(coreSrc));

/* ================================================== the failure cases */

section("failure case — storage full or unavailable on export");
var thrown = C.exportDelta(rOne, { when: "24/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
}, "md");
eq("a failed save is reported as failed", thrown.ok, false);
ok("a failed save says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed save names the cause", /storage is full/.test(thrown.reason), thrown.reason);
eq("the comparison survives a failed save", rOne.findings.length, 1);

var noWriter = C.exportDelta(rOne, { when: "24/11/2026" }, null, "md");
eq("no writer means no file", noWriter.ok, false);

var refusedWriter = C.exportDelta(rOne, { when: "24/11/2026" }, function () { return false; }, "md");
eq("a refused writer is reported, not swallowed", refusedWriter.ok, false);

section("export — the delta, not the two documents");
var written = null;
var okMd = C.exportDelta(rOne, { when: "24/11/2026" }, function (name, body, mime) {
  written = { name: name, body: body, mime: mime };
  return true;
}, "md");
eq("the markdown export reports success", okMd.ok, true);
eq("the filename is dated dd/mm/yyyy as yyyy-mm-dd", written.name, "doc-diff-delta-2026-11-24.md");
ok("the export is the delta, not the documents", /Doc Diff/.test(written.body) && /Findings/.test(written.body));
ok("the export lists the one reworded clause", (written.body.match(/REWORDED/g) || []).length === 1);
ok("the export carries the Indian date format it was given", /Compared 24\/11\/2026/.test(written.body));
ok("the export does not paste the whole of document A", written.body.indexOf("Either party may terminate") === -1);

var jsonOut = null;
C.exportDelta(rOne, { when: "24/11/2026" }, function (name, body) { jsonOut = JSON.parse(body); return true; }, "json");
eq("the json export parses", typeof jsonOut, "object");
eq("the json export counts one finding", jsonOut.findings.length, 1);
eq("the json export names the tool", jsonOut.tool, "doc-diff");

/* ================================================== the shape on disk */

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (tag) {
  return tag.replace(/.*src="([^"]+)".*/, "$1");
});
ok("the page loads at least three scripts", srcs.length >= 3, srcs.join(","));
srcs.forEach(function (s) {
  var p = path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""));
  ok("script src resolves: " + s, fs.existsSync(p), p);
});
ok("the page has a CSP", /Content-Security-Policy/.test(page));
ok("the page declares the manifest", /rel="manifest"/.test(page));
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));
ok("the licence is present", fs.existsSync(path.join(ROOT, "LICENSE")));

/* ============================================================== summary */

var total = passed + failed.length;
if (total === 0) {
  console.error("self-tests: 0 assertions ran. That is a failure, not a pass.");
  process.exit(1);
}
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
