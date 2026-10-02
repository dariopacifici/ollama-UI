# Officina · Ollama locale

Interfaccia web in italiano per chattare con Ollama in esecuzione sul computer.

## Requisiti

- Node.js 18 o superiore
- Ollama installato e in esecuzione
- Un modello scaricato, per esempio `qwen2.5:1.5b`

Su Debian 13, se Node.js non è già presente:

```bash
sudo apt update
sudo apt install nodejs npm
```

## Avvio

```bash
npm install
npm start
```

Apri [http://localhost:3000](http://localhost:3000). Il modello `qwen2.5:1.5b` viene selezionato automaticamente se disponibile; puoi cambiarlo dal menu in alto. Le conversazioni sono salvate nel browser e le richieste passano dal server locale a Ollama.

Le risposte Markdown mostrano pulsanti per copiare i blocchi di codice o scaricarli come file; per le immagini disponibili puoi copiarle o scaricarle. `qwen2.5:1.5b` è un modello testuale e non genera immagini da solo.

Per configurare un altro indirizzo Ollama o una porta diversa:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 PORT=3000 npm start
```