// CONFIG — troca para /api/youtube depois de fazer deploy na Vercel
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'https://www.googleapis.com/youtube/v3'
  : '/api/youtube';
const LOCAL_KEY = 'AIzaSyAZFpiubQh7i3rvjNcypt04Jp2LIeaRtgU'; // só usado no localhost

async function ytFetch(endpoint, params) {
  const p = new URLSearchParams(params);
  let url;
  if (API_BASE.startsWith('/api')) {
    url = `${API_BASE}?endpoint=${endpoint}&${p}`;
  } else {
    p.set('key', LOCAL_KEY);
    url = `${API_BASE}/${endpoint}?${p}`;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// STATE
const state = {
  queue: [], queueIdx: -1, playlist: [], recents: [],
  dlHistory: [], shuffleOn: false, repeatMode: 0,
  isPlaying: false, isMuted: false, volume: 80,
  currentTrack: null, searchPage: '', searchNextToken: '',
  activeView: 'home', genreStack: []
};

// LOAD STATE
try {
  const s = JSON.parse(localStorage.getItem('kz_state') || '{}');
  if (s.playlist) state.playlist = s.playlist;
  if (s.recents) state.recents = s.recents;
  if (s.dlHistory) state.dlHistory = s.dlHistory;
  if (s.volume !== undefined) state.volume = s.volume;
  if (s.shuffleOn !== undefined) state.shuffleOn = s.shuffleOn;
  if (s.repeatMode !== undefined) state.repeatMode = s.repeatMode;
} catch(e){}

function saveState() {
  try {
    localStorage.setItem('kz_state', JSON.stringify({
      playlist: state.playlist, recents: state.recents,
      dlHistory: state.dlHistory, volume: state.volume,
      shuffleOn: state.shuffleOn, repeatMode: state.repeatMode
    }));
  } catch(e){}
}

// YOUTUBE PLAYER
let ytPlayer, ytReady = false, ytPendingId = null, ytCurrentId = null;
let progressInterval = null, seekDragging = false;

window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('ytPlayer', {
    height:'1', width:'1',
    playerVars:{autoplay:0,controls:0,rel:0,fs:0,iv_load_policy:3,modestbranding:1},
    events:{
      onReady: () => { ytReady = true; setVolume(state.volume); if(ytPendingId) playVideo(ytPendingId); },
      onStateChange: onYtState,
      onError: (e) => { console.warn('YT error', e.data); setTimeout(nextTrack, 800); }
    }
  });
};

function onYtState(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    state.isPlaying = true; setPlayIcon(true); startProgress();
    document.getElementById('playerEq').classList.add('active');
  } else if (e.data === S.PAUSED) {
    state.isPlaying = false; setPlayIcon(false); stopProgress();
    document.getElementById('playerEq').classList.remove('active');
  } else if (e.data === S.ENDED) {
    stopProgress();
    document.getElementById('playerEq').classList.remove('active');
    if (state.repeatMode === 2) { try{ytPlayer.seekTo(0);ytPlayer.playVideo();}catch(err){} }
    else nextTrack();
  } else if (e.data === S.BUFFERING) {
    showSpinner(true);
  } else {
    showSpinner(false);
  }
  if (e.data === S.PLAYING) showSpinner(false);
}

function playVideo(id) {
  if (!ytReady) { ytPendingId = id; return; }
  try {
    if (ytCurrentId === id) {
      if (state.isPlaying) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
      return;
    }
    ytCurrentId = id;
    showSpinner(true);
    ytPlayer.loadVideoById(id);
  } catch(e) { console.warn(e); setTimeout(nextTrack, 800); }
}

function playTrack(track) {
  if (!track || !track.id) return;
  state.currentTrack = track;
  updatePlayerUI(track);
  playVideo(track.id);
  addToRecents(track);
  highlightPlaying(track.id);
  updateFavBtn();
}

function playQueue(tracks, startIdx = 0) {
  if (!tracks || !tracks.length) return;
  state.queue = [...tracks];
  state.queueIdx = startIdx;
  playTrack(state.queue[startIdx]);
  renderQueueView();
}

function nextTrack() {
  if (!state.queue.length) return;
  let idx;
  if (state.shuffleOn) {
    idx = Math.floor(Math.random() * state.queue.length);
  } else {
    idx = state.queueIdx + 1;
    if (idx >= state.queue.length) {
      if (state.repeatMode === 1) idx = 0;
      else { state.isPlaying = false; setPlayIcon(false); return; }
    }
  }
  state.queueIdx = idx;
  playTrack(state.queue[idx]);
  renderQueueView();
}

function prevTrack() {
  if (!state.queue.length) return;
  try {
    const cur = ytPlayer.getCurrentTime();
    if (cur > 4) { ytPlayer.seekTo(0); return; }
  } catch(e){}
  let idx = Math.max(0, state.queueIdx - 1);
  state.queueIdx = idx;
  playTrack(state.queue[idx]);
}

// PROGRESS
function startProgress() {
  stopProgress();
  progressInterval = setInterval(() => {
    if (seekDragging || !ytReady) return;
    try {
      const cur = ytPlayer.getCurrentTime() || 0;
      const dur = ytPlayer.getDuration() || 0;
      const bar = document.getElementById('progressBar');
      if (dur > 0) bar.value = (cur / dur) * 100;
      document.getElementById('currentTime').textContent = fmtTime(cur);
      document.getElementById('totalTime').textContent = fmtTime(dur);
      updateProgress(bar);
    } catch(e){}
  }, 500);
}

function stopProgress() { clearInterval(progressInterval); }

function updateProgress(bar) {
  const pct = bar.value;
  bar.style.background = `linear-gradient(to right, var(--gold-2) ${pct}%, rgba(255,255,255,.12) ${pct}%)`;
}

// PLAYER UI
function updatePlayerUI(t) {
  document.getElementById('playerTitle').textContent = t.title;
  document.getElementById('playerArtist').textContent = t.artist;
  const covEl = document.getElementById('playerCover');
  if (t.thumb) covEl.innerHTML = `<img src="${t.thumb}" alt="" loading="lazy"/>`;
  const ytLink = document.getElementById('playerYtLink');
  ytLink.href = `https://youtube.com/watch?v=${t.id}`;
}

function setPlayIcon(playing) {
  document.querySelector('.icon-play').style.display = playing ? 'none' : '';
  document.querySelector('.icon-pause').style.display = playing ? '' : 'none';
}

function showSpinner(show) {
  const sp = document.getElementById('playSpinner');
  const ip = document.querySelector('.icon-play');
  const iu = document.querySelector('.icon-pause');
  sp.style.display = show ? 'block' : 'none';
  if (show) { ip.style.display = 'none'; iu.style.display = 'none'; }
}

function setVolume(v) {
  state.volume = v;
  try { ytPlayer.setVolume(v); } catch(e){}
  const volBar = document.getElementById('volumeSlider');
  volBar.value = v;
  volBar.style.background = `linear-gradient(to right, var(--gold-2) ${v}%, rgba(255,255,255,.12) ${v}%)`;
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function fmtDur(iso) {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1]||0), min = parseInt(m[2]||0), sec = parseInt(m[3]||0);
  if (h > 0) return `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${min}:${String(sec).padStart(2,'0')}`;
}

function highlightPlaying(id) {
  document.querySelectorAll('.track-card, .track-row').forEach(el => {
    el.classList.toggle('playing', el.dataset.id === id);
  });
}

function updateFavBtn() {
  const btn = document.getElementById('playerFav');
  const saved = state.currentTrack && state.playlist.some(t => t.id === state.currentTrack.id);
  btn.classList.toggle('saved', !!saved);
}

// RECENTS
function addToRecents(track) {
  state.recents = state.recents.filter(t => t.id !== track.id);
  state.recents.unshift({ ...track, playedAt: Date.now() });
  if (state.recents.length > 50) state.recents.pop();
  saveState();
  if (state.activeView === 'recents') renderRecents();
}

// PLAYLIST
function togglePlaylist(track) {
  const idx = state.playlist.findIndex(t => t.id === track.id);
  if (idx >= 0) {
    state.playlist.splice(idx, 1);
    toast('Removido da playlist');
  } else {
    state.playlist.push(track);
    toast('Salvo na playlist ♡', 'success');
  }
  saveState();
  updateFavBtn();
  if (state.activeView === 'playlist') renderPlaylist();
}

function renderPlaylist() {
  const list = document.getElementById('playlistTracks');
  const empty = document.getElementById('playlistEmpty');
  const count = document.getElementById('playlistCount');
  count.textContent = `${state.playlist.length} música${state.playlist.length !== 1 ? 's' : ''}`;
  if (!state.playlist.length) { empty.classList.add('show'); list.innerHTML = ''; return; }
  empty.classList.remove('show');
  list.innerHTML = state.playlist.map((t, i) => trackRowHTML(t, i)).join('');
  bindRowEvents(list, state.playlist);
  updatePlaylistCover();
}

function updatePlaylistCover() {
  const cover = document.getElementById('playlistCover');
  if (state.playlist[0]?.thumb) cover.innerHTML = `<img src="${state.playlist[0].thumb}" alt=""/>`;
}

// RECENTS RENDER
function renderRecents() {
  const list = document.getElementById('recentsList');
  const empty = document.getElementById('recentsEmpty');
  if (!state.recents.length) { empty.classList.add('show'); list.innerHTML = ''; return; }
  empty.classList.remove('show');
  list.innerHTML = state.recents.map((t, i) => trackRowHTML(t, i)).join('');
  bindRowEvents(list, state.recents);
}

// QUEUE
function addToQueue(track) {
  state.queue.push(track);
  toast('Adicionado à fila', 'success');
  if (state.activeView === 'queue') renderQueueView();
}

function renderQueueView() {
  const list = document.getElementById('queueList');
  const empty = document.getElementById('queueEmpty');
  const sub = document.getElementById('queueSubtitle');
  sub.textContent = `${state.queue.length} música${state.queue.length !== 1 ? 's' : ''} na fila`;
  if (!state.queue.length) { empty.classList.add('show'); list.innerHTML = ''; return; }
  empty.classList.remove('show');
  list.innerHTML = state.queue.map((t, i) => {
    const active = i === state.queueIdx;
    return `<div class="track-row${active?' playing':''}" data-id="${t.id}" data-idx="${i}">
      <div class="track-row-num">${active ? playingBarsHTML() : i+1}</div>
      <div class="track-row-cover"><img src="${t.thumb||''}" alt="" loading="lazy"/></div>
      <div class="track-row-info"><div class="track-row-title">${esc(t.title)}</div><div class="track-row-artist">${esc(t.artist)}</div></div>
      <div class="track-row-duration">${t.duration||''}</div>
      <div class="track-row-actions">
        <button class="track-row-queue" title="Remover da fila" onclick="removeFromQueue(${i})"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.track-row').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const idx = parseInt(el.dataset.idx);
      state.queueIdx = idx;
      playTrack(state.queue[idx]);
      renderQueueView();
    });
  });
}

function removeFromQueue(idx) {
  state.queue.splice(idx, 1);
  if (state.queueIdx >= idx && state.queueIdx > 0) state.queueIdx--;
  renderQueueView();
}

// DOWNLOADS
function downloadTrack(track) {
  const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "%(title)s.%(ext)s" "https://youtube.com/watch?v=${track.id}"`;
  copyToClipboard(cmd);
  const existing = state.dlHistory.find(d => d.id === track.id);
  if (!existing) {
    state.dlHistory.unshift({ ...track, cmd, addedAt: Date.now() });
    if (state.dlHistory.length > 30) state.dlHistory.pop();
    saveState();
  }
  toast('Comando copiado! Cole no terminal para baixar o MP3 🎵', 'success');
  if (state.activeView === 'downloads') renderDownloads();
}

function renderDownloads() {
  const hist = document.getElementById('dlHistoryList');
  const empty = document.getElementById('downloadsEmpty');
  const label = document.getElementById('dlQueueLabel');
  if (label) label.style.display = 'none';
  if (!state.dlHistory.length) { empty.classList.add('show'); hist.innerHTML = ''; return; }
  empty.classList.remove('show');
  hist.innerHTML = state.dlHistory.map(d => `
    <div class="dl-item">
      <div class="dl-item-cover"><img src="${d.thumb||''}" alt="" loading="lazy"/></div>
      <div class="dl-item-info">
        <div class="dl-item-title">${esc(d.title)}</div>
        <div class="dl-item-artist">${esc(d.artist)}</div>
        <div class="dl-item-cmd">
          <code>${esc(d.cmd)}</code>
          <button class="dl-copy-btn" onclick="copyToClipboard('${d.cmd.replace(/'/g,"\\'")}');toast('Copiado!','success')">Copiar</button>
          <a class="dl-open-btn" href="https://youtube.com/watch?v=${d.id}" target="_blank" rel="noopener">YT</a>
        </div>
      </div>
      <button class="dl-item-remove" onclick="removeDlHistory('${d.id}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join('');
}

function removeDlHistory(id) {
  state.dlHistory = state.dlHistory.filter(d => d.id !== id);
  saveState();
  renderDownloads();
}

// LYRICS
async function openLyrics(track) {
  if (!track) return;
  const modal = document.getElementById('lyricsModal');
  const body = document.getElementById('lyricsBody');
  document.getElementById('lyricsSongTitle').textContent = track.title;
  document.getElementById('lyricsSongArtist').textContent = track.artist;
  body.innerHTML = '<div class="lyrics-loading">Buscando letra...</div>';
  modal.classList.add('open');
  try {
    const artist = encodeURIComponent(track.artist.split(' feat')[0].split('|')[0].trim());
    const song = encodeURIComponent(track.title.split('(')[0].split('[')[0].trim());
    const r = await fetch(`https://api.lyrics.ovh/v1/${artist}/${song}`);
    if (!r.ok) throw new Error('not found');
    const data = await r.json();
    if (data.lyrics) {
      body.innerHTML = `<pre class="lyrics-text">${esc(data.lyrics)}</pre>`;
    } else throw new Error('empty');
  } catch(e) {
    body.innerHTML = `<div class="lyrics-not-found">Letra não encontrada para esta música.<br><br><a href="https://www.google.com/search?q=${encodeURIComponent(track.title+' '+track.artist+' letra')}" target="_blank" style="color:var(--gold-2)">Buscar no Google</a></div>`;
  }
}

// SEARCH
let searchDebounce = null;
let searchFilter = '';

async function doSearch(q, append = false) {
  if (!q) return;
  const query = searchFilter ? `${q} ${searchFilter}` : q;
  const status = document.getElementById('searchStatus');
  const grid = document.getElementById('searchResults');
  const lmw = document.getElementById('loadMoreWrap');
  if (!append) { grid.innerHTML = skeletons(8); status.textContent = 'Buscando...'; lmw.style.display = 'none'; }
  try {
    const params = { part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: 16, q: query };
    if (append && state.searchNextToken) params.pageToken = state.searchNextToken;
    const data = await ytFetch('search', params);
    state.searchPage = q;
    state.searchNextToken = data.nextPageToken || '';
    const tracks = (data.items || []).map(itemToTrack).filter(Boolean);
    if (!tracks.length) { status.textContent = 'Nenhum resultado encontrado.'; grid.innerHTML = ''; return; }
    status.textContent = `${append ? parseInt(grid.children.length) + tracks.length : tracks.length} resultado${tracks.length !== 1 ? 's' : ''}`;
    const html = tracks.map(t => trackCardHTML(t)).join('');
    if (append) grid.insertAdjacentHTML('beforeend', html);
    else grid.innerHTML = html;
    bindCardEvents(grid, tracks);
    if (state.searchNextToken) lmw.style.display = 'block';
    else lmw.style.display = 'none';
    if (state.currentTrack) highlightPlaying(state.currentTrack.id);
  } catch(e) {
    status.textContent = 'Erro ao buscar. Verifique a API key.';
    grid.innerHTML = `<div class="error-msg">Erro: ${e.message}</div>`;
  }
}

// HOME SECTIONS
const BR_QUERIES = [
  'pagode 2025 brasil mais tocado',
  'funk carioca 2025 lançamento',
  'sertanejo universitario 2025 mais tocado',
  'rap nacional brasileiro 2025',
  'MPB músicas brasileiras 2025',
  'forró piseiro 2025'
];
const INTL_QUERIES = [
  'pop hits 2025 billboard top',
  'hip hop rap 2025 top',
  'rnb soul 2025 hits'
];
const ANIME_QUERIES = [
  'anime opening 2024 2025',
  'anime soundtrack music 2025 best'
];

async function loadSection(query, gridId) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = skeletons(6);
  try {
    const data = await ytFetch('search', { part:'snippet', type:'video', videoCategoryId:'10', maxResults:12, q:query });
    const tracks = (data.items||[]).map(itemToTrack).filter(Boolean);
    if (!tracks.length) { grid.innerHTML = '<div class="error-msg">Nenhum resultado</div>'; return; }
    grid.innerHTML = tracks.map(t => trackCardHTML(t)).join('');
    bindCardEvents(grid, tracks);
    if (state.currentTrack) highlightPlaying(state.currentTrack.id);
  } catch(e) {
    grid.innerHTML = `<div class="error-msg">Erro ao carregar. Verifique a API key nas configurações.</div>`;
  }
}

function loadHomeRandom() {
  loadSection(BR_QUERIES[Math.floor(Math.random()*BR_QUERIES.length)], 'brGrid');
  loadSection(INTL_QUERIES[Math.floor(Math.random()*INTL_QUERIES.length)], 'intlGrid');
  loadSection(ANIME_QUERIES[Math.floor(Math.random()*ANIME_QUERIES.length)], 'animeGrid');
}

// GÊNEROS
const GENRES = [
  { label:'Pagode', icon:'🥁', color:'#c9a84c', q:'pagode brasil 2025', artists:['Grupo Menos É Mais','Sorriso Maroto','Péricles','Thiaguinho'] },
  { label:'Funk', icon:'🎤', color:'#e2463f', q:'funk carioca 2025', artists:['Anitta','MC Cabelinho','Dennis DJ','Mc Ryan SP'] },
  { label:'Sertanejo', icon:'🤠', color:'#a07c20', q:'sertanejo universitario 2025', artists:['Gusttavo Lima','Jorge & Mateus','Marília Mendonça','Luan Santana'] },
  { label:'MPB', icon:'🎸', color:'#4a90d9', q:'MPB música popular brasileira', artists:['Caetano Veloso','Gilberto Gil','Djavan','Milton Nascimento'] },
  { label:'Forró', icon:'🪗', color:'#d97b3a', q:'forró piseiro 2025', artists:['Xand Avião','Barões da Pisadinha','Felipe Amorim'] },
  { label:'Rap BR', icon:'🎙️', color:'#8b5cf6', q:'rap nacional brasileiro 2025', artists:['Emicida','Criolo','Racionais','Projota'] },
  { label:'Rock BR', icon:'🎸', color:'#e25555', q:'rock brasileiro nacional', artists:['Capital Inicial','Legião Urbana','Paralamas','Titãs'] },
  { label:'Samba', icon:'🎺', color:'#f5a623', q:'samba tradicional brasileiro', artists:['Zeca Pagodinho','Beth Carvalho','Cartola','Paulinho da Viola'] },
  { label:'Anime', icon:'🎌', color:'#ff6b9d', q:'anime opening ending 2024', artists:['LiSA','YOASOBI','Aimer','Hiroyuki Sawano'] },
  { label:'J-Rock', icon:'🗾', color:'#00d4aa', q:'japanese rock band 2024', artists:['ONE OK ROCK','RADWIMPS','My First Story','Coldrain'] },
  { label:'Lo-fi', icon:'☕', color:'#9b8ea8', q:'lofi hip hop chill beats study', artists:['Lofi Girl','ChilledCow','Idealism'] },
  { label:'Pop', icon:'⭐', color:'#f72585', q:'pop internacional hits 2025', artists:['Taylor Swift','Dua Lipa','The Weeknd','Billie Eilish'] },
  { label:'K-Pop', icon:'🇰🇷', color:'#7b2ff7', q:'kpop 2025 new songs', artists:['BTS','BLACKPINK','aespa','TWICE'] },
  { label:'Eletrônica', icon:'🎛️', color:'#00b4d8', q:'electronic dance music 2025 EDM', artists:['Martin Garrix','Calvin Harris','Marshmello','Tiësto'] },
  { label:'Hip Hop', icon:'🧢', color:'#ff9f1c', q:'hip hop rap usa 2025', artists:['Drake','Kendrick Lamar','Travis Scott','21 Savage'] },
  { label:'Indie', icon:'🌿', color:'#57cc99', q:'indie alternative music 2025', artists:['Arctic Monkeys','The 1975','Tame Impala','Vampire Weekend'] },
];

function renderGenres() {
  const list = document.getElementById('genresList');
  list.innerHTML = GENRES.map((g, i) => `
    <div class="genre-card" data-idx="${i}" style="--genre-color:${g.color}">
      <div class="genre-icon">${g.icon}</div>
      <div class="genre-label">${g.label}</div>
      <div class="genre-count">${g.artists.length} artistas</div>
    </div>`).join('');
  list.querySelectorAll('.genre-card').forEach(el => {
    el.addEventListener('click', () => openGenre(parseInt(el.dataset.idx)));
  });
}

async function openGenre(idx) {
  const g = GENRES[idx];
  document.getElementById('genreDetailIcon').textContent = g.icon;
  document.getElementById('genreDetailTitle').textContent = g.label;
  const artList = document.getElementById('genreArtists');
  artList.innerHTML = g.artists.map(a => `
    <div class="artist-card" data-artist="${esc(a)}">
      <div class="artist-avatar" style="background:${g.color}22;border:1px solid ${g.color}33">${a.charAt(0)}</div>
      <div class="artist-info"><div class="artist-name">${esc(a)}</div><div class="artist-sub">Artista</div></div>
      <svg class="artist-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('');
  artList.querySelectorAll('.artist-card').forEach(el => {
    el.addEventListener('click', () => openArtist(el.dataset.artist));
  });
  const tracksGrid = document.getElementById('genreTracks');
  tracksGrid.innerHTML = skeletons(6);
  switchView('genre-detail');
  try {
    const data = await ytFetch('search', { part:'snippet', type:'video', videoCategoryId:'10', maxResults:12, q:g.q });
    const tracks = (data.items||[]).map(itemToTrack).filter(Boolean);
    tracksGrid.innerHTML = tracks.map(t => trackCardHTML(t)).join('');
    bindCardEvents(tracksGrid, tracks);
  } catch(e) {
    tracksGrid.innerHTML = `<div class="error-msg">Erro ao carregar</div>`;
  }
}

async function openArtist(name) {
  document.getElementById('artistName').textContent = name;
  const av = document.getElementById('artistAvatar');
  av.textContent = name.charAt(0);
  const grid = document.getElementById('artistTracks');
  grid.innerHTML = skeletons(8);
  switchView('artist');
  try {
    const data = await ytFetch('search', { part:'snippet', type:'video', videoCategoryId:'10', maxResults:16, q:`${name} oficial` });
    const tracks = (data.items||[]).map(itemToTrack).filter(Boolean);
    grid.innerHTML = tracks.map(t => trackCardHTML(t)).join('');
    bindCardEvents(grid, tracks);
    document.getElementById('artistPlayAll').onclick = () => playQueue(tracks, 0);
    document.getElementById('artistShuffle').onclick = () => {
      const shuffled = [...tracks].sort(()=>Math.random()-.5);
      playQueue(shuffled, 0);
    };
  } catch(e) {
    grid.innerHTML = `<div class="error-msg">Erro ao carregar artista</div>`;
  }
}

// TRACK HELPERS
function itemToTrack(item) {
  try {
    const id = item.id?.videoId || item.id;
    if (!id) return null;
    const sn = item.snippet || {};
    return {
      id,
      title: sn.title || 'Sem título',
      artist: sn.channelTitle || 'Desconhecido',
      thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '',
      duration: ''
    };
  } catch(e) { return null; }
}

function trackCardHTML(t) {
  const saved = state.playlist.some(p => p.id === t.id);
  return `<div class="track-card" data-id="${t.id}">
    <div class="card-cover-wrap">
      <img src="${t.thumb||''}" alt="" loading="lazy"/>
      <div class="card-play-overlay"><div class="card-play-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>
      ${t.duration ? `<div class="card-duration">${t.duration}</div>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title" title="${esc(t.title)}">${esc(t.title)}</div>
      <div class="card-artist-row">
        <div class="card-artist">${esc(t.artist)}</div>
        <div class="card-actions">
          <button class="card-queue-btn" title="Adicionar à fila"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
          <button class="card-dl-btn" title="Download MP3"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        </div>
      </div>
    </div>
  </div>`;
}

function trackRowHTML(t, i) {
  const saved = state.playlist.some(p => p.id === t.id);
  const playing = state.currentTrack?.id === t.id;
  return `<div class="track-row${playing?' playing':''}" data-id="${t.id}">
    <div class="track-row-num">${playing ? playingBarsHTML() : i+1}</div>
    <div class="track-row-cover"><img src="${t.thumb||''}" alt="" loading="lazy"/></div>
    <div class="track-row-info"><div class="track-row-title">${esc(t.title)}</div><div class="track-row-artist">${esc(t.artist)}</div></div>
    <div class="track-row-duration">${t.duration||''}</div>
    <div class="track-row-actions">
      <button class="track-row-queue" title="Fila"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="track-row-dl" title="Download"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
      <button class="track-row-fav${saved?' saved':''}" title="${saved?'Remover':'Salvar'}"><svg width="11" height="11" viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
    </div>
  </div>`;
}

function playingBarsHTML() {
  return `<div class="playing-bars"><span></span><span></span><span></span></div>`;
}

function bindCardEvents(container, tracks) {
  container.querySelectorAll('.track-card').forEach(el => {
    const id = el.dataset.id;
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.card-dl-btn')) { downloadTrack(track); return; }
      if (e.target.closest('.card-queue-btn')) { addToQueue(track); return; }
      const sameSection = tracks;
      playQueue(sameSection, sameSection.indexOf(track));
    });
  });
}

function bindRowEvents(container, tracks) {
  container.querySelectorAll('.track-row').forEach(el => {
    const id = el.dataset.id;
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.track-row-dl')) { downloadTrack(track); return; }
      if (e.target.closest('.track-row-fav')) { togglePlaylist(track); return; }
      if (e.target.closest('.track-row-queue')) { addToQueue(track); return; }
      playQueue(tracks, tracks.indexOf(track));
    });
  });
}

// VIEWS
function switchView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'playlist') renderPlaylist();
  if (view === 'recents') renderRecents();
  if (view === 'queue') renderQueueView();
  if (view === 'downloads') renderDownloads();
  const main = document.getElementById('main');
  if (main) main.scrollTop = 0;
}

// TOAST
function toast(msg, type = '') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; el.style.transition = 'all .3s'; setTimeout(() => el.remove(), 300); }, 2800);
}

// HELPERS
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function skeletons(n) {
  return Array.from({length:n}, () => '<div class="skeleton-card"></div>').join('');
}

function copyToClipboard(text) {
  if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(()=>{}); return; }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy');
  ta.remove();
}

window.copyText = function(text) { copyToClipboard(text); toast('Copiado!', 'success'); };
window.removeFromQueue = removeFromQueue;
window.removeDlHistory = removeDlHistory;
window.toast = toast;
window.copyToClipboard = copyToClipboard;

// THEME
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('kz_theme', t); } catch(e){}
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  // load theme
  try { const t = localStorage.getItem('kz_theme'); if (t) applyTheme(t); } catch(e){}

  // splash
  setTimeout(() => document.getElementById('splash').classList.add('hidden'), 1400);

  // sidebar nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { switchView(btn.dataset.view); closeSidebar(); });
  });
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // theme toggles
  document.getElementById('themeToggleSide').addEventListener('click', toggleTheme);
  document.getElementById('themeToggleMobile').addEventListener('click', toggleTheme);

  // mobile sidebar
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  document.getElementById('menuToggle').addEventListener('click', () => {
    sidebar.classList.add('open'); overlay.classList.add('show');
  });
  overlay.addEventListener('click', closeSidebar);
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }

  // player controls
  document.getElementById('btnPlay').addEventListener('click', () => {
    if (!state.currentTrack) return;
    try { state.isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); } catch(e){}
  });
  document.getElementById('btnNext').addEventListener('click', nextTrack);
  document.getElementById('btnPrev').addEventListener('click', prevTrack);

  document.getElementById('btnShuffle').addEventListener('click', () => {
    state.shuffleOn = !state.shuffleOn;
    document.getElementById('btnShuffle').classList.toggle('active', state.shuffleOn);
    toast(state.shuffleOn ? 'Aleatório ativado' : 'Aleatório desativado');
    saveState();
  });

  document.getElementById('btnRepeat').addEventListener('click', () => {
    state.repeatMode = (state.repeatMode + 1) % 3;
    const btn = document.getElementById('btnRepeat');
    btn.classList.toggle('active', state.repeatMode > 0);
    const labels = ['Repetir desativado', 'Repetir tudo', 'Repetir música'];
    toast(labels[state.repeatMode]);
    saveState();
  });

  // progress
  const pb = document.getElementById('progressBar');
  pb.addEventListener('mousedown', () => { seekDragging = true; });
  pb.addEventListener('touchstart', () => { seekDragging = true; });
  pb.addEventListener('input', () => updateProgress(pb));
  pb.addEventListener('change', () => {
    seekDragging = false;
    try {
      const dur = ytPlayer.getDuration() || 0;
      ytPlayer.seekTo((pb.value / 100) * dur);
    } catch(e){}
  });

  // volume
  const vs = document.getElementById('volumeSlider');
  vs.addEventListener('input', () => { setVolume(parseInt(vs.value)); saveState(); });
  document.getElementById('muteBtn').addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    try { state.isMuted ? ytPlayer.mute() : ytPlayer.unMute(); } catch(e){}
    toast(state.isMuted ? 'Mudo' : 'Som ativado');
  });

  // fav button in player
  document.getElementById('playerFav').addEventListener('click', () => {
    if (state.currentTrack) togglePlaylist(state.currentTrack);
  });

  // download in player
  document.getElementById('playerDlBtn').addEventListener('click', () => {
    if (state.currentTrack) downloadTrack(state.currentTrack);
  });

  // lyrics button
  document.getElementById('playerLyricsBtn').addEventListener('click', () => {
    if (state.currentTrack) openLyrics(state.currentTrack);
  });
  document.getElementById('lyricsClose').addEventListener('click', () => {
    document.getElementById('lyricsModal').classList.remove('open');
  });
  document.getElementById('lyricsModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  // hero search
  document.getElementById('heroSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) { switchView('search'); document.getElementById('searchInput').value = q; doSearch(q); }
    }
  });
  document.getElementById('heroSearchBtn').addEventListener('click', () => {
    const q = document.getElementById('heroSearch').value.trim();
    if (q) { switchView('search'); document.getElementById('searchInput').value = q; doSearch(q); }
  });

  // search
  const si = document.getElementById('searchInput');
  si.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(si.value.trim()); });
  si.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = si.value.trim();
    if (q.length > 2) searchDebounce = setTimeout(() => doSearch(q), 600);
  });
  document.getElementById('searchSubmit').addEventListener('click', () => doSearch(si.value.trim()));
  document.getElementById('searchClear').addEventListener('click', () => {
    si.value = ''; document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchStatus').textContent = 'Digite algo para buscar';
    document.getElementById('loadMoreWrap').style.display = 'none';
  });
  document.getElementById('loadMoreBtn').addEventListener('click', () => doSearch(state.searchPage, true));

  // filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      searchFilter = chip.dataset.filter || '';
      const q = si.value.trim();
      if (q) doSearch(q);
    });
  });

  // genre back
  document.getElementById('genreDetailBack').addEventListener('click', () => switchView('genres'));
  document.getElementById('artistBack').addEventListener('click', () => switchView('genre-detail'));

  // playlist actions
  document.getElementById('playPlaylist').addEventListener('click', () => {
    if (state.playlist.length) playQueue(state.playlist, 0);
  });
  document.getElementById('shufflePlaylist').addEventListener('click', () => {
    if (state.playlist.length) playQueue([...state.playlist].sort(()=>Math.random()-.5), 0);
  });
  document.getElementById('clearPlaylist').addEventListener('click', () => {
    state.playlist = []; saveState(); renderPlaylist(); toast('Playlist limpa');
  });

  // refresh buttons
  document.getElementById('refreshBR').addEventListener('click', () => {
    loadSection(BR_QUERIES[Math.floor(Math.random()*BR_QUERIES.length)], 'brGrid');
  });
  document.getElementById('refreshIntl').addEventListener('click', () => {
    loadSection(INTL_QUERIES[Math.floor(Math.random()*INTL_QUERIES.length)], 'intlGrid');
  });

  // initial state toggles
  document.getElementById('btnShuffle').classList.toggle('active', state.shuffleOn);
  document.getElementById('btnRepeat').classList.toggle('active', state.repeatMode > 0);
  setVolume(state.volume);

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === ' ') {
      e.preventDefault();
      if (state.currentTrack) try { state.isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); } catch(err){}
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); nextTrack(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevTrack(); }
    if (e.key.toLowerCase() === 'l') { if (state.currentTrack) openLyrics(state.currentTrack); }
    if (e.key.toLowerCase() === 'q') { switchView('queue'); }
  });

  // render genres
  renderGenres();

  // load home
  loadHomeRandom();
});


function setupMobilePlayerExpand(){
  if (window.innerWidth > 768) return;
  const player = document.querySelector('.player');
  if (!player) return;

  player.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
    const modal = document.getElementById('lyricsModal');
    const body = document.getElementById('lyricsBody');
    if (!state.currentTrack) return;
    document.getElementById('lyricsSongTitle').textContent = state.currentTrack.title;
    document.getElementById('lyricsSongArtist').textContent = state.currentTrack.artist;
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:4px 4px 20px;">
        <img src="${state.currentTrack.thumb || ''}" alt="" style="width:220px;height:220px;object-fit:cover;border-radius:18px;background:#222;">
        <div style="font-size:18px;font-weight:700;color:#fff;">${state.currentTrack.title}</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);">${state.currentTrack.artist}</div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button onclick="document.getElementById('btnPrev').click()" class="btn-ghost">Anterior</button>
          <button onclick="document.getElementById('btnPlay').click()" class="btn-primary">Play / Pause</button>
          <button onclick="document.getElementById('btnNext').click()" class="btn-ghost">Próxima</button>
        </div>
      </div>
    `;
    modal.classList.add('open');
  }, { passive:true });
}


function setupMobileTapPlay() {
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.track-card');
    if (!card || window.innerWidth > 768) return;

    const dl = e.target.closest('.card-dl-btn');
    const q = e.target.closest('.card-queue-btn');
    if (dl || q) return;

    const id = card.dataset.id;
    if (!id) return;
  }, { passive: true });
}



const POPULAR_ARTISTS_2026 = [
  {name:'Taylor Swift', tag:'Pop global'},
  {name:'The Weeknd', tag:'Pop / R&B'},
  {name:'Drake', tag:'Hip Hop'},
  {name:'Bad Bunny', tag:'Latin'},
  {name:'Billie Eilish', tag:'Pop alternativo'},
  {name:'Dua Lipa', tag:'Pop'},
  {name:'Travis Scott', tag:'Rap'},
  {name:'Kendrick Lamar', tag:'Rap'},
  {name:'SZA', tag:'R&B'},
  {name:'Feid', tag:'Latin urbano'},
  {name:'Karol G', tag:'Latin pop'},
  {name:'Peso Pluma', tag:'Regional mexicano'},
  {name:'Anitta', tag:'Brasil / Pop'},
  {name:'Gusttavo Lima', tag:'Sertanejo'},
  {name:'Jorge & Mateus', tag:'Sertanejo'},
  {name:'Thiaguinho', tag:'Pagode'},
  {name:'Grupo Menos É Mais', tag:'Pagode'},
  {name:'Marília Mendonça', tag:'Sertanejo'},
  {name:'MC Ryan SP', tag:'Funk'},
  {name:'Matuê', tag:'Rap BR'},
  {name:'Filipe Ret', tag:'Rap BR'},
  {name:'Racionais MCs', tag:'Rap BR'},
  {name:'LiSA', tag:'Anime / J-pop'},
  {name:'YOASOBI', tag:'J-pop'},
  {name:'Aimer', tag:'Anime'},
  {name:'ONE OK ROCK', tag:'J-Rock'}
];

function renderPopularArtists() {
  const wrap = document.getElementById('artistsPopularList');
  if (!wrap) return;
  wrap.innerHTML = POPULAR_ARTISTS_2026.map(a => `
    <div class="artist-pop-card" data-artist="${a.name}">
      <div class="artist-pop-avatar">${a.name.charAt(0)}</div>
      <div class="artist-pop-name">${a.name}</div>
      <div class="artist-pop-sub">${a.tag}</div>
    </div>
  `).join('');
  wrap.querySelectorAll('.artist-pop-card').forEach(card => {
    card.addEventListener('click', () => openArtist(card.dataset.artist));
  });
}


let deferredInstallPrompt = null;

function setupInstallPrompt() {
  const btn = document.getElementById('installAppBtn');
  if (!btn) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btn.style.display = 'inline-flex';
  });

  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      toast('No celular, use “Adicionar à tela inicial” se o navegador não mostrar a instalação.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.style.display = 'none';
  });
}
