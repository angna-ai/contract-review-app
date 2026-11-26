// ---------- Config ----------
const WEBHOOK_URL = 'https://anaga-labs.app.n8n.cloud/webhook-test/cb05d4c4-328f-4f7e-b93c-542b4c44c4ed';
const REQUEST_TIMEOUT_MS = 120000; // give the workflow up to 2 minutes

// ---------- Contract upload & preview ----------
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const viewer = document.getElementById('pdf-viewer');
const filePill = document.getElementById('file-pill');
const fileNameEl = document.getElementById('file-name');
const fileBadge = document.getElementById('file-badge');
const replaceBtn = document.getElementById('replace-btn');
const uploadError = document.getElementById('upload-error');

let currentUrl = null;
let currentFile = null; // the uploaded contract, sent with every question

function showContract(file) {
  uploadError.hidden = true;

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    uploadError.textContent = `“${file.name}” isn’t a PDF. Please choose a .pdf contract.`;
    uploadError.hidden = false;
    return;
  }

  currentFile = file;

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);

  // The browser's built-in PDF viewer renders the contract and scrolls
  // inside the iframe, separately from the chat panel.
  viewer.src = currentUrl;
  viewer.hidden = false;
  dropZone.hidden = true;

  replaceBtn.hidden = false;
  fileBadge.hidden = false;
  filePill.hidden = false;
  fileNameEl.textContent = file.name;
  filePill.title = file.name;
}

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) showContract(fileInput.files[0]);
  fileInput.value = ''; // allow re-selecting the same file
});

replaceBtn.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach(evt =>
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach(evt =>
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  })
);
dropZone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) showContract(file);
});

// Stop the browser from opening a PDF dropped outside the drop zone
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

// ---------- Webhook ----------

// Sends the contract and the question as multipart/form-data:
//   file    – the PDF (binary)
//   message – the user's question (text)
async function askWebhook(file, message) {
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('message', message);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(WEBHOOK_URL, { method: 'POST', body, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw new Error('Couldn’t reach the contract assistant. Check your connection, and that the n8n workflow is active and allows requests from this page.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // n8n usually explains the failure in the body, e.g. {"message":"Error in workflow"}
    let detail = '';
    try {
      const raw = (await res.text()).trim();
      try {
        const parsed = JSON.parse(raw);
        detail = parsed.message || parsed.error || parsed.hint || raw;
      } catch {
        detail = raw;
      }
    } catch { /* no readable body */ }
    if (detail.length > 300) detail = detail.slice(0, 300) + '…';
    throw new Error(`The contract assistant returned an error (HTTP ${res.status})${detail ? `: ${detail}` : '.'}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('The contract assistant sent a reply that isn’t valid JSON.');
  }

  // n8n sometimes wraps a single item in an array
  if (Array.isArray(data) && data.length === 1) data = data[0];

  if (!data || typeof data.response !== 'string') {
    throw new Error('The contract assistant’s reply is missing a "response" field.');
  }

  return {
    response: data.response,
    citation: Array.isArray(data.citation)
      ? data.citation.filter(c => typeof c === 'string' && c.trim() !== '')
      : [],
    reasoning: typeof data.reasoning === 'string' ? data.reasoning : '',
  };
}

// ---------- Chat ----------
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messages = document.getElementById('messages');

let waiting = false;

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent avoids injecting HTML
  return node;
}

// Adds a chat row and returns the bubble so callers can add to it
function addMessage(text, role, extraClass = '') {
  const row = el('div', `message ${role}`);

  if (role === 'assistant') {
    const avatar = el('div', 'avatar', 'AI');
    avatar.setAttribute('aria-hidden', 'true');
    row.appendChild(avatar);
  }

  const bubble = el('div', `bubble ${extraClass}`.trim());
  if (text) bubble.appendChild(el('p', 'bubble-text', text));
  row.appendChild(bubble);

  messages.appendChild(row);
  scrollToBottom();
  return bubble;
}

function addAnswer({ response, citation, reasoning }) {
  const bubble = addMessage(response, 'assistant');

  if (citation.length) {
    const sources = el('div', 'sources');
    sources.appendChild(el('p', 'sources-label', citation.length === 1 ? 'Citation' : 'Citations'));
    const list = el('ol', 'citations');
    citation.forEach(c => list.appendChild(el('li', 'citation', c)));
    sources.appendChild(list);
    bubble.appendChild(sources);
  }

  if (reasoning.trim()) {
    const why = el('div', 'reasoning');
    why.appendChild(el('span', 'reasoning-label', 'Reasoning'));
    why.appendChild(el('p', '', reasoning));
    bubble.appendChild(why);
  }

  scrollToBottom();
}

function showTyping() {
  const bubble = addMessage('', 'assistant');
  bubble.innerHTML = '<span class="typing" aria-label="Assistant is typing"><span></span><span></span><span></span></span>';
  return bubble.parentElement;
}

function updateSendState() {
  sendBtn.disabled = waiting || input.value.trim() === '';
  document.querySelectorAll('.chip').forEach(chip => (chip.disabled = waiting));
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
  // Only show a scrollbar once the text is taller than the box's max height
  input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
}

autoResize();

async function send(text) {
  text = text.trim();
  if (!text || waiting) return;

  if (!currentFile) {
    addMessage('Please upload a PDF contract on the left first, then ask your question.', 'assistant', 'is-error');
    return;
  }

  addMessage(text, 'user');
  input.value = '';
  autoResize();

  waiting = true;
  updateSendState();
  const typing = showTyping();

  try {
    const answer = await askWebhook(currentFile, text);
    typing.remove();
    addAnswer(answer);
  } catch (err) {
    typing.remove();
    addMessage(err.message, 'assistant', 'is-error');
  } finally {
    waiting = false;
    updateSendState();
    input.focus();
  }
}

form.addEventListener('submit', e => {
  e.preventDefault();
  send(input.value);
});

// Enter sends, Shift+Enter adds a new line
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send(input.value);
  }
});
input.addEventListener('input', () => {
  autoResize();
  updateSendState();
});

// Suggested questions send their text straight away
document.querySelectorAll('.chip').forEach(chip =>
  chip.addEventListener('click', () => send(chip.textContent))
);
