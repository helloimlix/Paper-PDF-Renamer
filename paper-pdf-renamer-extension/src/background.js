const DEFAULT_SETTINGS = {
  enabled: true,
  allowNetwork: true,
  confirmBeforeRename: true,
  overwriteDownloads: false,
  enabledSites: {
    arxiv: true,
    openreview: true
  },
  maxFilenameLength: 180
};

const CONFIRMATION_TIMEOUT_MS = 60000;
const pendingConfirmations = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await chrome.storage.sync.set({ settings: mergeSettings(current) });
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleDownloadFilename(downloadItem, suggest);
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_CONFIRMATION_DETAILS") {
    const pending = pendingConfirmations.get(message.requestId);
    sendResponse(pending ? pending.details : null);
    return false;
  }

  if (message?.type === "CONFIRM_RENAME") {
    const pending = pendingConfirmations.get(message.requestId);
    if (pending) {
      pendingConfirmations.delete(message.requestId);
      pending.resolve(message.payload);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "RESOLVE_TITLE_FROM_FILENAME") {
    resolveTitleFromFilename(message.filename)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_SETTINGS") {
    chrome.storage.sync
      .set({ settings: mergeSettings(message.settings || {}) })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_RECENT_HISTORY") {
    getRecentHistory()
      .then((history) => sendResponse({ ok: true, history }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function handleDownloadFilename(downloadItem, suggest) {
  let suggested = false;

  const done = (suggestion) => {
    if (suggested) {
      return;
    }
    suggested = true;
    suggest(suggestion);
  };

  try {
    const settings = await getSettings();
    if (!settings.enabled || !isPdfDownload(downloadItem)) {
      done();
      return;
    }

    const titleResult = await resolvePaperTitle(downloadItem, settings);
    if (!titleResult?.title) {
      await recordHistory({
        status: "skipped",
        reason: titleResult?.reason || "No title found",
        originalUrl: downloadItem.finalUrl || downloadItem.url,
        originalFilename: basename(downloadItem.filename)
      });
      done();
      return;
    }

    const filename = buildPdfFilename(titleResult.title, settings.maxFilenameLength);
    const confirmation = settings.confirmBeforeRename
      ? await askUserToConfirm(downloadItem, filename, titleResult, settings)
      : { action: "rename", filename, overwrite: settings.overwriteDownloads };

    if (!confirmation || confirmation.action === "keep") {
      await recordHistory({
        status: "skipped",
        reason: "User kept original filename",
        originalUrl: downloadItem.finalUrl || downloadItem.url,
        originalFilename: basename(downloadItem.filename)
      });
      done();
      return;
    }

    const finalFilename = sanitizeFilename(confirmation.filename, settings.maxFilenameLength);
    if (!finalFilename || !finalFilename.toLowerCase().endsWith(".pdf")) {
      done();
      return;
    }

    await recordHistory({
      status: "renamed",
      titleSource: titleResult.source,
      originalUrl: downloadItem.finalUrl || downloadItem.url,
      originalFilename: basename(downloadItem.filename),
      suggestedFilename: finalFilename
    });

    done({
      filename: finalFilename,
      conflictAction: confirmation.overwrite ? "overwrite" : "uniquify"
    });
  } catch (error) {
    await recordHistory({
      status: "failed",
      reason: error.message,
      originalUrl: downloadItem.finalUrl || downloadItem.url,
      originalFilename: basename(downloadItem.filename)
    });
    done();
  }
}

async function askUserToConfirm(downloadItem, filename, titleResult, settings) {
  const requestId = crypto.randomUUID();
  const details = {
    requestId,
    originalFilename: basename(downloadItem.filename),
    suggestedFilename: filename,
    title: titleResult.title,
    source: titleResult.source,
    url: downloadItem.finalUrl || downloadItem.url,
    overwrite: settings.overwriteDownloads
  };

  const confirmationPromise = new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingConfirmations.delete(requestId);
      resolve(null);
    }, CONFIRMATION_TIMEOUT_MS);

    pendingConfirmations.set(requestId, {
      details,
      resolve: (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      }
    });
  });

  await chrome.windows.create({
    url: chrome.runtime.getURL(`confirm.html?requestId=${encodeURIComponent(requestId)}`),
    type: "popup",
    width: 560,
    height: 430,
    focused: true
  });

  return confirmationPromise;
}

async function resolvePaperTitle(downloadItem, settings) {
  const urls = [downloadItem.finalUrl, downloadItem.url, downloadItem.referrer].filter(Boolean);

  if (settings.enabledSites.arxiv) {
    for (const url of urls) {
      const id = extractArxivId(url);
      if (id) {
        const title = settings.allowNetwork
          ? await fetchArxivTitle(id)
          : await getTitleFromActiveTab(url);
        if (title) {
          return { title, source: "arxiv", paperId: id };
        }
      }
    }
  }

  if (settings.enabledSites.openreview) {
    for (const url of urls) {
      const id = extractOpenReviewId(url);
      if (id) {
        const title = settings.allowNetwork
          ? await fetchOpenReviewTitle(id)
          : await getTitleFromActiveTab(url);
        if (title) {
          return { title, source: "openreview", paperId: id };
        }
      }
    }
  }

  const pageTitle = await getTitleFromActiveTab(downloadItem.referrer || downloadItem.url);
  if (pageTitle) {
    return { title: pageTitle, source: "page" };
  }

  return { title: "", reason: "No supported paper identifier found" };
}

async function resolveTitleFromFilename(filename) {
  const arxivId = extractArxivId(filename);
  if (arxivId) {
    const title = await fetchArxivTitle(arxivId);
    return title ? { title, source: "arxiv", paperId: arxivId } : null;
  }

  const openReviewId = extractOpenReviewId(filename);
  if (openReviewId) {
    const title = await fetchOpenReviewTitle(openReviewId);
    return title ? { title, source: "openreview", paperId: openReviewId } : null;
  }

  return null;
}

async function fetchArxivTitle(id) {
  const cleanId = id.replace(/v\d+$/i, "");
  const response = await fetchWithTimeout(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`);
  if (!response.ok) {
    throw new Error(`arXiv lookup failed: ${response.status}`);
  }

  const xml = await response.text();
  const match = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/i);
  if (!match) {
    return "";
  }

  return decodeXml(match[1]).replace(/\s+/g, " ").trim();
}

async function fetchOpenReviewTitle(id) {
  const endpoints = [
    `https://api2.openreview.net/notes?id=${encodeURIComponent(id)}`,
    `https://api.openreview.net/notes?id=${encodeURIComponent(id)}`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint);
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      const notes = Array.isArray(data.notes) ? data.notes : [];
      const note = notes.find((item) => item.id === id) || notes[0];
      const title = readOpenReviewTitle(note);
      if (title) {
        return title;
      }
    } catch (error) {
      // Try the next OpenReview API host.
    }
  }

  return "";
}

function readOpenReviewTitle(note) {
  const raw = note?.content?.title;
  if (!raw) {
    return "";
  }
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw.value === "string") {
    return raw.value.trim();
  }
  return "";
}

async function getTitleFromActiveTab(expectedUrl) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !tab.url) {
      return "";
    }

    if (expectedUrl && !sameSupportedHost(tab.url, expectedUrl)) {
      return "";
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE_TITLE" });
    return response?.title ? response.title.trim() : "";
  } catch (error) {
    return "";
  }
}

function sameSupportedHost(tabUrl, expectedUrl) {
  try {
    const tabHost = new URL(tabUrl).hostname;
    const expectedHost = new URL(expectedUrl).hostname;
    if (tabHost === expectedHost) {
      return true;
    }
    return supportedHost(tabHost) && supportedHost(expectedHost);
  } catch (error) {
    return false;
  }
}

function supportedHost(hostname) {
  return hostname.endsWith("arxiv.org") || hostname.endsWith("openreview.net");
}

function isPdfDownload(downloadItem) {
  const values = [
    downloadItem.mime,
    downloadItem.filename,
    downloadItem.finalUrl,
    downloadItem.url
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return values.some((value) => value.includes("application/pdf") || value.includes(".pdf"));
}

function extractArxivId(value) {
  if (!value) {
    return "";
  }

  const decoded = safeDecode(String(value));
  const modern = decoded.match(/(?:arxiv\.org\/(?:abs|pdf)\/|^|[^\d])(\d{4}\.\d{4,5})(v\d+)?/i);
  if (modern) {
    return `${modern[1]}${modern[2] || ""}`;
  }

  const legacy = decoded.match(/(?:arxiv\.org\/(?:abs|pdf)\/|^|[^a-z])([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i);
  if (legacy) {
    return `${legacy[1]}${legacy[2] || ""}`;
  }

  return "";
}

function extractOpenReviewId(value) {
  if (!value) {
    return "";
  }

  const decoded = safeDecode(String(value));
  try {
    const url = new URL(decoded);
    const id = url.searchParams.get("id");
    if (id && looksLikeOpenReviewId(id)) {
      return id;
    }
  } catch (error) {
    // Continue with plain filename matching.
  }

  const match = decoded.match(/(?:id=|openreview[-_])([A-Za-z0-9_-]{8,})/);
  return match && looksLikeOpenReviewId(match[1]) ? match[1] : "";
}

function looksLikeOpenReviewId(value) {
  return /^[A-Za-z0-9_-]{8,}$/.test(value);
}

function buildPdfFilename(title, maxLength) {
  return sanitizeFilename(`${title}.pdf`, maxLength);
}

function sanitizeFilename(filename, maxLength = 180) {
  const cleaned = String(filename || "")
    .replace(/[\\/:*?"<>|]/g, " - ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/^\.+/, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  const normalized = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const extension = ".pdf";
  const stemLength = Math.max(20, maxLength - extension.length);
  return `${normalized.slice(0, stemLength).trim()}${extension}`;
}

function basename(filename) {
  return String(filename || "").split(/[\\/]/).pop() || "";
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getSettings() {
  const data = await chrome.storage.sync.get("settings");
  return mergeSettings(data.settings || {});
}

function mergeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    enabledSites: {
      ...DEFAULT_SETTINGS.enabledSites,
      ...(settings.enabledSites || {})
    }
  };
}

async function recordHistory(item) {
  const data = await chrome.storage.local.get("renameHistory");
  const history = Array.isArray(data.renameHistory) ? data.renameHistory : [];
  history.unshift({
    ...item,
    createdAt: Date.now()
  });
  await chrome.storage.local.set({ renameHistory: history.slice(0, 30) });
}

async function getRecentHistory() {
  const data = await chrome.storage.local.get("renameHistory");
  return Array.isArray(data.renameHistory) ? data.renameHistory.slice(0, 10) : [];
}
