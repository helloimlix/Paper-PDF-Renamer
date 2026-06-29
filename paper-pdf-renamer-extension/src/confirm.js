const params = new URLSearchParams(location.search);
const requestId = params.get("requestId");

const originalFilename = document.querySelector("#originalFilename");
const filename = document.querySelector("#filename");
const overwrite = document.querySelector("#overwrite");
const sourceText = document.querySelector("#sourceText");
const keepOriginal = document.querySelector("#keepOriginal");
const confirmRename = document.querySelector("#confirmRename");

init();

async function init() {
  if (!requestId) {
    sourceText.textContent = "缺少确认请求。";
    confirmRename.disabled = true;
    return;
  }

  const details = await chrome.runtime.sendMessage({
    type: "GET_CONFIRMATION_DETAILS",
    requestId
  });

  if (!details) {
    sourceText.textContent = "这个下载请求已经失效。";
    confirmRename.disabled = true;
    return;
  }

  sourceText.textContent = `${details.source} 识别到：${details.title}`;
  originalFilename.value = details.originalFilename || "";
  filename.value = details.suggestedFilename || "";
  overwrite.checked = Boolean(details.overwrite);
  filename.focus();
  filename.select();
}

keepOriginal.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "CONFIRM_RENAME",
    requestId,
    payload: { action: "keep" }
  });
  window.close();
});

confirmRename.addEventListener("click", async () => {
  const value = filename.value.trim();
  if (!value) {
    filename.focus();
    return;
  }

  await chrome.runtime.sendMessage({
    type: "CONFIRM_RENAME",
    requestId,
    payload: {
      action: "rename",
      filename: ensurePdf(value),
      overwrite: overwrite.checked
    }
  });
  window.close();
});

filename.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    confirmRename.click();
  }
});

function ensurePdf(value) {
  return value.toLowerCase().endsWith(".pdf") ? value : `${value}.pdf`;
}
