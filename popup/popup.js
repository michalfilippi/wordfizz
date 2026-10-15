// ── Diff helpers (mirrored from content.js) ───────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tokenize(text) {
  return text.match(/[A-Za-z0-9'\u00C0-\u024F]+|[^\w\s]|\s+/g) ?? [];
}

function lcsDiff(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      ops.unshift({ type: "equal",  value: a[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ type: "insert", value: b[j-1] }); j--;
    } else {
      ops.unshift({ type: "delete", value: a[i-1] }); i--;
    }
  }
  return ops;
}

function mergeOps(ops) {
  return ops.reduce((acc, op) => {
    const last = acc[acc.length - 1];
    if (last?.type === op.type) last.value += op.value;
    else acc.push({ ...op });
    return acc;
  }, []);
}

function renderDiff(oldText, newText) {
  if (oldText.length + newText.length > 6000) return escapeHtml(newText);
  const ops = lcsDiff(tokenize(oldText), tokenize(newText));
  const html = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.type === "equal") { html.push(escapeHtml(op.value)); i++; continue; }
    let delStr = "", insStr = "";
    let j = i;
    while (j < ops.length) {
      const cur = ops[j];
      if (cur.type === "delete") { delStr += cur.value; j++; }
      else if (cur.type === "insert") { insStr += cur.value; j++; }
      else if (/^\s+$/.test(cur.value) && j + 1 < ops.length && ops[j + 1].type !== "equal") {
        delStr += cur.value; insStr += cur.value; j++;
      }
      else break;
    }
    if (!/\s/.test(delStr) && !/\s/.test(insStr) && delStr && insStr) {
      const charOps = mergeOps(lcsDiff([...delStr], [...insStr]));
      const lcsLen = charOps.reduce((n, o) => o.type === "equal" ? n + o.value.length : n, 0);
      const sim = (2 * lcsLen) / (delStr.length + insStr.length);
      if (sim >= 0.4) {
        html.push(charOps.map(({ type, value }) => {
          const v = escapeHtml(value);
          if (type === "insert") return `<mark class="diff-added">${v}</mark>`;
          if (type === "delete") return `<del class="diff-removed">${v}</del>`;
          return v;
        }).join(""));
        i = j; continue;
      }
    }
    if (delStr) html.push(`<del class="diff-removed">${escapeHtml(delStr)}</del>`);
    if (insStr) html.push(`<mark class="diff-added">${escapeHtml(insStr)}</mark>`);
    i = j;
  }
  return html.join("");
}

// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ACTIONS = [
  {
    id: "1",
    label: "✨ Improve",
    prompt: "Rewrite this text with improved wording and grammar. Keep the same meaning, tone, structure, and line breaks. Do not add, remove, or merge lines. Return only the rewritten text.",
  },
  {
    id: "2",
    label: "📝 Fix grammar",
    prompt: "Fix any grammar, spelling, and punctuation errors in this text. Do not change the wording, style, or structure beyond what is necessary to correct errors. Return only the corrected text.",
  },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = true;
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
  });
});

// ── API key ───────────────────────────────────────────────────────────────────

const apiKeyInput = document.getElementById("api-key");
const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");
const modelSelect = document.getElementById("model-select");
const darkToggle = document.getElementById("dark-toggle");

chrome.storage.sync.get(["apiKey", "model", "darkTheme"], ({ apiKey, model, darkTheme }) => {
  if (apiKey) apiKeyInput.value = apiKey;
  if (model) modelSelect.value = model;
  darkToggle.checked = !!darkTheme;
  applyPopupTheme(!!darkTheme);
});

modelSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ model: modelSelect.value });
});

darkToggle.addEventListener("change", () => {
  const dark = darkToggle.checked;
  chrome.storage.sync.set({ darkTheme: dark });
  applyPopupTheme(dark);
});

function applyPopupTheme(dark) {
  document.body.classList.toggle("dark", dark);
}

saveBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { showStatus("Please enter an API key.", "error"); return; }
  if (!key.startsWith("AIza")) { showStatus("That doesn't look like a Gemini API key.", "error"); return; }
  await chrome.storage.sync.set({ apiKey: key });
  showStatus("Saved!", "success");
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = type;
  setTimeout(() => { status.textContent = ""; status.className = ""; }, 3000);
}

// ── Actions ───────────────────────────────────────────────────────────────────

let actions = [];
let saveTimer = null;

const actionsList = document.getElementById("actions-list");
const addActionBtn = document.getElementById("add-action-btn");

// Load actions from storage
chrome.storage.sync.get("actions", ({ actions: stored }) => {
  actions = stored && stored.length > 0 ? stored : [...DEFAULT_ACTIONS];
  renderActions();
  renderClipboardActions();
});

addActionBtn.addEventListener("click", () => {
  actions.push({ id: Date.now().toString(), label: "", prompt: "" });
  renderActions();
  // Focus the new label input
  const cards = actionsList.querySelectorAll(".action-card");
  const last = cards[cards.length - 1];
  last?.querySelector(".action-label")?.focus();
  scheduleAutoSave();
});

function renderActions() {
  renderClipboardActions();
  actionsList.innerHTML = "";
  actions.forEach((action, index) => {
    const card = document.createElement("div");
    card.className = "action-card";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "action-label";
    labelInput.placeholder = "Button label";
    labelInput.value = action.label;
    labelInput.addEventListener("input", () => {
      actions[index].label = labelInput.value;
      scheduleAutoSave();
    });

    const promptTextarea = document.createElement("textarea");
    promptTextarea.className = "action-prompt";
    promptTextarea.placeholder = "System prompt sent to the AI…";
    promptTextarea.rows = 3;
    promptTextarea.value = action.prompt;
    promptTextarea.addEventListener("input", () => {
      actions[index].prompt = promptTextarea.value;
      scheduleAutoSave();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "action-delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      actions.splice(index, 1);
      renderActions();
      scheduleAutoSave();
    });

    card.appendChild(labelInput);
    card.appendChild(promptTextarea);
    card.appendChild(deleteBtn);
    actionsList.appendChild(card);
  });
}

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set({ actions });
  }, 400);
}

// ── Clipboard mode ────────────────────────────────────────────────────────────

const clipboardInput = document.getElementById("clipboard-input");
const clipboardActionsRow = document.getElementById("clipboard-actions-row");
const clipboardResultWrap = document.getElementById("clipboard-result-wrap");
const clipboardResult = document.getElementById("clipboard-result");
const clipboardCopyBtn = document.getElementById("clipboard-copy-btn");

let clipboardResultText = "";

function renderClipboardActions() {
  clipboardActionsRow.innerHTML = "";
  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = "clipboard-action-btn";
    btn.textContent = action.label;
    btn.addEventListener("click", () => runClipboardAction(action));
    clipboardActionsRow.appendChild(btn);
  });
}

async function runClipboardAction(action) {
  const text = clipboardInput.value.trim();
  if (!text) {
    clipboardInput.focus();
    return;
  }

  clipboardResultWrap.classList.remove("has-result");
  clipboardResult.innerHTML = '<span class="clipboard-loading">Thinking…</span>';
  clipboardResultWrap.style.display = "block";
  clipboardCopyBtn.style.display = "none";

  const btns = clipboardActionsRow.querySelectorAll(".clipboard-action-btn");
  btns.forEach((b) => (b.disabled = true));

  const response = await chrome.runtime.sendMessage({
    type: "IMPROVE_TEXT",
    text,
    prompt: action.prompt,
  });

  btns.forEach((b) => (b.disabled = false));

  if (response.error) {
    clipboardResult.innerHTML = `<span class="clipboard-error">⚠ ${escapeHtml(response.error)}</span>`;
    clipboardCopyBtn.style.display = "none";
  } else {
    clipboardResultText = response.result;
    clipboardResult.innerHTML = renderDiff(text, response.result);
    clipboardCopyBtn.style.display = "block";
    clipboardResultWrap.classList.add("has-result");
  }
}

clipboardCopyBtn.addEventListener("click", async () => {
  if (!clipboardResultText) return;
  await navigator.clipboard.writeText(clipboardResultText);
  clipboardCopyBtn.textContent = "Copied!";
  setTimeout(() => { clipboardCopyBtn.textContent = "Copy result"; }, 2000);
});
