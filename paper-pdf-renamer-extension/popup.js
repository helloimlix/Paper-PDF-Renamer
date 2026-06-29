const enabledEl = document.getElementById("enabled");
const historyEl = document.getElementById("history");
const siteHintEl = document.getElementById("siteHint");
const openOptionsButton = document.getElementById("openOptions");
const openBatchButton = document.getElementById("openBatch");

init();

async function init() {
  const settings = await loadSettings();
  enabledEl.checked = settings.enabled;
  await renderCurrentTabHint();
  await renderHistory();
}

enabledEl.addEventListener("change", async () => {
  const settings = await loadSettings();
  settings.enabled = enabledEl.checked;
  await chrome.storage.sync.set({ settings });
});

openOptionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

openBatchButton.addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("batch.html")
  });
});

async function loadSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return PaperRenamerUtils.mergeSettings(stored.settings);
}

async function renderCurrentTabHint() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0] && tabs[0].url;
  if (!url) {
    return;
  }

  if (PaperRenamerUtils.extractArxivId(url)) {
    siteHintEl.textContent = "Current page looks like an arXiv paper.";
  } else if (PaperRenamerUtils.extractOpenReviewId(url)) {
    siteHintEl.textContent = "Current page looks like an OpenReview paper.";
  }
}

async function renderHistory() {
  const stored = await chrome.storage.local.get("renameHistory");
  const history = Array.isArray(stored.renameHistory) ? stored.renameHistory.slice(0, 5) : [];

  if (!history.length) {
    historyEl.innerHTML = "<p class=\"muted\">No PDF rename activity yet.</p>";
    return;
  }

  historyEl.innerHTML = "";
  for (const item of history) {
    const row = document.createElement("article");
    row.className = "history-item";
    const title = document.createElement("strong");
    title.textContent = item.status === "renamed" ? item.suggestedFilename : item.originalFilename;
    const meta = document.createElement("span");
    meta.textContent = `${item.status} via ${item.titleSource || "unknown"}`;
    row.append(title, meta);
    historyEl.append(row);
  }
}
