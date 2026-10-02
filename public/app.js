const storageKey = 'officina-ollama-chats-v1';
const preferredModel = 'qwen2.5:1.5b';
const elements = {
  chatList: document.querySelector('#chat-list'),
  chatCount: document.querySelector('#chat-count'),
  chatForm: document.querySelector('#chat-form'),
  conversation: document.querySelector('#conversation'),
  messageInput: document.querySelector('#message-input'),
  messageList: document.querySelector('#message-list'),
  modelSelect: document.querySelector('#model-select'),
  connectionStatus: document.querySelector('#connection-status'),
  connectionLabel: document.querySelector('#connection-label'),
  welcomeScreen: document.querySelector('#welcome-screen'),
  welcomeModel: document.querySelector('#welcome-model'),
  currentChatTitle: document.querySelector('#current-chat-title'),
  sendButton: document.querySelector('#send-button'),
  sidebar: document.querySelector('#sidebar'),
  sidebarBackdrop: document.querySelector('#sidebar-backdrop'),
};

let chats = loadChats();
let currentChatId = null;
let activeRequest = null;

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(chats));
  } catch {
    const withoutImages = chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map(({ images, ...message }) => message),
    }));
    try {
      localStorage.setItem(storageKey, JSON.stringify(withoutImages));
    } catch {}
  }
}

function getCurrentChat() {
  return chats.find((chat) => chat.id === currentChatId);
}

function createChat() {
  const chat = { id: crypto.randomUUID(), title: 'Nuova conversazione', messages: [], updatedAt: Date.now() };
  chats.unshift(chat);
  currentChatId = chat.id;
  saveChats();
  render();
  closeSidebar();
  elements.messageInput.focus();
}

function selectChat(id) {
  currentChatId = id;
  render();
  closeSidebar();
}

function deleteChat(id) {
  const chat = chats.find((item) => item.id === id);
  if (!chat || !window.confirm(`Eliminare la conversazione "${chat.title}"?`)) return;

  const deletingCurrentChat = currentChatId === id;
  if (deletingCurrentChat) activeRequest?.abort();
  chats = chats.filter((item) => item.id !== id);
  if (deletingCurrentChat) currentChatId = chats[0]?.id || null;
  saveChats();
  render();
}

function renderChats() {
  elements.chatList.replaceChildren();
  elements.chatCount.textContent = String(chats.length);

  for (const chat of chats) {
    const row = document.createElement('div');
    row.className = 'chat-item-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chat-item${chat.id === currentChatId ? ' is-active' : ''}`;
    button.title = chat.title;

    const icon = document.createElement('i');
    icon.className = 'bi bi-chat-left-text';
    const title = document.createElement('span');
    title.textContent = chat.title;
    button.append(icon, title);
    button.addEventListener('click', () => selectChat(chat.id));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-chat-button';
    deleteButton.title = `Elimina "${chat.title}"`;
    deleteButton.setAttribute('aria-label', `Elimina conversazione: ${chat.title}`);
    deleteButton.innerHTML = '<i class="bi bi-trash3" aria-hidden="true"></i>';
    deleteButton.addEventListener('click', () => deleteChat(chat.id));

    row.append(button, deleteButton);
    elements.chatList.append(row);
  }
}

function renderMessages() {
  const chat = getCurrentChat();
  elements.messageList.replaceChildren();
  elements.welcomeScreen.hidden = Boolean(chat?.messages.length);
  elements.currentChatTitle.textContent = chat?.title || 'Nuova conversazione';

  if (!chat) return;

  for (const message of chat.messages) {
    const row = document.createElement('article');
    row.className = `message-row${message.role === 'user' ? ' from-user' : ' from-assistant'}`;
    const avatar = document.createElement('div');
    avatar.className = `message-avatar${message.role === 'user' ? ' user-avatar' : ''}`;
    avatar.innerHTML = message.role === 'user' ? '<i class="bi bi-person"></i>' : '<i class="bi bi-asterisk"></i>';
    const body = document.createElement('div');
    body.className = 'message-body';
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = message.role === 'user' ? 'TU' : elements.modelSelect.value || 'OLLAMA';
    const content = document.createElement('div');
    content.className = 'message-content';
    if (message.role === 'assistant') {
      renderAssistantContent(content, message);
    } else {
      content.textContent = message.content;
    }
    body.append(label, content);
    row.append(avatar, body);
    elements.messageList.append(row);
  }

  elements.messageList.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'auto' });
}

const codeExtensions = {
  bash: 'sh', c: 'c', cpp: 'cpp', csharp: 'cs', css: 'css', go: 'go', html: 'html', java: 'java',
  javascript: 'js', json: 'json', jsx: 'jsx', markdown: 'md', python: 'py', ruby: 'rb', rust: 'rs',
  shell: 'sh', sql: 'sql', typescript: 'ts', tsx: 'tsx', xml: 'xml', yaml: 'yml',
};

function makeActionButton(action, label, icon, title = label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'content-action';
  button.dataset.action = action;
  button.title = title;
  button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${label}</span>`;
  return button;
}

function safeFilename(filename) {
  const basename = filename.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return basename || '';
}

function renderAssistantContent(element, message) {
  const html = marked.parse(message.content || '');
  element.innerHTML = DOMPurify.sanitize(html);

  const codeFences = [...(message.content || '').matchAll(/(?:^|\n)(?:```|~~~)([^\n]*)/g)];
  element.querySelectorAll('pre').forEach((pre, index) => {
    const code = pre.querySelector('code');
    if (!code) return;

    const info = (codeFences[index]?.[1] || '').trim();
    const language = code.className.match(/language-([^\s]+)/)?.[1] || info.split(/\s+/)[0] || '';
    const namedFile = info.match(/\b(?:filename|file|title)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    const headingFile = pre.previousElementSibling?.textContent.trim().match(/^(?:file:\s*)?`?([\w./-]+\.[a-z0-9]+)`?$/i);
    const hintedName = safeFilename(namedFile?.[1] || namedFile?.[2] || namedFile?.[3] || headingFile?.[1] || '');
    const extension = codeExtensions[language.toLowerCase()] || (language.match(/^[a-z0-9]+$/i) ? language.toLowerCase() : 'txt');
    const filename = hintedName || `codice-${index + 1}.${extension}`;
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const fileLabel = document.createElement('span');
    fileLabel.className = 'code-filename';
    fileLabel.textContent = filename;
    const actions = document.createElement('div');
    actions.className = 'code-actions';
    actions.append(
      makeActionButton('copy-code', 'Copia', 'bi-clipboard', 'Copia il codice'),
      makeActionButton('download-code', 'Scarica file', 'bi-download', 'Scarica questo blocco di codice'),
    );
    toolbar.append(fileLabel, actions);
    pre.dataset.filename = filename;
    pre.classList.add('code-pre');
    const block = document.createElement('div');
    block.className = 'code-block';
    pre.before(block);
    block.append(toolbar, pre);
  });

  element.querySelectorAll('img').forEach((image, index) => {
    image.classList.add('assistant-image');
    image.alt ||= `Immagine ${index + 1}`;
    const actions = document.createElement('div');
    actions.className = 'image-actions';
    actions.append(
      makeActionButton('copy-image', 'Copia immagine', 'bi-copy'),
      makeActionButton('download-image', 'Scarica immagine', 'bi-download'),
    );
    image.after(actions);
  });

  const images = message.images || [];
  if (images.length) {
    const gallery = document.createElement('div');
    gallery.className = 'generated-images';
    for (const [index, imageData] of images.entries()) {
      const source = typeof imageData === 'string' ? imageData : imageData?.data;
      if (!source) continue;
      const figure = document.createElement('figure');
      figure.className = 'generated-image';
      const image = document.createElement('img');
      image.className = 'assistant-image';
      image.alt = `Immagine generata ${index + 1}`;
      image.src = source.startsWith('data:') || source.startsWith('http')
        ? source
        : `data:${source.startsWith('iVBOR') ? 'image/png' : source.startsWith('/9j/') ? 'image/jpeg' : 'image/webp'};base64,${source}`;
      const actions = document.createElement('div');
      actions.className = 'image-actions';
      actions.append(
        makeActionButton('copy-image', 'Copia immagine', 'bi-copy'),
        makeActionButton('download-image', 'Scarica immagine', 'bi-download'),
      );
      figure.append(image, actions);
      gallery.append(figure);
    }
    element.append(gallery);
  }
}

function notifyContentAction(text) {
  const toast = document.querySelector('#copy-feedback');
  toast.textContent = text;
  toast.classList.add('is-visible');
  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Accesso agli appunti non disponibile.');
}

async function copyImage(image) {
  const response = await fetch(image.currentSrc || image.src);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Il contenuto non è un’immagine.');
  let png = blob;
  if (blob.type !== 'image/png') {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    png = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Conversione immagine non riuscita.')), 'image/png'));
    bitmap.close();
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

elements.messageList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const block = button.closest('.code-block');
  const image = button.closest('.image-actions')?.previousElementSibling;

  try {
    if (action === 'copy-code') {
      await copyText(block.querySelector('code').textContent);
      notifyContentAction('Codice copiato');
    } else if (action === 'download-code') {
      const code = block.querySelector('code').textContent;
      downloadBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), block.querySelector('pre').dataset.filename);
      notifyContentAction('File scaricato');
    } else if (action === 'copy-image') {
      try {
        await copyImage(image);
        notifyContentAction('Immagine copiata');
      } catch {
        await copyText(image.currentSrc || image.src);
        notifyContentAction('Link immagine copiato');
      }
    } else if (action === 'download-image') {
      const response = await fetch(image.currentSrc || image.src);
      if (!response.ok) throw new Error('Immagine non raggiungibile.');
      const blob = await response.blob();
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      downloadBlob(blob, `immagine.${extension}`);
      notifyContentAction('Immagine scaricata');
    }
  } catch (error) {
    notifyContentAction(error.message || 'Operazione non riuscita');
  }
});

function render() {
  renderChats();
  renderMessages();
}

function setConnection(connected, label) {
  elements.connectionStatus.classList.toggle('is-connected', connected);
  elements.connectionStatus.classList.toggle('is-disconnected', !connected);
  elements.connectionLabel.textContent = label;
}

async function loadModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ollama non raggiungibile');
    const models = data.models || [];
    elements.modelSelect.replaceChildren();

    if (models.length === 0) {
      const option = new Option('Nessun modello installato', '');
      elements.modelSelect.add(option);
      elements.modelSelect.disabled = true;
      setConnection(true, 'Ollama attivo · 0 modelli');
      elements.welcomeModel.textContent = 'Scarica un modello per iniziare.';
      return;
    }

    for (const model of models) elements.modelSelect.add(new Option(model, model));
    elements.modelSelect.value = models.includes(preferredModel) ? preferredModel : models[0];
    elements.modelSelect.disabled = false;
    setConnection(true, `Ollama attivo · ${models.length} ${models.length === 1 ? 'modello' : 'modelli'}`);
    elements.welcomeModel.textContent = `Connesso a ${elements.modelSelect.value}`;
  } catch (error) {
    elements.modelSelect.replaceChildren(new Option('Ollama non raggiungibile', ''));
    elements.modelSelect.disabled = true;
    setConnection(false, 'Ollama non raggiungibile');
    elements.welcomeModel.textContent = error.message;
  }
}

async function readStream(response, onMessage) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.message) onMessage(chunk.message);
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const finalChunk = JSON.parse(buffer);
    if (finalChunk.error) throw new Error(finalChunk.error);
    if (finalChunk.message) onMessage(finalChunk.message);
  }
}

async function sendMessage(text) {
  if (activeRequest || !elements.modelSelect.value) return;
  if (!getCurrentChat()) createChat();

  const chat = getCurrentChat();
  chat.messages.push({ role: 'user', content: text });
  if (chat.title === 'Nuova conversazione') chat.title = text.trim().replace(/\s+/g, ' ').slice(0, 48) || 'Nuova conversazione';
  chat.updatedAt = Date.now();
  const assistantMessage = { role: 'assistant', content: '', images: [] };
  chat.messages.push(assistantMessage);
  saveChats();
  render();
  const assistantContentElement = elements.messageList.lastElementChild?.querySelector('.message-content');

  activeRequest = new AbortController();
  elements.sendButton.innerHTML = '<i class="bi bi-stop-fill"></i>';
  elements.sendButton.setAttribute('aria-label', 'Interrompi generazione');
  elements.sendButton.title = 'Interrompi generazione';
  elements.sendButton.classList.add('is-stopping');

  try {
    const messages = chat.messages.slice(0, -1).map(({ role, content }) => ({ role, content }));
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: elements.modelSelect.value, messages }),
      signal: activeRequest.signal,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Errore durante la generazione.');
    }

    await readStream(response, (chunk) => {
      assistantMessage.content += chunk.content || '';
      for (const image of chunk.images || []) {
        if (!assistantMessage.images.includes(image)) assistantMessage.images.push(image);
      }
      if (assistantContentElement) {
        assistantContentElement.textContent = assistantMessage.content;
        if (elements.messageList.contains(assistantContentElement)) {
          elements.conversation.scrollTop = elements.conversation.scrollHeight;
        }
      }
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      assistantMessage.content = assistantMessage.content
        ? `${assistantMessage.content}\n\n[Errore: ${error.message}]`
        : `Non sono riuscito a ottenere una risposta. ${error.message}`;
      if (assistantContentElement) assistantContentElement.textContent = assistantMessage.content;
    }
  } finally {
    if (assistantContentElement) renderAssistantContent(assistantContentElement, assistantMessage);
    activeRequest = null;
    saveChats();
    elements.sendButton.innerHTML = '<i class="bi bi-arrow-up"></i>';
    elements.sendButton.setAttribute('aria-label', 'Invia messaggio');
    elements.sendButton.title = 'Invia messaggio';
    elements.sendButton.classList.remove('is-stopping');
  }
}

function closeSidebar() {
  elements.sidebar.classList.remove('is-open');
  elements.sidebarBackdrop.classList.remove('is-visible');
}

elements.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (activeRequest) {
    activeRequest.abort();
    return;
  }
  const text = elements.messageInput.value.trim();
  if (!text) return;
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  sendMessage(text);
});

elements.messageInput.addEventListener('input', () => {
  elements.messageInput.style.height = 'auto';
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 180)}px`;
});

elements.messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});

document.querySelector('#new-chat').addEventListener('click', createChat);
document.querySelector('#open-sidebar').addEventListener('click', () => {
  elements.sidebar.classList.add('is-open');
  elements.sidebarBackdrop.classList.add('is-visible');
});
document.querySelector('#close-sidebar').addEventListener('click', closeSidebar);
elements.sidebarBackdrop.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    createChat();
  }
  if (event.key === 'Escape' && activeRequest) activeRequest.abort();
});

render();
loadModels();