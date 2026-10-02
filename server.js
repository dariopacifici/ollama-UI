const path = require('node:path');
const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;
const ollamaHost = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/marked', express.static(path.join(__dirname, 'node_modules/marked/lib')));
app.use('/vendor/dompurify', express.static(path.join(__dirname, 'node_modules/dompurify/dist')));

app.get('/api/models', async (_req, res) => {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`);
    if (!response.ok) {
      return res.status(502).json({ error: `Ollama ha risposto con HTTP ${response.status}.` });
    }

    const data = await response.json();
    res.json({ models: (data.models || []).map((model) => model.name) });
  } catch {
    res.status(503).json({ error: `Ollama non raggiungibile su ${ollamaHost}.` });
  }
});

app.post('/api/chat', async (req, res) => {
  const { model, messages } = req.body || {};
  if (typeof model !== 'string' || !model.trim() || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Modello o messaggi mancanti.' });
  }

  const validMessages = messages.every((message) =>
    message && ['user', 'assistant', 'system'].includes(message.role) && typeof message.content === 'string'
  );
  if (!validMessages) {
    return res.status(400).json({ error: 'Formato dei messaggi non valido.' });
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: detail || `Ollama ha risposto con HTTP ${response.status}.` });
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    for await (const chunk of response.body) {
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    if (!res.headersSent) {
      res.status(503).json({ error: `Impossibile comunicare con Ollama: ${error.message}` });
    } else {
      res.end();
    }
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Interfaccia Ollama disponibile su http://localhost:${port}`);
  console.log(`Server Ollama: ${ollamaHost}`);
});