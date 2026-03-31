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

let actions = [...DEFAULT_ACTIONS];
let darkTheme = false;
let toolbar = null;
let activeElement = null;
let selectionStart = 0;
let selectionEnd = 0;
let originalText = "";
let savedRange = null; // for contenteditable elements

// ── Diff helpers ────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Split into words, punctuation, and whitespace as separate tokens
// "hello," → ["hello", ","]  so only the comma gets highlighted
function tokenize(text) {
  return text.match(/[A-Za-z0-9'\u00C0-\u024F]+|[^\w\s]|\s+/g) ?? [];
}

// Generic LCS diff over any array of strings — returns {type, value} ops
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

// Fold consecutive ops of the same type into one
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

    // Unchanged text — emit as-is
    if (op.type === "equal") { html.push(escapeHtml(op.value)); i++; continue; }

    // Collect a contiguous change group:
    // keep adding delete/insert ops, and absorb any equal-whitespace token
    // that sits between two changes (so "the big dog"→"a large cat" becomes
    // one <del> block and one <mark> block instead of six separate spans).
    let delStr = "", insStr = "";
    let j = i;
    while (j < ops.length) {
      const cur = ops[j];
      if (cur.type === "delete") { delStr += cur.value; j++; }
      else if (cur.type === "insert") { insStr += cur.value; j++; }
      else if (/^\s+$/.test(cur.value) && j + 1 < ops.length && ops[j + 1].type !== "equal") {
        // Equal whitespace surrounded by changes on both sides — absorb it
        delStr += cur.value; insStr += cur.value; j++;
      }
      else break;
    }

    // For single tokens (no whitespace), try a character-level diff so that
    // only the changed characters are highlighted ("word"→"words" shows just "s").
    if (!/\s/.test(delStr) && !/\s/.test(insStr) && delStr && insStr) {
      const charOps = mergeOps(lcsDiff([...delStr], [...insStr]));
      const lcsLen = charOps.reduce((n, o) => o.type === "equal" ? n + o.value.length : n, 0);
      const sim = (2 * lcsLen) / (delStr.length + insStr.length);
      if (sim >= 0.4) {
        html.push(charOps.map(({ type, value }) => {
          const v = escapeHtml(value);
          if (type === "insert") return `<mark class="wordfizz-added">${v}</mark>`;
          if (type === "delete") return `<del class="wordfizz-removed">${v}</del>`;
          return v;
        }).join(""));
        i = j; continue;
      }
    }

    if (delStr) html.push(`<del class="wordfizz-removed">${escapeHtml(delStr)}</del>`);
    if (insStr) html.push(`<mark class="wordfizz-added">${escapeHtml(insStr)}</mark>`);
    i = j;
  }

  return html.join("");
}

// ── Create toolbar DOM ──────────────────────────────────────────────────────

function createToolbar() {
  const el = document.createElement("div");
  el.id = "wordfizz-toolbar";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "WordFizz writing assistant");

  // Brand header
  const header = document.createElement("div");
  header.className = "wordfizz-header";
  header.innerHTML = `<span class="wordfizz-brand">WordFizz</span>`;
  el.appendChild(header);

  // Loading state — three bouncing dots
  const loadingEl = document.createElement("div");
  loadingEl.className = "wordfizz-loading";
  loadingEl.innerHTML = `
    <span class="wordfizz-loading-dot"></span>
    <span class="wordfizz-loading-dot"></span>
    <span class="wordfizz-loading-dot"></span>
  `;
  el.appendChild(loadingEl);

  // Result text — hidden until a suggestion arrives
  const resultText = document.createElement("div");
  resultText.className = "wordfizz-result-text";
  el.appendChild(resultText);

  // Action buttons row (hidden in right-click flow, kept for direct-click compat)
  const actionsRow = document.createElement("div");
  actionsRow.className = "wordfizz-actions-row";
  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = "wordfizz-action-btn";
    btn.dataset.action = action.id;
    btn.textContent = action.label;
    btn.addEventListener("click", () => onActionClick(action));
    actionsRow.appendChild(btn);
  });
  el.appendChild(actionsRow);

  // Apply / Dismiss row — hidden until a suggestion arrives
  const confirmRow = document.createElement("div");
  confirmRow.className = "wordfizz-confirm-row";
  confirmRow.innerHTML = `
    <button class="wordfizz-apply-btn">Apply</button>
    <button class="wordfizz-dismiss-btn">Dismiss</button>
  `;
  confirmRow.querySelector(".wordfizz-apply-btn").addEventListener("click", applyResult);
  confirmRow.querySelector(".wordfizz-dismiss-btn").addEventListener("click", resetToolbar);
  el.appendChild(confirmRow);

  document.body.appendChild(el);
  return el;
}

// ── Positioning ─────────────────────────────────────────────────────────────

function positionNear(element, panel) {
  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  let top = rect.top + scrollY - panel.offsetHeight - 8;
  let left = rect.left + scrollX;

  // Flip below if not enough space above
  if (top < scrollY + 4) {
    top = rect.bottom + scrollY + 8;
  }

  // Keep within viewport horizontally
  const maxLeft = scrollX + window.innerWidth - panel.offsetWidth - 8;
  left = Math.max(scrollX + 4, Math.min(left, maxLeft));

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

// ── Show / hide ─────────────────────────────────────────────────────────────

function showToolbar(el) {
  if (!toolbar) toolbar = createToolbar();
  toolbar.classList.toggle("wordfizz-dark", darkTheme);
  resetToolbar();
  toolbar.style.display = "flex";
  requestAnimationFrame(() => positionNear(el, toolbar));
}

function hideAll() {
  if (toolbar) toolbar.style.display = "none";
}

// Show the suggestion inside the toolbar, replacing the action buttons
function showResult(text) {
  if (!toolbar) return;
  const resultText = toolbar.querySelector(".wordfizz-result-text");
  resultText.innerHTML = text.startsWith("⚠") ? escapeHtml(text) : renderDiff(originalText, text);
  resultText.style.display = "block";
  // Hide apply button on error messages (text starts with ⚠)
  toolbar.querySelector(".wordfizz-apply-btn").style.display =
    text.startsWith("⚠") ? "none" : "";
  toolbar.querySelector(".wordfizz-actions-row").style.display = "none";
  toolbar.querySelector(".wordfizz-confirm-row").style.display = "flex";
  toolbar.dataset.pendingResult = text;
  requestAnimationFrame(() => positionNear(activeElement, toolbar));
}

// Reset toolbar back to the action buttons view
function resetToolbar() {
  if (!toolbar) return;
  toolbar.querySelector(".wordfizz-loading").style.display = "none";
  toolbar.querySelector(".wordfizz-result-text").style.display = "none";
  toolbar.querySelector(".wordfizz-result-text").innerHTML = "";
  toolbar.querySelector(".wordfizz-actions-row").style.display = "flex";
  toolbar.querySelector(".wordfizz-confirm-row").style.display = "none";
  delete toolbar.dataset.pendingResult;
  if (activeElement) requestAnimationFrame(() => positionNear(activeElement, toolbar));
}

function setLoading(isLoading) {
  if (!toolbar) return;
  toolbar.querySelectorAll(".wordfizz-action-btn").forEach((btn) => {
    btn.disabled = isLoading;
  });
  toolbar.querySelector(".wordfizz-loading").style.display = isLoading ? "flex" : "none";
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function onActionClick(action) {
  if (!activeElement || !originalText) return;

  setLoading(true);

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "IMPROVE_TEXT",
      text: originalText,
      prompt: action.prompt,
    });
  } catch (err) {
    setLoading(false);
    showResult("⚠ Extension was reloaded — please refresh this page.");
    return;
  }

  setLoading(false);

  if (response.error) {
    showResult(`⚠ ${response.error}`);
  } else {
    showResult(response.result);
  }
}

function applyResult() {
  if (!activeElement || !toolbar) return;

  const newText = toolbar.dataset.pendingResult;
  if (!newText) return;

  // Hide before manipulating focus/DOM to avoid a visual jump
  hideAll();

  if ("value" in activeElement) {
    // Standard textarea / input
    const before = activeElement.value.slice(0, selectionStart);
    const after = activeElement.value.slice(selectionEnd);
    activeElement.value = before + newText + after;
    const pos = selectionStart + newText.length;
    activeElement.setSelectionRange(pos, pos);
    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // contenteditable (Quill, Draft.js, ProseMirror, Slack, etc.)
    // Restore the saved selection range, then replace it via execCommand so
    // the editor's own undo stack and change events are preserved.
    activeElement.focus();
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    document.execCommand("insertText", false, newText);
  }
}

// ── Selection detection ──────────────────────────────────────────────────────

function isEditableField(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input") {
    const type = (el.type || "text").toLowerCase();
    return ["text", "search", "url", "email", "password", "number"].includes(type);
  }
  if (el.isContentEditable) return true;
  return false;
}

// Capture selection state when the user right-clicks so it's available when
// the context menu item fires (by then the selection may have changed).
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest("#wordfizz-toolbar")) return;

  const el =
    e.target.closest('textarea, input, [contenteditable]:not([contenteditable="false"])') ??
    (isEditableField(document.activeElement) ? document.activeElement : null);

  if (!el || !isEditableField(el)) {
    activeElement = null;
    return;
  }

  let selected = "";

  if ("selectionStart" in el) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    selected = el.value.slice(start, end).trim();
    if (!selected) { activeElement = null; return; }
    activeElement = el;
    selectionStart = start;
    selectionEnd = end;
    savedRange = null;
  } else {
    const selection = window.getSelection();
    selected = selection?.toString().trim() ?? "";
    if (!selected) { activeElement = null; return; }
    activeElement = el;
    savedRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
  }

  originalText = selected;
});

// Triggered by background when the user clicks a WordFizz context menu item
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRIGGER_ACTION") {
    if (!activeElement || !originalText) return;
    showToolbar(activeElement);
    // Hide action buttons — action was already chosen from the context menu
    if (toolbar) toolbar.querySelector(".wordfizz-actions-row").style.display = "none";
    onActionClick(message.action);
  }
});

// Hide on outside click
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("#wordfizz-toolbar")) return;
  hideAll();
});

// Hide on scroll / resize
window.addEventListener("scroll", hideAll, { passive: true });
window.addEventListener("resize", hideAll, { passive: true });

// ── Storage sync ─────────────────────────────────────────────────────────────

function rebuildToolbar() {
  if (toolbar) { toolbar.remove(); toolbar = null; }
}

// Load settings from storage on init
chrome.storage.sync.get(["actions", "darkTheme"], ({ actions: stored, darkTheme: dark }) => {
  if (stored && stored.length > 0) actions = stored;
  darkTheme = !!dark;
});

// Re-sync when the user changes settings in the popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.actions) {
    actions = changes.actions.newValue ?? DEFAULT_ACTIONS;
    rebuildToolbar();
  }
  if (changes.darkTheme) {
    darkTheme = !!changes.darkTheme.newValue;
    if (toolbar) toolbar.classList.toggle("wordfizz-dark", darkTheme);
  }
});
