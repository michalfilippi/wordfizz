# WordFizz ✨

A Chrome extension that helps you improve your writing directly in the browser. Select text in any input field or textarea and instantly get AI-powered suggestions to refine your wording.

## Features

- **Works everywhere** — any `<input>`, `<textarea>`, or rich-text editor (Slack, Notion, Gmail, etc.)
- **Precise diff preview** — character-level highlights show exactly what changed (e.g. just the `s` in `word → words`)
- **Configurable actions** — add, edit, and delete actions with custom prompts from the settings popup
- **Model selector** — choose between Gemini 2.5 Flash, Flash-Lite, Pro, and preview models
- **Dark toolbar** — optional dark theme for the in-page toolbar
- **Preview before applying** — review the suggestion, then Apply or Dismiss
- Powered by **Gemini**

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The WordFizz icon will appear in your Chrome toolbar

## Setup

1. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click the WordFizz extension icon in the toolbar
3. Paste your API key and click **Save**

## Usage

1. Click into any text field on any page
2. Select the text you want to improve
3. A toolbar appears above the selection — click an action button
4. Review the suggestion with highlighted changes
5. Click **Apply** to replace your text, or **Dismiss** to discard

## Customizing Actions

Open the extension popup and scroll to the **Actions** section. Each action has:

- **Label** — the button text shown in the toolbar (e.g. `✨ Improve`)
- **Prompt** — the system instruction sent to Gemini (e.g. `Fix grammar and spelling. Return only the corrected text.`)

Click **+ Add** to create a new action, or **Delete** to remove one. Changes are saved automatically and take effect on the next text selection.

## Settings

| Setting | Description |
|---|---|
| **Gemini API Key** | Required. Get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Model** | The Gemini model used for rewrites. Defaults to `gemini-2.5-flash` |
| **Dark toolbar** | Applies a dark theme to the in-page toolbar |

## Project Structure

```
wordfizz/
├── manifest.json        # Chrome extension manifest (MV3)
├── background.js        # Service worker — handles Gemini API calls
├── content.js           # Injected into pages — selection detection and toolbar UI
├── content.css          # Styles for the toolbar and result panel
└── popup/
    ├── popup.html       # Settings page
    ├── popup.js         # API key, model, theme, and actions management
    └── popup.css        # Settings page styles
```

## Development

After making changes to any file, go to `chrome://extensions` and click the refresh icon on the WordFizz card to reload the extension. Changes to `content.js` or `content.css` also require refreshing the tab you're testing on.

> **Note:** If you see "Extension was reloaded — please refresh this page" in the toolbar, just refresh the tab. This happens whenever the extension is reloaded while a tab is open.
