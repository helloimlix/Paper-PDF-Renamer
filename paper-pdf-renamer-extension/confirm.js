const params = new URLSearchParams(location.search);
const requestId = params.get("id");
const statusEl = document.getElementById("status");
const originalEl = document.getElementById("originalFilename");
const titleEl = document.getElementById("detectedTitle");
const authorsEl = document.getElementById("authors");
const dateEl = document.getElementById("paperDate");
const finalEl = document.getElementById("finalFilename");
const overwriteEl = document.getElementById("overwrite");
const confirmButton = document.getElementById("confirmRename");
const keepButton = document.getElementById("keepOriginal");

let request = null;

init();

async function init() {
  if (!requestId) {
    setStatus("Missing confirmation request.");
    disableButtons();
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "get-confirmation-request",
    id: requestId
  });

  if (!response || !response.ok) {
    setStatus("This confirmation request expired.");
    disableButtons();
    return;
  }

  request = response.request;
  const metadata = request.metadata || {};
  originalEl.value = request.originalFilename || "";
  titleEl.value = request.title || "";
  authorsEl.value = metadata.authors || "";
  dateEl.value = metadata.date || metadata.year || "";
  finalEl.value = request.suggestedFilename || "";
  overwriteEl.checked = Boolean(request.overwriteDefault);
  finalEl.focus();
  finalEl.select();
}

confirmButton.addEventListener("click", async () => {
  const filename = PaperRenamerUtils.ensurePdfExtension(finalEl.value, {
    maxFilenameLength: request && request.maxFilenameLength
  });

  await chrome.runtime.sendMessage({
    type: "resolve-confirmation",
    id: requestId,
    decision: {
      action: "rename",
      filename,
      overwrite: overwriteEl.checked
    }
  });
  window.close();
});

keepButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "resolve-confirmation",
    id: requestId,
    decision: {
      action: "keep"
    }
  });
  window.close();
});

finalEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    confirmButton.click();
  }
});

function setStatus(value) {
  statusEl.textContent = value || "";
}

function disableButtons() {
  confirmButton.disabled = true;
  keepButton.disabled = true;
}
