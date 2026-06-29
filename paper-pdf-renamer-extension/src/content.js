chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "EXTRACT_PAGE_TITLE") {
    return false;
  }

  sendResponse({
    title: extractPaperTitle()
  });
  return false;
});

function extractPaperTitle() {
  const candidates = [
    readMeta("citation_title"),
    readMeta("dc.title"),
    readMeta("DC.Title"),
    readMetaProperty("og:title"),
    readArxivTitle(),
    readOpenReviewTitle(),
    readSelector("h1"),
    document.title
  ];

  return candidates
    .map(cleanTitle)
    .find((title) => title && title.length >= 8 && !looksLikeSiteTitle(title)) || "";
}

function readMeta(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content || "";
}

function readMetaProperty(property) {
  return document.querySelector(`meta[property="${property}"]`)?.content || "";
}

function readSelector(selector) {
  return document.querySelector(selector)?.textContent || "";
}

function readArxivTitle() {
  return document.querySelector("h1.title")?.textContent || "";
}

function readOpenReviewTitle() {
  return document.querySelector(".note_content_title")?.textContent
    || document.querySelector("[data-testid='note-title']")?.textContent
    || "";
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/^Title:\s*/i, "")
    .replace(/\s+-\s+arXiv.*$/i, "")
    .replace(/\s+\|\s+OpenReview.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSiteTitle(value) {
  const normalized = value.toLowerCase();
  return normalized === "arxiv.org"
    || normalized === "openreview"
    || normalized === "openreview.net"
    || normalized.includes("just a moment");
}
