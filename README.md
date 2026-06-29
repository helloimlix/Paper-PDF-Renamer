<<<<<<< HEAD
# Paper-PDF-Renamer
A Chrome extension that automatically renames downloaded academic paper PDFs using their paper titles, with support for arXiv and OpenReview, confirmation before saving, and tools for organizing old PDF files.
=======
# Paper PDF Renamer

Paper PDF Renamer is a Chrome extension that renames downloaded academic paper PDFs using the paper title.

Instead of saving files with names like:

```text
2601.02732v1.pdf
paper.pdf
download.pdf
```

the extension suggests clean filenames such as:

```text
Attention Is All You Need.pdf
```

## Features

- Supports arXiv and OpenReview in the MVP version.
- Detects paper titles from public paper IDs and site APIs.
- Shows a confirmation window before saving the renamed PDF.
- Allows editing the suggested filename before download.
- Saves files as `{paper title}.pdf`.
- Offers settings for enabling/disabling renaming, network lookup, supported sites, and overwrite behavior.
- Includes a local old-PDF renamer for user-selected folders.

## How It Works

The extension listens for Chrome download filename decisions through the Chrome Downloads API.

When a PDF download starts, it:

1. Checks whether the file is likely to be a PDF.
2. Detects whether the URL or filename matches arXiv or OpenReview.
3. Looks up the paper title using the public arXiv or OpenReview APIs.
4. Opens a confirmation window with the suggested filename.
5. Saves the PDF using the confirmed title-based filename.

## Installation

This project is currently intended to be loaded as an unpacked Chrome extension.

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `paper-pdf-renamer-extension` folder.
5. Download a PDF from arXiv or OpenReview to test it.

## Usage

### Rename New Downloads

Open an arXiv or OpenReview paper page and download the PDF. A confirmation window will appear with the detected paper title. You can rename the file, keep the original filename, or allow overwriting an existing same-name file.

### Rename Old PDFs

Click the extension icon, then open `Old PDFs`.

The old-PDF tool lets you select a local folder, scan PDF files, and rename recognized papers. Browser security requires explicit folder selection before the extension can access local files.

For files that cannot be recognized automatically, you can type the target filename manually.

## Supported Sources

Current MVP support:

- arXiv
- OpenReview

Planned future sources may include Crossref, DOI-based lookup, Semantic Scholar, ACM, IEEE, Springer, and other publisher pages.

## Privacy

The extension does not upload PDF files.

For title lookup, it may send public paper identifiers or paper URLs to arXiv or OpenReview APIs. Settings are stored with Chrome extension storage, and recent rename history is stored locally.

## Limitations

- The current version focuses on arXiv and OpenReview.
- Some direct PDF links may not include enough information to infer the paper title.
- Local old-PDF renaming requires the user to choose a folder manually.
- Browser extensions do not provide a native local file rename API, so the old-PDF tool copies the file to the new name and removes the old file after the copy succeeds.

## Project Structure

```text
paper-pdf-renamer-design.md
paper-pdf-renamer-extension/
  manifest.json
  background.js
  shared-utils.js
  confirm.html
  confirm.js
  popup.html
  popup.js
  options.html
  options.js
  batch.html
  batch.js
  styles.css
  README.md
```

## Development Notes

The extension is built with plain HTML, CSS, and JavaScript. There is no build step required for the MVP version.

After changing extension files, reload the extension from `chrome://extensions` before testing again.
>>>>>>> 3a71e8a (Add Paper PDF Renamer extension)
