# Changelog

All notable changes to Doc Diff are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates: dd/mm/yyyy.

## [Unreleased]

## [1.0.0] — 25/11/2026

### Added
- Clause comparison engine (`docs/play/diff-core.js`): paragraph, marker and sentence
  splitting; markers stripped before comparison so a renumber is not a change; exact-match
  pass so a moved clause is not a change; greedy similarity matching for reworded clauses;
  a "cannot tell" band between different and reworded.
- Reworded / added / removed / uncertain findings, each with the before and after text.
- Export of the delta as Markdown or JSON, with the export failure reported instead of
  swallowed.
- File gate: .txt, .text, .md, .markdown, .rst are read; .pdf, .docx, .doc, .odt, .rtf,
  .html are refused by type with the reason, and nothing is compared.
- Byte gate: NUL bytes and invalid UTF-8 are refused, not guessed at.
- PWA shell: manifest, cache-only service worker, icons. Works from `file://`.
- Tests: 1 suite, every must-not a named assertion, `node tests/self-tests.js`.
- CI: `.github/workflows/ci.yml` runs the suite and the page smoke check on every push.

### Not built
- A packaged EXE / APK release. `app-builder` is not available in the build environment;
  the app is a web app and the same bytes run as a file, an installed PWA, and (once
  packaged) an APK. See README "What is not built".
