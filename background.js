const DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

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
