# 🏴‍☠️ Kaizoku Music

App de música via YouTube com player completo.

## Deploy na Vercel

### 1. Configurar a API Key com segurança

No painel da Vercel:
- Settings → Environment Variables
- Adiciona: `YT_API_KEY` = sua chave do YouTube Data API v3

### 2. Colocar sua API key local (para testar antes do deploy)

No `script.js`, linha 3, substitui `AIzaSyC_PLACEHOLDER` pela sua chave real.
Isso só é usado quando rodando em localhost — na Vercel usa o proxy seguro automaticamente.

### 3. Deploy

```bash
npm i -g vercel
cd kaizoku-music
vercel
```

### 4. Estrutura de arquivos

kaizoku/
├── api/
│ └── youtube.js ← Proxy seguro (chave nunca exposta)
├── assets/
│ └── logo.png ← Coloque sua logo aqui
├── index.html
├── style.css
├── script.js
├── vercel.json
└── README.md

## Funcionalidades

- 🎵 Player completo com progresso, volume, shuffle, repeat
- 🇧🇷 Seções de músicas BR em destaque
- 🔍 Busca com filtros por gênero
- 🎌 16 gêneros musicais com artistas
- ♡ Playlist pessoal salva localmente
- 📋 Fila de reprodução editável
- ⬇️ Download via yt-dlp (comando copiado automaticamente)
- 📜 Letras das músicas via API
- ⌨️ Atalhos de teclado: Espaço, ←→, L, Q
- 🌗 Modo claro/escuro
- 📱 100% responsivo
