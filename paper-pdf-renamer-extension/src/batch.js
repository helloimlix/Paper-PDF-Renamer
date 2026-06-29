const pickDirectory = document.querySelector("#pickDirectory");
const renameSelected = document.querySelector("#renameSelected");
const overwriteExisting = document.querySelector("#overwriteExisting");
const batchStatus = document.querySelector("#batchStatus");
const rows = document.querySelector("#rows");

let directoryHandle = null;
let items = [];

pickDirectory.addEventListener("click", scanDirectory);
renameSelected.addEventListener("click", renameSelectedItems);

async function scanDirectory() {
  if (!window.showDirectoryPicker) {
    batchStatus.textContent = "当前浏览器不支持目录访问 API。";
    return;
  }

  directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  items = [];
  rows.textContent = "";
  batchStatus.textContent = "正在扫描 PDF...";

  for await (const entry of directoryHandle.values()) {
    if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    const item = {
      handle: entry,
      originalName: entry.name,
      targetName: "",
      status: "识别中",
      selected: false
    };
    items.push(item);
    renderRows();

    const response = await chrome.runtime.sendMessage({
      type: "RESOLVE_TITLE_FROM_FILENAME",
      filename: entry.name
    });

    if (response.ok && response.result?.title) {
      item.targetName = sanitizeFilename(`${response.result.title}.pdf`);
      item.status = response.result.source;
      item.selected = item.targetName !== item.originalName;
    } else {
      item.status = "未识别";
    }
    renderRows();
  }

  batchStatus.textContent = `扫描完成：${items.length} 个 PDF。`;
  renameSelected.disabled = !items.some((item) => item.selected);
}

async function renameSelectedItems() {
  if (!directoryHandle) {
    return;
  }

  const selected = items.filter((item) => item.selected && item.targetName);
  batchStatus.textContent = `正在重命名 ${selected.length} 个文件...`;

  for (const item of selected) {
    try {
      await renameFile(item, overwriteExisting.checked);
      item.status = "已重命名";
      item.selected = false;
    } catch (error) {
      item.status = error.message;
    }
    renderRows();
  }

  batchStatus.textContent = "处理完成。";
  renameSelected.disabled = !items.some((item) => item.selected);
}

async function renameFile(item, overwrite) {
  const targetName = sanitizeFilename(item.targetName);
  if (!targetName) {
    throw new Error("目标文件名为空");
  }
  if (targetName === item.originalName) {
    throw new Error("文件名未变化");
  }

  const exists = await fileExists(targetName);
  if (exists && !overwrite) {
    throw new Error("同名文件已存在");
  }

  const file = await item.handle.getFile();
  const targetHandle = await directoryHandle.getFileHandle(targetName, { create: true });
  const writable = await targetHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  await directoryHandle.removeEntry(item.originalName);
  item.originalName = targetName;
}

async function fileExists(name) {
  try {
    await directoryHandle.getFileHandle(name, { create: false });
    return true;
  } catch (error) {
    return false;
  }
}

function renderRows() {
  rows.textContent = "";
  for (const item of items) {
    const tr = document.createElement("tr");

    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.selected;
    checkbox.disabled = !item.targetName;
    checkbox.addEventListener("change", () => {
      item.selected = checkbox.checked;
      renameSelected.disabled = !items.some((candidate) => candidate.selected);
    });
    selectCell.append(checkbox);

    const originalCell = document.createElement("td");
    originalCell.textContent = item.originalName;

    const targetCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = item.targetName;
    input.placeholder = "未识别，可手动填写";
    input.addEventListener("input", () => {
      item.targetName = input.value;
      item.selected = Boolean(item.targetName);
      renameSelected.disabled = !items.some((candidate) => candidate.selected);
    });
    targetCell.append(input);

    const statusCell = document.createElement("td");
    statusCell.textContent = item.status;

    tr.append(selectCell, originalCell, targetCell, statusCell);
    rows.append(tr);
  }
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

  return `${normalized.slice(0, maxLength - 4).trim()}.pdf`;
}
