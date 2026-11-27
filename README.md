# Doc Diff

Compare two documents and see exactly what changed, **clause by clause**.

- **Demo (the app itself):** https://drsamonline.github.io/app-doc-diff/play/index.html
  — **not live yet.** The build credential cannot create a GitHub Pages site
  (`403 Resource not accessible by integration`), and neither can the repository's own
  workflow token. One manual step by the owner turns it on: *Settings → Pages → Source:
  Deploy from a branch → `main` / `/docs`*. Nothing else is missing.
- **Landing page (same host):** https://drsamonline.github.io/app-doc-diff/
- **Plan row:** #1 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-doc-diff` (lead), `app-diff-bench`
- **Licence:** PolyForm Noncommercial 1.0.0
- **Sponsor:** [github.com/sponsors/drsamonline](https://github.com/sponsors/drsamonline) — free, offline, no account

## Status

| | |
|---|---|
| **Built** | Clause splitting (paragraph, list marker, sentence); marker-stripped comparison so a renumber is not a change; exact-match pass so a moved or reflowed clause is not a change; reword detection with a similarity score; additions and removals; a "cannot tell" band; export of the delta as Markdown or JSON; file and byte gates; PWA shell that works from `file://`. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI, attached to the rolling release: [app-latest](https://github.com/drsamonline/app-doc-diff/releases/tag/app-latest) |
| **Not built** | Reading `.docx`, `.pdf`, `.odt`, `.rtf`, `.html` — refused by type instead. |
| **Untested** | Not covered by any test: dragging a file in from the OS, reading a file through the file picker, the service worker and the install prompt (jsdom implements neither). Everything else — the engine, the page wiring, the export, the empty and refused cases — is asserted. |

## The mechanic

It compares **by clause, not by line and not by word**:

- a reflowed paragraph — same words, different line breaks — is **not** a change;
- a renumbered clause is **not** a change;
- a clause that moved is **not** a change;
- one reworded clause is **exactly one finding**, not forty lines of noise;
- when two clauses are close but not the same, it says **it cannot tell** instead of guessing.

```
A: 2. Payment shall be made within thirty days of delivery.
B: 2. Payment shall be made within forty-five days of delivery.
→ 1 finding · reworded · similarity 0.69
```

## How to run it

- **In a browser:** open `docs/play/index.html`. No build step, no server.
- **As an app:** open the demo and use your browser's *Install* / *Add to Home Screen*.
- **From disk:** double-click `docs/play/index.html` — it works from `file://` too.
- **Tests:** `npm test` — or one at a time: `node tests/self-tests.js` (engine, 92 assertions),
  `node tests/page-smoke.js` (the shape on disk), `node tests/ui-tests.js` (the page in a real DOM,
  22 assertions, needs the dev-only `jsdom`). The app itself has no dependency.

## What it will not do

- **No word-level or character-level colouring.** The question is what changed in meaning.
- **No network at runtime.** No fetch, no XHR, no WebSocket, no CDN — asserted by test, and the
  page's CSP sets `connect-src 'none'`. The documents never leave the device.
- **No storage.** Nothing is kept between visits: no localStorage, no IndexedDB. If you want the
  result, export it. There is therefore no saved state to corrupt.
- **No invented confidence.** An empty document is reported as *empty*, not as "everything
  removed"; a document with no clauses is reported as *no comparable clauses*, not as "no
  changes"; a file it cannot read is refused by type with the reason.

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | The file is refused with its type (`.pdf`, `.docx`, binary, invalid UTF-8) and nothing is compared. |
| **No network** | Nothing changes — the app never needed one. |
| **Storage full or unavailable** | The comparison still runs in memory; the export fails and the page says the file was not written. |
| **Corrupt saved state** | There is no saved state. A damaged file is refused at open, with the reason. |

## Layout

```
docs/index.html            landing page — what it is, honest status, how to run
docs/play/index.html       the app
docs/play/app.js           DOM wiring: drop zones, findings, export button
docs/play/diff-core.js     the engine — pure functions, no DOM, no network
docs/play/web-kit.js       vendored kit: shell, PWA registration (unmodified)
docs/play/export-kit.js    vendored kit: Blob download (unmodified)
docs/play/sw.js            cache-only service worker
docs/play/manifest.webmanifest, icon-192.png, icon-512.png
tests/self-tests.js        92 assertions; every must-not is a named test
tests/page-smoke.js        every local src/href resolves, nothing off-origin
tests/ui-tests.js          22 assertions; the page wired to the engine, in jsdom
PAGES.json                 which file is the landing page and which is the app
```

## The must-nots, and the test that holds each

| Must not | Test |
|---|---|
| attempt a full text diff with word-level colouring | `must_not_word_level_diff` — no word/char diff function, no `<del>`/`<ins>`, no word-level field on a finding |
| compare a file it cannot read | `must_not_compare_unreadable_input` — six refused extensions, NUL bytes, invalid UTF-8 |
| report an empty document as "all removed" | `must_not_report_empty_as_all_removed` — status `empty-a`/`empty-b`, zero removals |
| certify two texts as identical when no clauses were found | `must_not_certify_when_no_clauses` — status `no-comparable-clauses`, `identical: false` |
| let a document leave the device | `must_not_call_the_network` — no `fetch(`/XHR/WebSocket/beacon in any shipped file, CSP `connect-src 'none'` |
| store the documents | `must_not_store_documents` — no localStorage/sessionStorage/IndexedDB in the page or the app |

Mutation-tested four ways on 25/11/2026: removing the empty-document guard, letting an
unreadable file through, and reporting a failed save as saved each turned the suite red
(3, 12 and 3 failures respectively), and not rendering the findings turned the UI suite red;
restored, 92/92 + 22/22 pass.

## What is not built, and why

**Format support.** `.docx`, `.pdf`, `.odt` are the formats a contract usually arrives in, and
none is read. Parsing them properly needs a vendored parser and its licence in `NOTICE`; a
half-parser that silently drops clauses would break the app's one promise. They are refused by
type instead, and the refusal says so.

## Where the spec was silent, and what was chosen

- **Similarity thresholds.** Reworded at ≥ 0.55, "cannot tell" between 0.34 and 0.55, different
  below that. Tuned against the fixture contracts; a wrong call at the boundary shows up as an
  "cannot tell" finding rather than a false match.
- **A moved clause** is treated as unchanged rather than as a move. The spec asks what changed
  in meaning; a clause that moved says the same thing.
- **Sentence splitting** is manual (no lookbehind regex) so the same code runs in every browser
  and in `node`, and decimal points like `1.5` do not split a clause.
- **Markers** (`1.`, `(a)`, `–`) are stripped before comparison but shown in the finding, so
  renumbering never registers as a change.

## Licence

PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE). No third-party dependencies; the two
vendored kits are this project's own, same licence, unmodified — see [NOTICE](NOTICE).
