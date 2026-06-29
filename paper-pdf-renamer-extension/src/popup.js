const enabled = document.querySelector("#enabled");
const statusText = document.querySelector("#statusText");
const openBatch = document.querySelector("#openBatch");
const openOptions = document.querySelector("#openOptions");

init();

async function init() {
  const settingsResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (settingsResponse.ok) {
    enabled.checked = settingsResponse.settings.enabled;
  }

  const historyResponse = await chrome.runtime.sendMessage({ type: "GET_RECENT_HISTORY" });
  const latest = historyResponse.ok ? historyResponse.history[0] : null;
  statusText.textContent = latest ? renderLatest(latest) : "还没有下载记录。";
}

enabled.addEventListener("change", async () => {
  const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  const settings = response.ok ? response.settings : {};
  await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: {
      ...settings,
      enabled: enabled.checked
    }
  });
  statusText.textContent = enabled.checked ? "插件已启用。" : "插件已暂停。";
});

openBatch.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("batch.html") });
});

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function renderLatest(item) {
  if (item.status === "renamed") {
    return `最近重命名：${item.suggestedFilename}`;
  }
  if (item.status === "failed") {
    return `最近失败：${item.reason || "未知错误"}`;
  }
  return `最近跳过：${item.reason || "未识别标题"}`;
}
