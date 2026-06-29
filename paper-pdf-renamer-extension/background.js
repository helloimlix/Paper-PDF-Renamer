importScripts("shared-utils.js");

const {
  DEFAULT_SETTINGS,
  mergeSettings,
  ensurePdfExtension,
  getBaseFilename,
  isLikelyPdf,
  extractArxivId,
  extractOpenReviewId,
  fetchArxivTitle,
  fetchOpenReviewTitle
} = PaperRenamerUtils;

const pendingConfirmations = new Map();
const confirmationWindows = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get("settings");
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleDownloadFilename(downloadItem, suggest);
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "get-confirmation-request") {
    const pending = pendingConfirmations.get(message.id);
    sendResponse({
      ok: Boolean(pending),
      request: pending ? pending.request : null
    });
    return false;
  }

  if (message.type === "resolve-confirmation") {
    resolveConfirmation(message.id, message.decision);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.windows.onRemoved.addListener((windowId) => {
  const id = confirmationWindows.get(windowId);
  if (!id) {
    return;
  }
  confirmationWindows.delete(windowId);
  resolveConfirmation(id, { action: "keep" });
});

async function handleDownloadFilename(downloadItem, suggest) {
  try {
    const settings = await getSettings();
    if (!settings.enabled || !isLikelyPdf(downloadItem)) {
      suggest();
      return;
    }

    const resolution = await resolvePaperTitle(downloadItem, settings);
    if (!resolution.title) {
      await recordHistory({
        originalUrl: downloadItem.url,
        originalFilename: getBaseFilename(downloadItem.filename),
        suggestedFilename: "",
        status: "skipped",
        reason: resolution.reason || "No title found",
        titleSource: resolution.source || "none"
      });
      suggest();
      return;
    }

    const suggestedFilename = ensurePdfExtension(resolution.title, settings);
    const originalFilename = getBaseFilename(downloadItem.filename) || getBaseFilename(downloadItem.url);
    let finalDecision = {
      action: "rename",
      filename: suggestedFilename,
      overwrite: settings.overwriteSameName
    };

    if (settings.confirmBeforeRename) {
      finalDecision = await requestConfirmation({
        downloadId: downloadItem.id,
        originalUrl: downloadItem.url,
        originalFilename,
        suggestedFilename,
        title: resolution.title,
        titleSource: resolution.source,
        overwriteDefault: settings.overwriteSameName,
        maxFilenameLength: settings.maxFilenameLength
      });
    }

    if (!finalDecision || finalDecision.action !== "rename") {
      await recordHistory({
        originalUrl: downloadItem.url,
        originalFilename,
        suggestedFilename,
        status: "skipped",
        reason: "User kept original filename",
        titleSource: resolution.source
      });
      suggest();
      return;
    }

    const filename = ensurePdfExtension(finalDecision.filename || suggestedFilename, settings);
    suggest({
      filename,
      conflictAction: finalDecision.overwrite ? "overwrite" : "uniquify"
    });

    await recordHistory({
      originalUrl: downloadItem.url,
      originalFilename,
      suggestedFilename: filename,
      status: "renamed",
      reason: "",
      titleSource: resolution.source
    });
  } catch (error) {
    console.warn("Paper PDF Renamer failed:", error);
    suggest();
  }
}

async function getSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return mergeSettings(stored.settings);
}

async function resolvePaperTitle(downloadItem, settings) {
  if (!settings.allowNetwork) {
    return { title: "", source: "none", reason: "Network lookup disabled" };
  }

  const url = String(downloadItem.finalUrl || downloadItem.url || "");
  const filename = String(downloadItem.filename || "");

  if (settings.enabledSites.arxiv) {
    const arxivId = extractArxivId(url) || extractArxivId(filename);
    if (arxivId) {
      const title = await fetchArxivTitle(arxivId);
      return title
        ? { title, source: "arxiv" }
        : { title: "", source: "arxiv", reason: "arXiv title lookup failed" };
    }
  }

  if (settings.enabledSites.openreview) {
    const openReviewId = extractOpenReviewId(url) || extractOpenReviewId(filename);
    if (openReviewId) {
      const title = await fetchOpenReviewTitle(openReviewId);
      return title
        ? { title, source: "openreview" }
        : { title: "", source: "openreview", reason: "OpenReview title lookup failed" };
    }
  }

  return { title: "", source: "none", reason: "Unsupported PDF source" };
}

async function requestConfirmation(request) {
  const id = crypto.randomUUID();
  const parentWindow = await getLastFocusedNormalWindow();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!pendingConfirmations.has(id)) {
        return;
      }
      pendingConfirmations.delete(id);
      const windowId = takeConfirmationWindow(id);
      if (typeof windowId === "number") {
        try {
          chrome.windows.remove(windowId);
        } catch (error) {
          // The download already falls back to the original filename.
        }
      }
      resolve({ action: "keep" });
    }, 120000);

    pendingConfirmations.set(id, {
      request: {
        ...request,
        id,
        parentWindowId: parentWindow && parentWindow.id,
        parentWindowState: parentWindow && parentWindow.state
      },
      resolve: (decision) => {
        clearTimeout(timeout);
        resolve(decision);
      }
    });

    chrome.windows.create(
      {
        url: chrome.runtime.getURL(`confirm.html?id=${encodeURIComponent(id)}`),
        type: "popup",
        width: 560,
        height: 420,
        focused: true
      },
      (createdWindow) => {
        if (createdWindow && typeof createdWindow.id === "number") {
          confirmationWindows.set(createdWindow.id, id);
        }
      }
    );
  });
}

function resolveConfirmation(id, decision) {
  const pending = pendingConfirmations.get(id);
  if (!pending) {
    return;
  }
  pendingConfirmations.delete(id);
  takeConfirmationWindow(id);
  focusWindow(pending.request && pending.request.parentWindowId, pending.request && pending.request.parentWindowState);
  pending.resolve(decision || { action: "keep" });
}

function takeConfirmationWindow(id) {
  for (const [windowId, confirmationId] of confirmationWindows.entries()) {
    if (confirmationId === id) {
      confirmationWindows.delete(windowId);
      return windowId;
    }
  }
  return null;
}

function getLastFocusedNormalWindow() {
  return new Promise((resolve) => {
    chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (window) => {
      if (chrome.runtime.lastError || !window || typeof window.id !== "number") {
        resolve(null);
        return;
      }
      resolve(window);
    });
  });
}

function focusWindow(windowId, previousState) {
  if (typeof windowId !== "number") {
    return;
  }

  try {
    const updateInfo = { focused: true };
    if (previousState === "minimized") {
      updateInfo.state = "normal";
    }
    chrome.windows.update(windowId, updateInfo);
  } catch (error) {
    // Best effort only. The download has already been resolved.
  }
}

async function recordHistory(entry) {
  const stored = await chrome.storage.local.get("renameHistory");
  const history = Array.isArray(stored.renameHistory) ? stored.renameHistory : [];
  history.unshift({
    ...entry,
    createdAt: Date.now()
  });
  await chrome.storage.local.set({
    renameHistory: history.slice(0, 50)
  });
}
