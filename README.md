# Contract Review App

A simple web app for asking questions about a contract. Upload a PDF on the left, ask questions in the chat on the right, and get answers that cite the exact clauses they come from.

Built with plain HTML, CSS and JavaScript. No frameworks, no npm, no build step.

## Key features

- **PDF upload and preview**: drag and drop a PDF, or click to browse. The contract opens in the left panel so you can read it while you chat. Files that aren't PDFs are rejected with a clear message.
- **Side-by-side layout**: the contract and the chat each scroll on their own. On narrow screens the panels stack.
- **AI answers with citations**: each question is sent, together with the contract, to an [n8n](https://n8n.io) webhook. The reply shows:
  - the **answer**
  - numbered **citations**: the supporting clauses, with their section or page
  - a short **reasoning** note explaining how the citations support the answer
- **Suggested questions**: one-click prompts such as "Summarize key terms".
- **Helpful errors**: clear messages if no contract is uploaded, the webhook can't be reached, or the workflow returns an error.

## Run it locally

### Option 1: open the file

Download or clone this repository, then double-click `index.html` to open it in Chrome, Edge or Firefox.

### Option 2: use a local web server

If your browser blocks requests when the page is opened straight from a file, serve the folder instead. With [Python](https://www.python.org/downloads/) installed, run this in the project folder:

```bash
python -m http.server 8765
```

Then open <http://localhost:8765> in your browser.

## Connecting the webhook

The webhook address is set at the top of `app.js`:

```js
const WEBHOOK_URL = 'https://…/webhook-test/…';
```

The app sends a `POST` request as `multipart/form-data` with two fields:

| Field     | Contents               |
|-----------|------------------------|
| `file`    | The uploaded PDF       |
| `message` | The user's question    |

The webhook must return a JSON object in this shape:

```json
{
  "response": "The answer, based only on the contract",
  "citation": ["Section 2.1 (Page 3): The exact clause text…"],
  "reasoning": "1–2 sentences on how the citations support the answer"
}
```

If the contract doesn't contain the answer, the reply is `"This information is not mentioned in the contract."` with `"citation": []` and `"reasoning": ""`.

In n8n:

- In the Webhook node, set **Allowed Origins (CORS)** so the browser can read the reply.
- A `webhook-test` URL only responds while the workflow is listening in the editor. For everyday use, switch to the production `/webhook/…` URL and turn the workflow on.

## Project files

| File         | Purpose                                  |
|--------------|------------------------------------------|
| `index.html` | Page structure                           |
| `styles.css` | Layout and styling (navy and orange)     |
| `app.js`     | Upload, preview, chat and webhook calls  |
