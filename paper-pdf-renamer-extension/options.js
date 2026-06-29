const fields = {
  enabled: document.getElementById("enabled"),
  confirmBeforeRename: document.getElementById("confirmBeforeRename"),
  allowNetwork: document.getElementById("allowNetwork"),
  overwriteSameName: document.getElementById("overwriteSameName"),
  filenameTemplate: document.getElementById("filenameTemplate"),
  maxFilenameLength: document.getElementById("maxFilenameLength"),
  arxiv: document.getElementById("arxiv"),
  openreview: document.getElementById("openreview")
};

const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");
const resetButton = document.getElementById("reset");

init();

async function init() {
  const stored = await chrome.storage.sync.get("settings");
  render(PaperRenamerUtils.mergeSettings(stored.settings));
}

saveButton.addEventListener("click", async () => {
  const settings = readForm();
  await chrome.storage.sync.set({ settings });
  setStatus("Saved.");
});

resetButton.addEventListener("click", async () => {
  const settings = PaperRenamerUtils.mergeSettings();
  render(settings);
  await chrome.storage.sync.set({ settings });
  setStatus("Reset to defaults.");
});

function render(settings) {
  fields.enabled.checked = settings.enabled;
  fields.confirmBeforeRename.checked = settings.confirmBeforeRename;
  fields.allowNetwork.checked = settings.allowNetwork;
  fields.overwriteSameName.checked = settings.overwriteSameName;
  fields.filenameTemplate.value = settings.filenameTemplate;
  fields.maxFilenameLength.value = settings.maxFilenameLength;
  fields.arxiv.checked = settings.enabledSites.arxiv;
  fields.openreview.checked = settings.enabledSites.openreview;
}

function readForm() {
  return {
    enabled: fields.enabled.checked,
    confirmBeforeRename: fields.confirmBeforeRename.checked,
    allowNetwork: fields.allowNetwork.checked,
    overwriteSameName: fields.overwriteSameName.checked,
    filenameTemplate: fields.filenameTemplate.value.trim() || "{title}",
    maxFilenameLength: Number(fields.maxFilenameLength.value) || 180,
    enabledSites: {
      arxiv: fields.arxiv.checked,
      openreview: fields.openreview.checked
    }
  };
}

function setStatus(value) {
  statusEl.textContent = value;
  setTimeout(() => {
    if (statusEl.textContent === value) {
      statusEl.textContent = "";
    }
  }, 1800);
}
