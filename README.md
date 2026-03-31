# WordFizz ✨

A Chrome and Brave extension that helps you improve your writing directly in the browser. Select text in any input field or textarea and instantly get AI-powered suggestions to refine your wording.

## Features

- **Works everywhere** — any `<input>`, `<textarea>`, or rich-text editor (Slack, Notion, Gmail, etc.) via the native right-click context menu
- **Precise diff preview** — character-level highlights show exactly what changed (e.g. just the `s` in `word → words`)
- **Configurable actions** — add, edit, and delete actions with custom prompts from the settings popup
- **Model selector** — choose between Gemini 2.5 Flash, Flash-Lite, Pro, and preview models
- **Dark theme** — optional dark theme for the result panel
- **Preview before applying** — review the suggestion, then Apply or Dismiss
- Powered by **Gemini**

## Installation

1. Clone or download this repository
2. Open Chrome or Brave and go to `chrome://extensions` (Brave: `brave://extensions`)
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The WordFizz icon will appear in your browser toolbar

## Setup

1. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click the WordFizz extension icon in the toolbar
3. Paste your API key and click **Save**

## Usage

1. Click into any text field on any page
2. Select the text you want to improve
3. Right-click the selection and choose a **WordFizz** action from the context menu
4. Review the suggestion with highlighted changes
5. Click **Apply** to replace your text, or **Dismiss** to discard

**Default actions:**
- **✨ Improve** — rewrites the text with better wording while preserving meaning and structure
- **📝 Fix grammar** — corrects grammar, spelling, and punctuation without changing your style

## Customizing Actions

Open the extension popup and scroll to the **Actions** section. Each action has:

- **Label** — the action name shown in the right-click context menu (e.g. `✨ Improve`)
- **Prompt** — the system instruction sent to Gemini (e.g. `Fix grammar and spelling. Return only the corrected text.`)

Click **+ Add** to create a new action, or **Delete** to remove one. Changes are saved automatically and take effect immediately in the right-click menu.

## Settings

| Setting | Description |
|---|---|
| **Gemini API Key** | Required. Get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Model** | The Gemini model used for rewrites. Defaults to `gemini-2.5-flash` |
| **Dark theme** | Applies a dark theme to the result panel |

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

After making changes to any file, go to `chrome://extensions` (or `brave://extensions` in Brave) and click the refresh icon on the WordFizz card to reload the extension. Changes to `content.js` or `content.css` also require refreshing the tab you're testing on.

> **Note:** If you see "Extension was reloaded — please refresh this page" in the result panel, just refresh the tab. This happens whenever the extension is reloaded while a tab is open.
