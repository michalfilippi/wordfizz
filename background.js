const DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

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

// ── Context menu ─────────────────────────────────────────────────────────────

function rebuildContextMenus(actions) {
  chrome.contextMenus.removeAll(() => {
    if (actions.length === 1) {
      chrome.contextMenus.create({
        id: actions[0].id,
        title: `WordFizz: ${actions[0].label}`,
        contexts: ["editable"],
      });
    } else {
      chrome.contextMenus.create({
        id: "wordfizz-parent",
        title: "WordFizz",
        contexts: ["editable"],
      });
      actions.forEach((action) => {
        chrome.contextMenus.create({
          id: action.id,
          parentId: "wordfizz-parent",
          title: action.label,
          contexts: ["editable"],
        });
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { actions } = await chrome.storage.sync.get("actions");
  rebuildContextMenus(actions?.length ? actions : DEFAULT_ACTIONS);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.actions) {
    rebuildContextMenus(changes.actions.newValue?.length ? changes.actions.newValue : DEFAULT_ACTIONS);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const { actions: stored } = await chrome.storage.sync.get("actions");
  const actions = stored?.length ? stored : DEFAULT_ACTIONS;
  const action = actions.find((a) => a.id === info.menuItemId);
  if (!action) return;
  chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ACTION", action }, { frameId: info.frameId });
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "IMPROVE_TEXT") {
    handleImproveText(message.text, message.prompt).then(sendResponse);
    return true; // Keep the message channel open for the async response
  }
});

async function handleImproveText(text, systemPrompt) {
  const { apiKey, model } = await chrome.storage.sync.get(["apiKey", "model"]);

  if (!apiKey) {
    return {
      error:
        "No API key set. Click the WordFizz extension icon to add your Gemini API key.",
    };
  }
  const url = `${GEMINI_API_BASE}/${model ?? DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        generationConfig: {
          // Disable thinking — it's unnecessary for rewrites and its tokens
          // count against the output budget, causing truncation.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg =
        errorData.error?.message ??
        `API error ${response.status}: ${response.statusText}`;
      return { error: msg };
    }

    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { result };
  } catch (err) {
    return { error: err.message };
  }
}
