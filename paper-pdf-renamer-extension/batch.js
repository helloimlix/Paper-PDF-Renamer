const chooseFolderButton = document.getElementById("chooseFolder");
const renameSelectedButton = document.getElementById("renameSelected");
const overwriteExistingEl = document.getElementById("overwriteExisting");
const statusEl = document.getElementById("status");
const rowsEl = document.getElementById("rows");

let directoryHandle = null;
let rows = [];

chooseFolderButton.addEventListener("click", chooseFolder);
renameSelectedButton.addEventListener("click", renameSelected);

async function chooseFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("This Chrome version does not expose folder access here.");
    return;
  }

  directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  setStatus("Scanning PDFs...");
  rows = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind !== "file" || !/\.pdf$/i.test(name)) {
      continue;
    }

    const arxivId = PaperRenamerUtils.extractArxivId(name);
    const openReviewId = PaperRenamerUtils.extractOpenReviewId(name);
    let title = "";
    let status = "Unrecognized";
    if (arxivId) {
      title = await PaperRenamerUtils.fetchArxivTitle(arxivId);
      status = title ? "Ready" : "Lookup failed";
    } else if (openReviewId) {
      title = await PaperRenamerUtils.fetchOpenReviewTitle(openReviewId);
      status = title ? "Ready" : "Lookup failed";
    }

    const newFilename = title ? PaperRenamerUtils.ensurePdfExtension(title) : "";
    rows.push({
      id: crypto.randomUUID(),
      handle,
      currentFilename: name,
      title,
      newFilename,
      selected: Boolean(newFilename),
      status
    });
    renderRows();
  }

  setStatus(rows.length ? `Found ${rows.length} PDF file(s).` : "No PDF files found.");
  renderRows();
}

async function renameSelected() {
  if (!directoryHandle) {
    setStatus("Choose a folder first.");
    return;
  }

  const selected = rows.filter((row) => row.selected && row.newFilename && row.status !== "Renamed");
  if (!selected.length) {
    setStatus("No recognized PDFs selected.");
    return;
  }

  for (const row of selected) {
    try {
      await renameFile(row);
      row.status = "Renamed";
    } catch (error) {
      row.status = error && error.message ? error.message : "Rename failed";
    }
    renderRows();
  }

  setStatus("Finished.");
}

async function renameFile(row) {
  const targetName = PaperRenamerUtils.ensurePdfExtension(row.newFilename);
  if (targetName === row.currentFilename) {
    throw new Error("Already named");
  }

  const exists = await fileExists(targetName);
  if (exists && !overwriteExistingEl.checked) {
    throw new Error("Target exists");
  }

  const sourceFile = await row.handle.getFile();
  const targetHandle = await directoryHandle.getFileHandle(targetName, { create: true });
  const writable = await targetHandle.createWritable();
  await writable.write(sourceFile);
  await writable.close();
  await directoryHandle.removeEntry(row.currentFilename);
  row.currentFilename = targetName;
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
  rowsEl.innerHTML = "";

  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-cell";
    cell.textContent = directoryHandle ? "No PDF files found." : "No folder selected.";
    emptyRow.append(cell);
    rowsEl.append(emptyRow);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");

    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = row.selected;
    checkbox.disabled = !row.newFilename || row.status === "Renamed";
    checkbox.addEventListener("change", () => {
      row.selected = checkbox.checked;
    });
    selectCell.append(checkbox);

    const currentCell = document.createElement("td");
    currentCell.textContent = row.currentFilename;

    const titleCell = document.createElement("td");
    titleCell.textContent = row.title || "-";

    const newCell = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = row.newFilename || "";
    input.placeholder = row.newFilename ? "" : "Type a title or filename";
    input.disabled = row.status === "Renamed";
    input.addEventListener("change", () => {
      row.newFilename = PaperRenamerUtils.ensurePdfExtension(input.value);
      row.selected = Boolean(row.newFilename);
      if (row.status === "Unrecognized") {
        row.status = "Manual";
      }
      renderRows();
    });
    newCell.append(input);

    const statusCell = document.createElement("td");
    statusCell.textContent = row.status;

    tr.append(selectCell, currentCell, titleCell, newCell, statusCell);
    rowsEl.append(tr);
  }
}

function setStatus(value) {
  statusEl.textContent = value || "";
}
