/* diff-core — the clause comparison engine behind Doc Diff.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Pure functions only: no DOM, no network, no storage. Runs in the browser as
 * window.DocDiffCore and under `node` as module.exports, so the tests exercise
 * the same bytes the page loads.
 *
 * It compares by CLAUSE, not by line and not by word:
 *   - a reflowed paragraph (same words, different line breaks) is not a change;
 *   - a renumbered clause is not a change;
 *   - one reworded clause is exactly one finding;
 *   - when two clauses are similar but not the same, it says it cannot tell
 *     instead of guessing.
 * It deliberately has no word-level diff: the question it answers is "what
 * changed in meaning", not "which words moved".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DocDiffCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";

  /* A clause at or above this similarity is the same clause, reworded. */
  var REWORD_MIN = 0.55;
  /* Between this and REWORD_MIN the app says it cannot tell. Below it, different. */
  var UNCERTAIN_MIN = 0.34;

  /* Files this app can read. Everything else is refused by type, never guessed at. */
  var READABLE = ["txt", "text", "md", "markdown", "rst"];
  var KNOWN_REFUSED = {
    pdf: "PDF",
    doc: "Word 97-2003",
    docx: "Word",
    odt: "OpenDocument",
    rtf: "RTF",
    html: "HTML",
    htm: "HTML",
    pages: "Apple Pages",
    epub: "EPUB"
  };

  /* ---------------------------------------------------------------- text */

  function normaliseSpace(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  /* A leading list/number/section marker is not part of the clause's meaning. */
  function stripMarker(line) {
    var m = /^(\(?[0-9]{1,3}(?:\.[0-9]{1,3})*[.)]|\([a-zA-Z0-9]{1,3}\)|[a-zA-Z]\)|[-*\u2022\u2013\u2014]|(?:clause|section|article|para)\s+[0-9A-Za-z.]+[:.]?)\s+/i.exec(line);
    if (!m) return { marker: "", text: line };
    return { marker: m[1], text: line.slice(m[0].length) };
  }

  /* Split one paragraph into sentences. Manual scan, so no lookbehind regex is
   * needed and older browsers behave the same as node. */
  function splitSentences(para) {
    var out = [];
    var buf = "";
    for (var i = 0; i < para.length; i++) {
      var ch = para.charAt(i);
      buf += ch;
      if (ch === "." || ch === "!" || ch === "?" || ch === ";") {
        var prev = para.charAt(i - 1);
        var rest = para.slice(i + 1);
        var next = rest.replace(/^\s+/, "").charAt(0);
        /* "1.5" and "Rs.5" are not sentence ends */
        if (/[0-9]/.test(prev) && /[0-9]/.test(next)) continue;
        if (/^\s+/.test(rest) && /[A-Z0-9"'\u20b9(\u2018\u201c]/.test(next)) {
          out.push(buf.trim());
          buf = "";
        }
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  /* text -> [{index, marker, text}]. text excludes the marker; comparison uses it. */
  function splitClauses(text) {
    var raw = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
    if (!raw.trim()) return [];

    var blocks = raw.split(/\n[ \t]*\n/);
    var units = [];

    blocks.forEach(function (block) {
      var buf = [];
      var bufMarker = "";
      block.split("\n").forEach(function (line) {
        var t = line.trim();
        if (!t) return;
        var sm = stripMarker(t);
        if (sm.marker && buf.length) {
          units.push({ marker: bufMarker, text: buf.join(" ") });
          buf = [];
          bufMarker = "";
        }
        if (sm.marker && !buf.length) bufMarker = sm.marker;
        buf.push(sm.text);
      });
      if (buf.length) units.push({ marker: bufMarker, text: buf.join(" ") });
    });

    var clauses = [];
    units.forEach(function (u) {
      var sentences = splitSentences(normaliseSpace(u.text));
      sentences.forEach(function (s, j) {
        var n = normaliseSpace(s);
        if (!n) return;
        clauses.push({ index: clauses.length, marker: j === 0 ? u.marker : "", text: n });
      });
    });
    return clauses;
  }

  function tokens(text) {
    return normaliseSpace(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\u20b9]+/gu, " ")
      .split(" ")
      .filter(Boolean);
  }

  /* Jaccard over token sets, damped by the length ratio, so "delete clause 4"
   * does not look like "delete clause 4 and clause 5 and clause 6". */
  function similarity(a, b) {
    var ta = tokens(a);
    var tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    var sa = Object.create(null);
    var sb = Object.create(null);
    ta.forEach(function (t) { sa[t] = 1; });
    tb.forEach(function (t) { sb[t] = 1; });
    var inter = 0;
    var uni = 0;
    Object.keys(sa).forEach(function (k) { uni++; if (sb[k]) inter++; });
    Object.keys(sb).forEach(function (k) { if (!sa[k]) uni++; });
    var jaccard = uni ? inter / uni : 0;
    var ratio = Math.min(ta.length, tb.length) / Math.max(ta.length, tb.length);
    return jaccard * (0.5 + 0.5 * ratio);
  }

  /* ------------------------------------------------------------ file gates */

  function classifyFile(name, mime) {
    var n = String(name == null ? "" : name).toLowerCase();
    var dot = n.lastIndexOf(".");
    var ext = dot >= 0 ? n.slice(dot + 1) : "";
    var mt = String(mime == null ? "" : mime).toLowerCase();
    if (!n) return { ok: false, ext: "", reason: "no file name was given, so the type is unknown — refused" };
    if (READABLE.indexOf(ext) >= 0) return { ok: true, ext: ext, reason: "" };
    if (KNOWN_REFUSED[ext]) {
      return { ok: false, ext: ext, reason: "refused: this is a " + KNOWN_REFUSED[ext] + " file (." + ext + "), which this app cannot read. Nothing was compared." };
    }
    if (mt && mt.indexOf("text/") === 0) return { ok: true, ext: ext || "text", reason: "" };
    return { ok: false, ext: ext || "unknown", reason: "refused: " + (ext ? "." + ext : "no extension") + " is not a document type this app can read. Nothing was compared." };
  }

  /* Bytes -> text, or a refusal with the reason. Never guesses at an encoding. */
  function decodeDocument(bytes) {
    if (!bytes || typeof bytes.length !== "number") {
      return { ok: false, reason: "no bytes arrived, so nothing could be read" };
    }
    var scan = Math.min(bytes.length, 4096);
    for (var i = 0; i < scan; i++) {
      if (bytes[i] === 0) {
        return { ok: false, reason: "refused: the file contains NUL bytes, so it is binary, not a text document" };
      }
    }
    try {
      var dec = new TextDecoder("utf-8", { fatal: true });
      return { ok: true, text: dec.decode(bytes) };
    } catch (e) {
      return { ok: false, reason: "refused: the file is not valid UTF-8 and was not guessed at" };
    }
  }

  /* --------------------------------------------------------------- compare */

  function pairRemaining(A, B, usedA, usedB, out, minSim, typeForSim) {
    for (;;) {
      var best = null;
      for (var i = 0; i < A.length; i++) {
        if (usedA[i]) continue;
        for (var j = 0; j < B.length; j++) {
          if (usedB[j]) continue;
          var s = similarity(A[i].text, B[j].text);
          if (s < minSim) continue;
          if (!best || s > best.s) best = { i: i, j: j, s: s };
        }
      }
      if (!best) return;
      usedA[best.i] = true;
      usedB[best.j] = true;
      out.push({
        type: typeForSim(best.s),
        aIndex: best.i,
        bIndex: best.j,
        aText: A[best.i].text,
        bText: B[best.j].text,
        aMarker: A[best.i].marker,
        bMarker: B[best.j].marker,
        similarity: Math.round(best.s * 100) / 100
      });
    }
  }

  function compare(aText, bText) {
    var A = splitClauses(aText);
    var B = splitClauses(bText);
    var result = {
      version: VERSION,
      status: "compared",
      note: "",
      aCount: A.length,
      bCount: B.length,
      findings: [],
      counts: { unchanged: 0, reworded: 0, added: 0, removed: 0, uncertain: 0 },
      identical: false
    };

    if (!A.length && !B.length) {
      result.status = "no-comparable-clauses";
      result.note = "No comparable clauses were found on either side. That is not the same as \u201cno changes\u201d.";
      return result;
    }
    if (!A.length) {
      result.status = "empty-a";
      result.note = "Document A is empty \u2014 there is nothing to compare. This is not \u201ceverything was added\u201d.";
      return result;
    }
    if (!B.length) {
      result.status = "empty-b";
      result.note = "Document B is empty \u2014 there is nothing to compare against. This is not \u201ceverything was removed\u201d.";
      return result;
    }

    var usedA = new Array(A.length);
    var usedB = new Array(B.length);
    var i;
    var j;

    /* Pass 1 — identical clause text, wherever it sits. A clause that moved or
     * was renumbered says the same thing, so it is not a finding. */
    for (i = 0; i < A.length; i++) {
      for (j = 0; j < B.length; j++) {
        if (usedB[j]) continue;
        if (A[i].text === B[j].text) {
          usedA[i] = true;
          usedB[j] = true;
          result.counts.unchanged++;
          break;
        }
      }
    }

    /* Pass 2 — reworded. */
    pairRemaining(A, B, usedA, usedB, result.findings, REWORD_MIN, function () { return "reworded"; });
    /* Pass 3 — similar enough to be the same clause, not similar enough to say so. */
    pairRemaining(A, B, usedA, usedB, result.findings, UNCERTAIN_MIN, function () { return "uncertain"; });

    /* Pass 4 — whatever is left was removed or added. */
    for (i = 0; i < A.length; i++) {
      if (usedA[i]) continue;
      result.findings.push({
        type: "removed", aIndex: i, bIndex: -1,
        aText: A[i].text, bText: "", aMarker: A[i].marker, bMarker: "", similarity: 0
      });
    }
    for (j = 0; j < B.length; j++) {
      if (usedB[j]) continue;
      result.findings.push({
        type: "added", aIndex: -1, bIndex: j,
        aText: "", bText: B[j].text, aMarker: "", bMarker: B[j].marker, similarity: 0
      });
    }

    result.findings.sort(function (x, y) {
      var ax = x.aIndex < 0 ? Number.MAX_SAFE_INTEGER : x.aIndex;
      var ay = y.aIndex < 0 ? Number.MAX_SAFE_INTEGER : y.aIndex;
      if (ax !== ay) return ax - ay;
      return x.bIndex - y.bIndex;
    });

    result.findings.forEach(function (f) {
      result.counts[f.type] = (result.counts[f.type] || 0) + 1;
    });

    result.identical = result.findings.length === 0 && A.length === B.length;
    if (result.identical) result.note = "No clause changed in meaning. A reflow, a renumber or a moved clause is not a change.";
    return result;
  }

  function say(finding) {
    if (finding.type === "uncertain") {
      return "These two clauses are close but not the same. The app cannot tell whether this is a rewrite of one clause or two different clauses.";
    }
    if (finding.type === "reworded") return "The same clause, said differently.";
    if (finding.type === "removed") return "Present in A, absent from B.";
    if (finding.type === "added") return "Absent from A, present in B.";
    return "";
  }

  /* ---------------------------------------------------------------- export */

  function label(f) {
    var m = f.aMarker || f.bMarker || "";
    var pos = f.aIndex >= 0 ? "A" + (f.aIndex + 1) : "B" + (f.bIndex + 1);
    return (m ? m + " " : "") + "(" + pos + ")";
  }

  function toMarkdown(result, meta) {
    meta = meta || {};
    var when = meta.when || "";
    var lines = [];
    lines.push("# Doc Diff \u2014 delta");
    lines.push("");
    if (when) lines.push("Compared " + when + ".");
    lines.push("Documents A and B were compared clause by clause. A reflow, a renumber or a moved clause is not a change.");
    lines.push("");
    lines.push("**Status:** " + result.status + " \u2014 " + result.aCount + " clauses in A, " + result.bCount + " in B.");
    if (result.note) lines.push(""); if (result.note) lines.push("> " + result.note);
    lines.push("");
    lines.push("| Reworded | Added | Removed | Cannot tell | Unchanged |");
    lines.push("|---|---|---|---|---|");
    lines.push("| " + result.counts.reworded + " | " + result.counts.added + " | " + result.counts.removed + " | " + result.counts.uncertain + " | " + result.counts.unchanged + " |");
    if (result.findings.length) {
      lines.push("");
      lines.push("## Findings");
      result.findings.forEach(function (f, n) {
        lines.push("");
        lines.push("### " + (n + 1) + ". " + f.type.toUpperCase() + " \u2014 " + label(f));
        lines.push("");
        if (f.type === "reworded" || f.type === "uncertain") {
          lines.push("- In A: " + f.aText);
          lines.push("- In B: " + f.bText);
          if (f.type === "reworded") lines.push("- Similarity: " + f.similarity);
        } else if (f.type === "removed") {
          lines.push("- Removed from B: " + f.aText);
        } else {
          lines.push("- Added in B: " + f.bText);
        }
        lines.push("- " + say(f));
      });
    }
    lines.push("");
    lines.push("---");
    lines.push("Made with Doc Diff. The documents never left the device.");
    return lines.join("\n");
  }

  function toJSON(result, meta) {
    meta = meta || {};
    return {
      tool: "doc-diff",
      version: VERSION,
      when: meta.when || "",
      status: result.status,
      note: result.note,
      clauses: { a: result.aCount, b: result.bCount },
      counts: result.counts,
      findings: result.findings.map(function (f) {
        return {
          type: f.type,
          aIndex: f.aIndex,
          bIndex: f.bIndex,
          aMarker: f.aMarker,
          bMarker: f.bMarker,
          aText: f.aText,
          bText: f.bText,
          similarity: f.similarity,
          says: say(f)
        };
      })
    };
  }

  function stamp(when) {
    var d = when ? String(when) : "";
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  /* writer(filename, text, mime) is the only thing that touches a file.
   * If it throws (quota, blocked, no Blob) the comparison survives and the
   * caller is told the file was not written. */
  function exportDelta(result, meta, writer, format) {
    meta = meta || {};
    if (typeof writer !== "function") {
      return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    }
    var fmt = format === "json" ? "json" : "md";
    var filename = "doc-diff-delta-" + stamp(meta.when) + "." + fmt;
    var body = fmt === "json" ? JSON.stringify(toJSON(result, meta), null, 2) : toMarkdown(result, meta);
    try {
      var wrote = writer(filename, body, fmt === "json" ? "application/json" : "text/markdown;charset=utf-8");
      if (wrote === false) {
        return { ok: false, filename: filename, reason: "the file was not written: the browser refused the save" };
      }
      return { ok: true, filename: filename, bytes: body.length, format: fmt };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: filename, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    REWORD_MIN: REWORD_MIN,
    UNCERTAIN_MIN: UNCERTAIN_MIN,
    normaliseSpace: normaliseSpace,
    stripMarker: stripMarker,
    splitSentences: splitSentences,
    splitClauses: splitClauses,
    tokens: tokens,
    similarity: similarity,
    classifyFile: classifyFile,
    decodeDocument: decodeDocument,
    compare: compare,
    say: say,
    toMarkdown: toMarkdown,
    toJSON: toJSON,
    exportDelta: exportDelta
  };
});
