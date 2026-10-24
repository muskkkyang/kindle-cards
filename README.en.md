<div align="center">
  <img src="./assets/kindle-cards-icon.png" width="88" alt="Kindle Cards icon">
  <h1>Kindle Cards</h1>
  <p><strong>Turn Kindle highlights into reading material you can organize, find, and share.</strong></p>
  <p>Local first · No account · Portable on Windows</p>
  <p>
    <a href="https://github.com/muskkkyang/kindle-cards/releases/latest">Download for Windows</a>
    · <a href="./CHANGELOG.md">Changelog</a>
    · <a href="./README.md">简体中文</a>
  </p>
  <p>
    <a href="https://github.com/muskkkyang/kindle-cards/actions/workflows/ci.yml"><img src="https://github.com/muskkkyang/kindle-cards/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/muskkkyang/kindle-cards/releases/latest"><img src="https://img.shields.io/github/v/release/muskkkyang/kindle-cards" alt="Release"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-8a5a44.svg" alt="MIT License"></a>
  </p>
</div>

![Kindle Cards bookshelf home with sample data](./docs/images/20261024-shelf-desktop.png)

Kindle Cards brings Kindle highlights, notes, and screenshots into one focused local workflow. Connect a device or import a file, search and refine the material, then export portable text, polished PNG cards, or a batch ZIP.

> Your reading data stays on your computer. Kindle Cards requires no account or cloud service and includes no analytics, ads, or automatic uploads.

## v1.4.0 stable release

[Download the Windows x64 portable ZIP](https://github.com/muskkkyang/kindle-cards/releases/download/v1.4.0/kindle-cards-1.4.0-windows-x64.zip) · [Release notes and SHA-256 file](https://github.com/muskkkyang/kindle-cards/releases/tag/v1.4.0)

Start on **My Bookshelf**, search by title or author, switch between grid and list views, and open a book to browse its highlights and create cards. Highlights and screenshots also have dedicated navigation entries. The shelf represents books in imported highlights, rather than a complete inventory of the device.

This release fixes cropped screenshot thumbnails, compressed covers in the compact shelf, receipt spacing on phone and landscape cards, and unreferenced images bloating backups. Covers retain their proportions, with titles and authors laid out separately.

## From highlight to card

| 01 · Bring it back                                                                                   | 02 · Make it yours                                                                                         | 03 · Export and share                                                                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Find a drive-letter or Windows MTP/WPD Kindle automatically, or import and paste `My Clippings.txt`. | Search titles and text, edit comments and tags, and reconcile repeated syncs without losing local changes. | Copy portable note text or export quote, comment, and memo cards as PNG or a batch ZIP. |

While the page is visible, Kindle Cards checks the device and content revision every five seconds. It performs an incremental merge only when `My Clippings.txt` has changed.

Kindle Cards v1.4.0 fills missing bookshelf covers from readable EPUB, MOBI, AZW, AZW3, and unprotected KFX cover resources on a connected Kindle. It processes pending books in batches while the page is visible, checks every minute when idle, and supports manual retry. Matching preserves existing covers and leaves ambiguous editions for manual selection. Windows MTP verification on 2026-10-23 filled 19 of 21 books; books without a readable cover resource still support manual upload. Imported covers stay local and are included in complete backups. See [verification and limits](docs/2026-10-23-cover-thumbnails-fix.md). This feature is included in the stable release.

## Built for what happens after reading

| Reading library                                                                              | Card studio                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Parse Chinese and English titles, authors, pages, locations, highlights, notes, and hashtags | Quote, comment, memo, and book-page templates with covers     |
| Reconcile edited Kindle notes and keep the more complete version                             | Paper, light, dark, and receipt themes                        |
| Search locally, filter by tags, edit, and autosave                                           | Reading landscape, 1:1, 3:4, wide, and full-screen 9:16 sizes |
| Deduplicate screenshots by content and retain edit history                                   | Single PNG and batch ZIP export                               |

### A complete mobile workspace

| Library                                                                                  | Full-screen receipt card                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| <img src="./docs/images/mobile-library.png" width="390" alt="Mobile highlights library"> | <img src="./docs/images/mobile-receipt-card.png" width="390" alt="Full-screen mobile receipt card"> |

On narrow screens, the library and card studio become separate views with an unobstructed bottom switcher. Full-screen cards export at a fixed `1080 × 1920`, ready for mobile publishing.

### Kindle screenshots, in the same workflow

Kindle Cards discovers PNG/JPEG images in the Kindle root, `screenshots`, and `documents/screenshots` folders. Local uploads are supported as well.

- Portrait and landscape thumbnails show the complete image. Originals remain intact; cropping and captions are non-destructive edits.
- Windows OCR uses installed system languages. Results remain editable before they are copied or added to a card.
- Originals and additive edit revisions live in `data/screenshots/`; `KINDLE_CARDS_DATA_DIR` can point new assets elsewhere.
- Manual imports accept images up to 20 MB, and OCR always reads the complete original.

## Quick start

### Portable Windows build

1. Download `kindle-cards-*-windows-x64.zip` from [Releases](https://github.com/muskkkyang/kindle-cards/releases/latest).
2. Extract it somewhere you intend to keep it.
3. Double-click `Kindle Cards.cmd`.

The package includes its runtime and production dependencies. Node.js, Git, and npm are not required. Import [`sample-clippings.txt`](./sample-clippings.txt) to try the complete workflow without a Kindle.

### Upgrade from an earlier version

1. Export a complete backup from **备份与恢复** (Backup and restore) in the old version, and keep the original installation.
2. Extract and launch the new version in a separate folder. Restore the ZIP if using a different browser or local port.
3. Check highlights, comments, tags, covers, and screenshots before retiring the old installation. Do not clear browser site data as part of the upgrade.

### Run from source

Install [Node.js 22.22.2 or newer](https://nodejs.org/), then run:

```powershell
git clone https://github.com/muskkkyang/kindle-cards.git
cd kindle-cards
npm ci
npm run dev
```

Open `http://127.0.0.1:4310`. On Windows, the repository launcher is also available:

```powershell
powershell -ExecutionPolicy Bypass -File .\launch.ps1
```

It validates Node.js, installs locked dependencies, builds when needed, and selects a free port from `4310-4319`. To create a desktop shortcut, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-desktop-shortcut.ps1
```

The script preserves an existing shortcut unless `-Force` is supplied.

## Add comments and tags on Kindle

Write a note directly on Kindle:

```text
#writing #psychology This line belongs in the opening paragraph.
```

After sync, Kindle Cards separates it into the original highlight, a clean comment, and the `writing` and `psychology` tags.

## Data and privacy

| Data                                     | Default location                         | Behavior                                                                              |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Highlights, comments, tags, and settings | Current browser `localStorage`           | Never uploaded automatically; changing the browser origin or port does not migrate it |
| Kindle screenshots and edit history      | `data/screenshots/` beside the app       | Originals and each edit revision are stored separately                                |
| Covers and image backgrounds             | `data/screenshots/media/` beside the app | Images stay local; settings retain references                                         |
| MTP/WPD snapshots                        | System temporary directory               | Read-only copy removed immediately after parsing                                      |

The page and local API listen only on `127.0.0.1`. The service reads Kindle's `My Clippings.txt`, discoverable screenshots, and accessible book cover resources only during an import or while the page is visible. It does not expose the full device path to the browser. Copying note text writes only to the local clipboard.

Use **备份与恢复 → 导出完整备份** (Backup and restore → Export complete backup) in the sidebar or top bar to create a ZIP containing highlights, local edits, settings, screenshot originals, edit history, and covers or backgrounds still referenced by settings or edit history. Replaced media with no remaining references is excluded; the complete backup limit is 256 MB. Restore verifies the manifest, file sizes, and SHA-256 hashes before adding missing data; current data wins when the same ID differs.

Browser-local storage alone is not a backup. Export a complete backup before an upgrade or computer migration, and keep Kindle's original `My Clippings.txt` as well.

## Development and verification

```powershell
npm ci
npm run check
```

The quality gate runs ESLint, TypeScript, unit tests, UI tests, a production build, and Prettier verification.

| Command                        | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `npm run dev`                  | Start the local development service                 |
| `npm run test`                 | Run parser, service, storage, and UI tests          |
| `npm run typecheck`            | Check TypeScript types                              |
| `npm run build`                | Build production assets                             |
| `npm run package:portable:win` | Build the Windows x64 portable ZIP and SHA-256 file |

See the [architecture](./docs/ARCHITECTURE.md), [V1.x iteration and acceptance notes](./docs/V1.x-iterations.md), [contributing guide](./CONTRIBUTING.md), and [security policy](./SECURITY.md) for details.

## Current scope

v1.4.0 is a stable release. An independent book vault, SQLite, reading insights, and AI chat remain in the [roadmap](./Kindle%20Cards%20后续开发项目计划书.md). Cover extraction does not bypass DRM; manual upload remains available when no readable resource exists.

Release checks include 34 Node tests, 15 UI/storage tests, and Windows portable package verification. Unplugging during the exact transfer window was waived by the user, not recorded as a passing test. See the [acceptance record](./docs/V1.4-acceptance.md).

## License

[MIT](./LICENSE)
