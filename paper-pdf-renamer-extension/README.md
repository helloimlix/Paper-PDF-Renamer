# Paper PDF Renamer

Chrome Manifest V3 extension for renaming downloaded paper PDFs with their titles.

## MVP behavior

- Supports arXiv and OpenReview.
- Renames downloads to `{title}.pdf`.
- Shows a confirmation window before saving the renamed PDF.
- Allows arXiv and OpenReview network lookups.
- Includes an old-PDF folder tool for arXiv-style filenames.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder: `paper-pdf-renamer-extension`.
5. Download an arXiv or OpenReview PDF.

## Notes

- The confirmation window has a two-minute timeout. If it expires, the original filename is kept.
- Old local PDF renaming requires explicit folder permission through the browser folder picker.
- Browser extensions do not have a native rename call for local files. The old-PDF tool copies to the new filename and then removes the old file after the copy succeeds.
- For old PDFs, the first version recognizes arXiv IDs in filenames such as `2601.02732v1.pdf` and simple OpenReview-style names such as `openreview-abc123.pdf`.
- Unrecognized old PDFs can still be renamed by typing the target filename manually.
