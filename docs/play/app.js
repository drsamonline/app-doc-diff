/* app — the Doc Diff page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: every decision about what counts as a change lives in diff-core.js,
 * which the tests exercise directly. This file touches the DOM, reads dropped
 * files, and writes the export. It never calls the network, and it never stores
 * anything: the two documents live in memory until the tab closes.
 */
(function () {
  "use strict";

  var Core = window.DocDiffCore;
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    a: $("textA"), b: $("textB"),
    countA: $("countA"), countB: $("countB"),
    fileA: $("fileA"), fileB: $("fileB"),
    dropA: $("dropA"), dropB: $("dropB"),
    compare: $("compare"), example: $("example"),
    clearA: $("clearA"), clearB: $("clearB"),
    status: $("status"), summary: $("summary"), findings: $("findings"),
    empty: $("empty"), exportBar: $("exportBar"), exportNote: $("exportNote"),
    exportMd: $("exportMd"), exportJson: $("exportJson"),
    sReworded: $("sReworded"), sAdded: $("sAdded"), sRemoved: $("sRemoved"),
    sUncertain: $("sUncertain"), sUnchanged: $("sUnchanged"), sClauses: $("sClauses")
  };

  var last = { result: null, when: "" };
  /* Set while the invented example is on screen, so no status line ever presents it
   * as the user's own document. */
  var exampleOn = false;

  function exampleSuffix() { return exampleOn ? " Both documents are the invented example." : ""; }

  /* ------------------------------------------------------------- helpers */

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function setStatus(kind, message) {
    els.status.className = "status show " + kind;
    els.status.textContent = message;
  }

  function clearStatus() {
    els.status.className = "status";
    els.status.textContent = "";
  }

  function refreshCount(which) {
    var text = which === "a" ? els.a.value : els.b.value;
    var n = Core.splitClauses(text).length;
    (which === "a" ? els.countA : els.countB).textContent = n + (n === 1 ? " clause" : " clauses");
  }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function labelFor(f) {
    var marker = f.aMarker || f.bMarker || "";
    var pos = f.aIndex >= 0 ? "A" + (f.aIndex + 1) : "B" + (f.bIndex + 1);
    return (marker ? marker + " \u00b7 " : "") + pos;
  }

  /* ------------------------------------------------------------- render */

  function render(result, when) {
    els.findings.textContent = "";
    els.summary.hidden = false;
    els.sReworded.textContent = result.counts.reworded;
    els.sAdded.textContent = result.counts.added;
    els.sRemoved.textContent = result.counts.removed;
    els.sUncertain.textContent = result.counts.uncertain;
    els.sUnchanged.textContent = result.counts.unchanged;
    els.sClauses.textContent = result.aCount + " / " + result.bCount;

    if (result.status !== "compared") {
      els.empty.hidden = false;
      els.empty.textContent = result.note;
      els.exportBar.hidden = true;
      setStatus("bad", result.note);
      return;
    }

    els.exportBar.hidden = false;
    els.exportNote.textContent = "The delta is written on this device.";

    if (!result.findings.length) {
      els.empty.hidden = false;
      els.empty.textContent = "No clause changed in meaning. A reflow, a renumber or a moved clause is not a change.";
      setStatus("ok", "No clause changed in meaning \u2014 " + result.counts.unchanged + " of " + result.aCount + " clauses are unchanged." + exampleSuffix());
      return;
    }

    els.empty.hidden = true;
    var word = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
    setStatus("ok",
      word(result.counts.reworded, "reworded clause", "reworded clauses") + ", " +
      word(result.counts.added, "addition", "additions") + ", " +
      word(result.counts.removed, "removal", "removals") +
      (result.counts.uncertain ? ", " + word(result.counts.uncertain, "clause it cannot call", "clauses it cannot call") : "") +
      ". Compared " + when + "." + exampleSuffix());

    result.findings.forEach(function (f) {
      var li = node("li", "finding " + f.type);
      var head = node("div", "head");
      head.appendChild(node("span", "chip " + f.type, f.type === "uncertain" ? "cannot tell" : f.type));
      head.appendChild(node("span", null, labelFor(f)));
      if (f.type === "reworded") head.appendChild(node("span", null, "similarity " + f.similarity));
      li.appendChild(head);

      var pair = node("div", "pair");
      if (f.type === "removed") {
        var ra = node("div");
        ra.appendChild(node("span", "lbl", "In A (removed)"));
        ra.appendChild(document.createTextNode(f.aText));
        pair.appendChild(ra);
      } else if (f.type === "added") {
        var ab = node("div");
        ab.appendChild(node("span", "lbl", "In B (added)"));
        ab.appendChild(document.createTextNode(f.bText));
        pair.appendChild(ab);
      } else {
        var xa = node("div");
        xa.appendChild(node("span", "lbl", "In A"));
        xa.appendChild(document.createTextNode(f.aText));
        var xb = node("div");
        xb.appendChild(node("span", "lbl", "In B"));
        xb.appendChild(document.createTextNode(f.bText));
        pair.appendChild(xa);
        pair.appendChild(xb);
      }
      li.appendChild(pair);
      li.appendChild(node("p", "says", Core.say(f)));
      els.findings.appendChild(li);
    });
  }

  /* ------------------------------------------------------------ compare */

  function runCompare() {
    clearStatus();
    var a = els.a.value;
    var b = els.b.value;
    if (!a.trim() && !b.trim()) {
      els.summary.hidden = true;
      els.exportBar.hidden = true;
      els.findings.textContent = "";
      els.empty.hidden = false;
      els.empty.textContent = "Both sides are empty. Paste or drop two versions of the same document first.";
      setStatus("bad", "Nothing to compare: both documents are empty.");
      return;
    }
    var when = today();
    var result = Core.compare(a, b);
    last.result = result;
    last.when = when;
    render(result, when);
  }

  /* ------------------------------------------------------------- export */

  function doExport(format) {
    if (!last.result) return;
    var outcome = Core.exportDelta(last.result, { when: last.when }, function (name, body, mime) {
      if (!window.Export || typeof window.Export.save !== "function") {
        throw new Error("the export kit did not load");
      }
      window.Export.save(name, body, mime);
      return true;
    }, format);

    if (outcome.ok) {
      els.exportNote.textContent = "Wrote " + outcome.filename + " (" + outcome.bytes + " bytes).";
    } else {
      els.exportNote.textContent = "";
      setStatus("bad", "The comparison is intact, but " + outcome.reason.replace(/^the file was not written: /, "the file was not written: ") + ".");
    }
  }

  /* -------------------------------------------------------------- files */

  function acceptFile(which, file) {
    if (!file) return;
    var gate = Core.classifyFile(file.name, file.type);
    if (!gate.ok) {
      setStatus("bad", gate.reason);
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      setStatus("bad", "The file " + file.name + " could not be read. Nothing was compared.");
    };
    reader.onload = function () {
      var decoded = Core.decodeDocument(new Uint8Array(reader.result));
      if (!decoded.ok) {
        setStatus("bad", file.name + ": " + decoded.reason);
        return;
      }
      (which === "a" ? els.a : els.b).value = decoded.text;
      refreshCount(which);
      setStatus("ok", "Read " + file.name + " (" + decoded.text.length + " characters). Press Compare clauses.");
    };
    reader.readAsArrayBuffer(file);
  }

  function wireDrop(which, zone, input) {
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("over"); });
    });
    zone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      acceptFile(which, f);
    });
    input.addEventListener("change", function () {
      acceptFile(which, input.files && input.files[0]);
      input.value = "";
    });
  }

  /* ------------------------------------------------------------ example */

  var EXAMPLE_A = [
    "1. The Supplier shall deliver the goods on or before 5 May 2026.",
    "2. Payment shall be made within thirty days of delivery.",
    "3. Either party may terminate this agreement with sixty days written notice.",
    "4. The price is Rs 1,00,000, exclusive of GST."
  ].join("\n\n");

  var EXAMPLE_B = [
    "1. The Supplier shall deliver the goods on or before 5 May 2026.",
    "2. Payment shall be made within forty-five days of delivery.",
    "3. Either party may terminate this agreement with sixty days written notice.",
    "4. The price is Rs 1,00,000, exclusive of GST.",
    "5. Late delivery attracts a penalty of 2% of the invoice value per week."
  ].join("\n\n");

  /* --------------------------------------------------------------- wire */

  els.a.addEventListener("input", function () { exampleOn = false; refreshCount("a"); });
  els.b.addEventListener("input", function () { exampleOn = false; refreshCount("b"); });
  els.compare.addEventListener("click", runCompare);
  els.exportMd.addEventListener("click", function () { doExport("md"); });
  els.exportJson.addEventListener("click", function () { doExport("json"); });
  els.clearA.addEventListener("click", function () { exampleOn = false; els.a.value = ""; refreshCount("a"); });
  els.clearB.addEventListener("click", function () { exampleOn = false; els.b.value = ""; refreshCount("b"); });
  els.example.addEventListener("click", function () {
    exampleOn = true;
    els.a.value = EXAMPLE_A;
    els.b.value = EXAMPLE_B;
    refreshCount("a");
    refreshCount("b");
    setStatus("ok", "Example loaded: an invented contract, two versions. Clause 2 was reworded and clause 5 is new.");
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCompare();
    }
  });

  wireDrop("a", els.dropA, els.fileA);
  wireDrop("b", els.dropB, els.fileB);

  refreshCount("a");
  refreshCount("b");

  /* The PWA shell. Same-origin only, and it is what lets the page open with no
   * connection at all; no document ever passes through it. */
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
