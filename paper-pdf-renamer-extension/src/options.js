const ids = [
  "enabled",
  "confirmBeforeRename",
  "allowNetwork",
  "overwriteDownloads",
  "arxiv",
  "openreview",
  "maxFilenameLength"
];

const elements = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
const save = document.querySelector("#save");
const saveStatus = document.querySelector("#saveStatus");

init();

async function init() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (!response.ok) {
    saveStatus.textContent = "读取设置失败。";
    return;
  }

  const settings = response.settings;
  elements.enabled.checked = settings.enabled;
  elements.confirmBeforeRename.checked = settings.confirmBeforeRename;
  elements.allowNetwork.checked = settings.allowNetwork;
  elements.overwriteDownloads.checked = settings.overwriteDownloads;
  elements.arxiv.checked = settings.enabledSites.arxiv;
  elements.openreview.checked = settings.enabledSites.openreview;
  elements.maxFilenameLength.value = settings.maxFilenameLength;
}

save.addEventListener("click", async () => {
  const settings = {
    enabled: elements.enabled.checked,
    confirmBeforeRename: elements.confirmBeforeRename.checked,
    allowNetwork: elements.allowNetwork.checked,
    overwriteDownloads: elements.overwriteDownloads.checked,
    enabledSites: {
      arxiv: elements.arxiv.checked,
      openreview: elements.openreview.checked
    },
    maxFilenameLength: Number(elements.maxFilenameLength.value) || 180
  };

  const response = await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings
  });

  saveStatus.textContent = response.ok ? "已保存。" : "保存失败。";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
});
