const DEFAULT_ACTIONS = [
  {
    id: "1",
    label: "✨ Improve",
    prompt: "Rewrite this text with improved wording and grammar. Keep the same meaning, tone, structure, and line breaks. Do not add, remove, or merge lines. Return only the rewritten text.",
  },
];

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
