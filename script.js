const MAX_RESULTS = 12;
let ytPlayer=null,ytReady=false,queue=[],currentIndex=-1,isPlaying=false,isShuffle=false,isRepeat=false,isMuted=false,currentVolume=80,progressInterval=null,searchPageToken='',lastSearchQuery='',allSearchTracks=[];
let playlist=JSON.parse(localStorage.getItem('kz_playlist')||'[]');
let recents=JSON.parse(localStorage.getItem('kz_recents')||'[]');
const $=id=>document.getElementById(id);
const btnPlay=$('btnPlay'),btnPrev=$('btnPrev'),btnNext=$('btnNext'),btnShuffle=$('btnShuffle'),btnRepeat=$('btnRepeat'),muteBtn=$('muteBtn'),progressBar=$('progressBar'),volumeSlider=$('volumeSlider'),currentTimeEl=$('currentTime'),totalTimeEl=$('totalTime'),playerTitle=$('playerTitle'),playerArtist=$('playerArtist'),playerCover=$('playerCover'),playerFav=$('playerFav'),playerYtLink=$('playerYtLink'),playSpinner=$('playSpinner'),searchInput=$('searchInput'),searchClear=$('searchClear'),searchSubmit=$('searchSubmit'),searchStatus=$('searchStatus'),loadMoreWrap=$('loadMoreWrap'),loadMoreBtn=$('loadMoreBtn'),playlistCount=$('playlistCount'),playlistEmpty=$('playlistEmpty'),recentsEmpty=$('recentsEmpty'),menuToggle=$('menuToggle'),sidebarOverlay=$('sidebarOverlay'),sidebar=$('sidebar'),splash=$('splash');

/* ── utils ───────────────────────────────────────────────── */
function fmtTime(s){if(!s||isNaN(s))return'0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return`${m}:${sec.toString().padStart(2,'0')}`}
function fmtDuration(iso){if(!iso)return'';const m=iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);if(!m)return'';const h=parseInt(m[1]||0),min=parseInt(m[2]||0),s=parseInt(m[3]||0);if(h>0)return`${h}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`;return`${min}:${String(s).padStart(2,'0')}`}
function savePl(){localStorage.setItem('kz_playlist',JSON.stringify(playlist))}
function saveRec(){localStorage.setItem('kz_recents',JSON.stringify(recents))}
function inPl(id){return playlist.some(t=>t.id===id)}
function toast(msg,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;$('toastContainer').appendChild(el);setTimeout(()=>el.remove(),3000)}
function setProgress(pct){progressBar.style.background=`linear-gradient(to right,var(--gold-2) ${pct}%,rgba(255,255,255,.12) ${pct}%)`;progressBar.value=pct}
function setVolBar(v){volumeSlider.style.background=`linear-gradient(to right,var(--gold-2) ${v}%,rgba(255,255,255,.12) ${v}%)`;volumeSlider.value=v}

/* ── YouTube IFrame API ──────────────────────────────────── */
window.onYouTubeIframeAPIReady=function(){
  ytPlayer=new YT.Player('ytPlayer',{height:'1',width:'1',playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,modestbranding:1,rel:0,playsinline:1},events:{
    onReady:()=>{ytReady=true;ytPlayer.setVolume(currentVolume)},
    onStateChange:e=>{
      if(e.data===YT.PlayerState.PLAYING){isPlaying=true;updatePlayBtn();startProgress();updateAllRows();updateMediaSession()}
      else if(e.data===YT.PlayerState.PAUSED){isPlaying=false;updatePlayBtn();stopProgress();updateAllRows()}
      else if(e.data===YT.PlayerState.ENDED){stopProgress();if(isRepeat&&queue.length>0){ytPlayer.seekTo(0);ytPlayer.playVideo()}else{nextTrack()}}
      else if(e.data===YT.PlayerState.BUFFERING){showSpinner(true)}
      if(e.data===YT.PlayerState.PLAYING)showSpinner(false)
    },
    onError:()=>{toast('Erro ao carregar — tentando próxima','error');setTimeout(nextTrack,1500)}
  }})
};

function showSpinner(v){
  playSpinner.style.display=v?'block':'none';
  btnPlay.querySelector('.icon-play').style.display=v?'none':(isPlaying?'none':'');
  btnPlay.querySelector('.icon-pause').style.display=v?'none':(isPlaying?'':'none');
  const ts=$('tsSpinner');if(ts)ts.style.display=v?'block':'none';
  const tp=$('tsPlay');if(tp){tp.querySelector('.ts-icon-play').style.display=v?'none':(isPlaying?'none':'');tp.querySelector('.ts-icon-pause').style.display=v?'none':(isPlaying?'':'none')}
}

function startProgress(){
  stopProgress();
  progressInterval=setInterval(()=>{
    if(!ytPlayer||!ytReady)return;
    const cur=ytPlayer.getCurrentTime()||0,dur=ytPlayer.getDuration()||0;
    if(dur>0){
      const pct=(cur/dur)*100;
      setProgress(pct);currentTimeEl.textContent=fmtTime(cur);totalTimeEl.textContent=fmtTime(dur);
      const tsP=$('tsProgress');if(tsP){tsP.value=pct;tsP.style.background=`linear-gradient(to right,var(--gold-2) ${pct}%,rgba(255,255,255,.12) ${pct}%)`}
      const tsCT=$('tsCurrentTime');const tsTT=$('tsTotalTime');
      if(tsCT)tsCT.textContent=fmtTime(cur);if(tsTT)tsTT.textContent=fmtTime(dur);
      if('mediaSession' in navigator&&navigator.mediaSession.setPositionState)try{navigator.mediaSession.setPositionState({duration:dur,playbackRate:1,position:cur})}catch(_){}
    }
  },500)
}
function stopProgress(){clearInterval(progressInterval)}

function updatePlayBtn(){
  btnPlay.querySelector('.icon-play').style.display=isPlaying?'none':'';
  btnPlay.querySelector('.icon-pause').style.display=isPlaying?'':'none';
  const tp=$('tsPlay');if(tp){tp.querySelector('.ts-icon-play').style.display=isPlaying?'none':'';tp.querySelector('.ts-icon-pause').style.display=isPlaying?'':'none'}
}

/* ── Media Session API ───────────────────────────────────── */
function updateMediaSession(){
  if(!('mediaSession' in navigator))return;
  const track=queue[currentIndex];if(!track)return;
  navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist||'Kaizoku Music',album:'Kaizoku Music',artwork:[{src:track.thumb||'assets/logo.png',sizes:'512x512',type:'image/png'}]});
  navigator.mediaSession.setActionHandler('play',()=>ytPlayer.playVideo());
  navigator.mediaSession.setActionHandler('pause',()=>ytPlayer.pauseVideo());
  navigator.mediaSession.setActionHandler('previoustrack',prevTrack);
  navigator.mediaSession.setActionHandler('nexttrack',nextTrack);
  navigator.mediaSession.setActionHandler('seekto',(d)=>{if(ytPlayer&&ytReady)ytPlayer.seekTo(d.seekTime)});
}

/* ── Playlist helpers ────────────────────────────────────── */
function togglePl(track){
  if(inPl(track.id)){playlist=playlist.filter(t=>t.id!==track.id);toast(`Removido: ${track.title}`,'error')}
  else{playlist.push(track);toast(`Salvo: ${track.title}`,'success')}
  savePl();refreshFavBtns(track.id);
  if($('view-playlist').classList.contains('active'))renderPlaylistView()
}
function addRecent(track){recents=recents.filter(t=>t.id!==track.id);recents.unshift(track);if(recents.length>30)recents=recents.slice(0,30);saveRec()}
function refreshFavBtns(id){
  const saved=inPl(id);
  document.querySelectorAll(`[data-fav-id="${id}"]`).forEach(btn=>{btn.classList.toggle('saved',saved);const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill',saved?'currentColor':'none')});
  if(queue[currentIndex]&&queue[currentIndex].id===id){playerFav.classList.toggle('saved',saved);const svg=playerFav.querySelector('svg');if(svg)svg.setAttribute('fill',saved?'currentColor':'none')}
  const tsFav=$('tsFav');if(tsFav&&queue[currentIndex]&&queue[currentIndex].id===id){tsFav.classList.toggle('saved',saved);const svg=tsFav.querySelector('svg');if(svg)svg.setAttribute('fill',saved?'currentColor':'none')}
}

/* ── Track Screen ────────────────────────────────────────── */
function updateTrackScreenUI(track){
  const scr=$('trackScreen');if(!scr.classList.contains('open'))return;
  $('tsTitle').textContent=track.title;
  $('tsArtist').textContent=track.artist||'YouTube';
  $('tsCover').innerHTML=track.thumb?`<img src="${track.thumb}" alt="${track.title}"/>`:`<div class="ts-cover-placeholder"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  $('tsArtistBtn').onclick=()=>searchArtist(track.artist);
  $('tsYtLink').href=`https://www.youtube.com/watch?v=${track.id}`;
  const favBtn=$('tsFav');
  favBtn.classList.toggle('saved',inPl(track.id));
  favBtn.querySelector('svg').setAttribute('fill',inPl(track.id)?'currentColor':'none');
  favBtn.onclick=()=>{togglePl(track);favBtn.classList.toggle('saved',inPl(track.id));favBtn.querySelector('svg').setAttribute('fill',inPl(track.id)?'currentColor':'none')};
  $('tsProgress').value=0;$('tsCurrentTime').textContent='0:00';$('tsTotalTime').textContent='0:00';
  renderQueuePanel();
}

function openTrackScreen(track,queueRef,idx){
  const scr=$('trackScreen');
  scr.classList.add('open');
  document.body.classList.add('track-screen-open');
  $('tsShuffle').classList.toggle('active',isShuffle);
  $('tsRepeat').classList.toggle('active',isRepeat);
  playTrack(track,queueRef,idx);
}
function closeTrackScreen(){$('trackScreen').classList.remove('open');document.body.classList.remove('track-screen-open')}

/* ── Queue panel ─────────────────────────────────────────── */
function renderQueuePanel(){
  const queueList=$('queueList');if(!queueList)return;
  queueList.innerHTML='';
  if(!queue.length){queueList.innerHTML='<div class="queue-empty">Nada na fila</div>';return}
  queue.forEach((t,i)=>{
    const div=document.createElement('div');
    div.className=`queue-item${i===currentIndex?' queue-active':''}`;
    div.innerHTML=`<img src="${t.thumb||''}" alt="${t.title}" onerror="this.style.visibility='hidden'"/><div class="queue-item-info"><div class="queue-item-title">${t.title}</div><div class="queue-item-artist">${t.artist||''}</div></div>${i===currentIndex?`<div class="queue-playing-dot"></div>`:''}`;
    div.addEventListener('click',()=>playTrack(t,queue,i));
    queueList.appendChild(div);
  });
  const activeEl=queueList.querySelector('.queue-active');
  if(activeEl)setTimeout(()=>activeEl.scrollIntoView({block:'center',behavior:'smooth'}),100);
}

/* ── Playback ────────────────────────────────────────────── */
function playTrack(track,queueRef,idx){
  if(queueRef){queue=queueRef;currentIndex=idx}
  else{const existing=queue.findIndex(t=>t.id===track.id);if(existing>=0){currentIndex=existing}else{queue=[track];currentIndex=0}}
  playerTitle.textContent=track.title;
  playerArtist.textContent=track.artist||'YouTube';
  playerArtist.style.cursor=track.artist?'pointer':'default';
  playerArtist.onclick=track.artist?()=>searchArtist(track.artist):null;
  playerCover.innerHTML=track.thumb?`<img src="${track.thumb}" alt="${track.title}" loading="lazy">`:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  playerFav.classList.toggle('saved',inPl(track.id));
  const favSvg=playerFav.querySelector('svg');if(favSvg)favSvg.setAttribute('fill',inPl(track.id)?'currentColor':'none');
  playerYtLink.href=`https://www.youtube.com/watch?v=${track.id}`;
  setProgress(0);currentTimeEl.textContent='0:00';totalTimeEl.textContent='0:00';
  document.title=`${track.title} — Kaizoku Music`;
  showSpinner(true);
  if(ytReady&&ytPlayer)ytPlayer.loadVideoById(track.id);
  addRecent(track);updateAllRows();updateTrackScreenUI(track);
}

function togglePlay(){if(!ytReady)return;if(queue.length===0){loadTrending();return}if(isPlaying)ytPlayer.pauseVideo();else ytPlayer.playVideo()}
function nextTrack(){if(queue.length===0)return;let next=isShuffle?Math.floor(Math.random()*queue.length):(currentIndex+1)%queue.length;playTrack(queue[next],queue,next)}
function prevTrack(){if(!ytReady||queue.length===0)return;const cur=ytPlayer.getCurrentTime()||0;if(cur>3){ytPlayer.seekTo(0);return}const prev=(currentIndex-1+queue.length)%queue.length;playTrack(queue[prev],queue,prev)}

function updateAllRows(){
  const cur=queue[currentIndex];
  document.querySelectorAll('.track-row').forEach(row=>{
    const id=row.dataset.id;row.classList.toggle('playing',!!(cur&&id===cur.id));
    const num=row.querySelector('.track-row-num');
    if(num&&cur&&id===cur.id){num.innerHTML=isPlaying?`<div class="playing-bars"><span></span><span></span><span></span></div>`:row.dataset.num||'—'}
    else if(num){num.textContent=row.dataset.num||'—'}
  });
  document.querySelectorAll('.track-card').forEach(card=>{card.classList.toggle('playing',!!(cur&&card.dataset.id===cur.id))});
  renderQueuePanel();
}

/* ── YouTube Data API (via proxy) ────────────────────────── */
async function ytSearch(q,pageToken=''){
  const params=new URLSearchParams({q,maxResults:MAX_RESULTS,...(pageToken?{pageToken}:{})});
  const r=await fetch(`/api/search?${params}`);
  if(!r.ok)throw new Error('API error '+r.status);
  return r.json()
}
async function ytVideos(ids){
  const params=new URLSearchParams({ids:ids.join(',')});
  const r=await fetch(`/api/videos?${params}`);
  if(!r.ok)throw new Error('API error '+r.status);
  return r.json()
}
function parseItems(searchData,detailsMap){
  return(searchData.items||[]).map(item=>{
    const id=item.id.videoId,snip=item.snippet,det=detailsMap[id],durIso=det?.contentDetails?.duration||'';
    return{id,title:snip.title.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"),artist:snip.channelTitle,thumb:snip.thumbnails?.high?.url||snip.thumbnails?.medium?.url||snip.thumbnails?.default?.url,duration:fmtDuration(durIso)}
  })
}
async function search(q,pageToken=''){
  const data=await ytSearch(q,pageToken);
  const ids=(data.items||[]).map(i=>i.id.videoId).filter(Boolean);
  let detailsMap={};
  if(ids.length){const det=await ytVideos(ids);(det.items||[]).forEach(v=>{detailsMap[v.id]=v})}
  return{tracks:parseItems(data,detailsMap),nextPageToken:data.nextPageToken||''}
}

/* ── Navigation / Search ─────────────────────────────────── */
function searchArtist(artist){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-view="search"]').classList.add('active');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('view-search').classList.add('active');
  const inp=$('searchInput');inp.value=artist;doSearch(artist);closeSidebar();closeTrackScreen()
}

function makeCard(track,q){
  const saved=inPl(track.id),cur=queue[currentIndex],playing=cur&&cur.id===track.id,div=document.createElement('div');
  div.className=`track-card${playing?' playing':''}`;div.dataset.id=track.id;
  const artistHtml=track.artist?`<span class="card-artist artist-link" data-artist="${track.artist.replace(/"/g,'&quot;')}">${track.artist}</span>`:'';
  div.innerHTML=`<div class="card-cover-wrap"><img src="${track.thumb||''}" alt="${track.title}" loading="lazy" width="320" height="180" onerror="this.style.visibility='hidden'"/><div class="card-play-overlay"><div class="card-play-btn">${playing&&isPlaying?`<div class="playing-bars"><span></span><span></span><span></span></div>`:`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`}</div></div>${track.duration?`<span class="card-duration">${track.duration}</span>`:''}</div><div class="card-body"><div class="card-title">${track.title}</div>${artistHtml}</div>`;
  div.querySelector('.card-artist')?.addEventListener('click',e=>{e.stopPropagation();searchArtist(track.artist)});
  div.addEventListener('click',()=>openTrackScreen(track,q,q.indexOf(track)));
  return div
}

function makeRow(track,idx,q){
  const saved=inPl(track.id),cur=queue[currentIndex],active=cur&&cur.id===track.id,div=document.createElement('div');
  div.className=`track-row${active?' playing':''}`;div.dataset.id=track.id;div.dataset.num=idx+1;
  const artistAttr=(track.artist||'').replace(/"/g,'&quot;');
  div.innerHTML=`<div class="track-row-num">${active&&isPlaying?`<div class="playing-bars"><span></span><span></span><span></span></div>`:idx+1}</div><div class="track-row-cover"><img src="${track.thumb||''}" alt="${track.title}" loading="lazy" width="80" height="60" onerror="this.style.visibility='hidden'"/></div><div class="track-row-info"><div class="track-row-title">${track.title}</div><div class="track-row-artist artist-link" data-artist="${artistAttr}">${track.artist||''}</div></div><div class="track-row-duration">${track.duration||''}</div><button class="track-row-fav${saved?' saved':''}" data-fav-id="${track.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>`;
  div.querySelector('.track-row-artist')?.addEventListener('click',e=>{e.stopPropagation();if(track.artist)searchArtist(track.artist)});
  div.addEventListener('click',e=>{if(e.target.closest('.track-row-fav'))togglePl(track);else if(!e.target.closest('.track-row-artist'))openTrackScreen(track,q,q.indexOf(track))});
  return div
}

function fillGrid(el,tracks){el.innerHTML='';tracks.forEach(t=>el.appendChild(makeCard(t,tracks)))}
function fillList(el,tracks){el.innerHTML='';tracks.forEach((t,i)=>el.appendChild(makeRow(t,i,tracks)))}

async function loadTrending(){
  const queries=['anime opening 2024','j-rock japan music','japanese music trending'];
  const q=queries[Math.floor(Math.random()*queries.length)];
  try{const{tracks}=await search(q);fillGrid($('trendingGrid'),tracks);if(!queue.length&&tracks.length){queue=tracks;currentIndex=0}}
  catch(e){$('trendingGrid').innerHTML=`<div class="api-error"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Erro ao carregar</span><button onclick="loadTrending()">Tentar novamente</button></div>`}
}
async function loadAnime(){
  try{const{tracks}=await search('anime opening song');fillGrid($('animeGrid'),tracks)}
  catch(e){$('animeGrid').innerHTML=''}
}

let activeFilter='all';
const filterMap={all:'',anime:'anime opening',jrock:'j-rock',lofi:'lofi japan chill',pop:'j-pop'};

async function doSearch(q,append=false){
  if(!q.trim())return;
  const prefix=filterMap[activeFilter]||'',fullQ=prefix?`${prefix} ${q}`:q;
  lastSearchQuery=fullQ;
  if(!append){$('searchResults').innerHTML='';searchPageToken='';allSearchTracks=[];searchStatus.textContent='Buscando no YouTube...';loadMoreWrap.style.display='none'}
  try{
    const{tracks,nextPageToken}=await search(fullQ,append?searchPageToken:'');
    searchPageToken=nextPageToken;
    allSearchTracks=[...allSearchTracks,...tracks];
    if(!append)fillGrid($('searchResults'),allSearchTracks);
    else tracks.forEach(t=>$('searchResults').appendChild(makeCard(t,allSearchTracks)));
    searchStatus.textContent=allSearchTracks.length?`${append?'Mais resultados':allSearchTracks.length+' resultados'} para "${q}"`:'Nenhum resultado encontrado';
    loadMoreWrap.style.display=nextPageToken?'block':'none'
  }catch(e){searchStatus.textContent='Erro na busca. Tente novamente.'}
}

function renderPlaylistView(){
  fillList($('playlistTracks'),playlist);
  playlistCount.textContent=`${playlist.length} música${playlist.length!==1?'s':''}`;
  playlistEmpty.classList.toggle('show',playlist.length===0);
  const cover=$('playlistCover');
  if(playlist.length){cover.innerHTML=`<img src="${playlist[0].thumb}" alt="Playlist" style="width:100%;height:100%;object-fit:cover"/>`}
  else{cover.innerHTML=`<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
}
function renderRecentsView(){fillList($('recentsList'),recents);$('recentsEmpty').classList.toggle('show',recents.length===0)}

/* ── Controls ────────────────────────────────────────────── */
btnPlay.addEventListener('click',togglePlay);
btnNext.addEventListener('click',nextTrack);
btnPrev.addEventListener('click',prevTrack);
btnShuffle.addEventListener('click',()=>{isShuffle=!isShuffle;btnShuffle.classList.toggle('active',isShuffle);$('tsShuffle').classList.toggle('active',isShuffle);toast(isShuffle?'Modo aleatório ativado':'Modo aleatório desativado')});
btnRepeat.addEventListener('click',()=>{isRepeat=!isRepeat;btnRepeat.classList.toggle('active',isRepeat);$('tsRepeat').classList.toggle('active',isRepeat);toast(isRepeat?'Repetindo faixa atual':'Repetição desativada')});
muteBtn.addEventListener('click',()=>{if(!ytReady)return;isMuted=!isMuted;isMuted?ytPlayer.mute():ytPlayer.unMute();muteBtn.style.opacity=isMuted?'.4':'1'});
progressBar.addEventListener('input',()=>{if(!ytReady)return;const dur=ytPlayer.getDuration()||0;if(dur>0)ytPlayer.seekTo((progressBar.value/100)*dur)});
volumeSlider.addEventListener('input',()=>{currentVolume=parseInt(volumeSlider.value);if(ytReady)ytPlayer.setVolume(currentVolume);setVolBar(currentVolume)});
playerFav.addEventListener('click',()=>{const cur=queue[currentIndex];if(cur)togglePl(cur)});

/* ── Track screen controls ───────────────────────────────── */
$('tsClose').addEventListener('click',closeTrackScreen);
$('tsBackdrop').addEventListener('click',closeTrackScreen);
$('tsPlay').addEventListener('click',togglePlay);
$('tsNext').addEventListener('click',nextTrack);
$('tsPrev').addEventListener('click',prevTrack);
$('tsShuffle').addEventListener('click',()=>{isShuffle=!isShuffle;btnShuffle.classList.toggle('active',isShuffle);$('tsShuffle').classList.toggle('active',isShuffle);toast(isShuffle?'Aleatório ativado':'Aleatório desativado')});
$('tsRepeat').addEventListener('click',()=>{isRepeat=!isRepeat;btnRepeat.classList.toggle('active',isRepeat);$('tsRepeat').classList.toggle('active',isRepeat);toast(isRepeat?'Repetindo faixa atual':'Repetição desativada')});
$('tsProgress').addEventListener('input',()=>{if(!ytReady)return;const dur=ytPlayer.getDuration()||0;if(dur>0)ytPlayer.seekTo(($('tsProgress').value/100)*dur)});
$('tsVolume').addEventListener('input',()=>{currentVolume=parseInt($('tsVolume').value);if(ytReady)ytPlayer.setVolume(currentVolume);setVolBar(currentVolume);const v=currentVolume;$('tsVolume').style.background=`linear-gradient(to right,var(--gold-2) ${v}%,rgba(255,255,255,.12) ${v}%)`});

/* ── Bottom player → open track screen on mobile ─────────── */
$('player').addEventListener('click',e=>{
  if(window.innerWidth>768)return;
  if(e.target.closest('button')||e.target.closest('input')||e.target.closest('a'))return;
  const cur=queue[currentIndex];if(cur)openTrackScreen(cur,queue,currentIndex)
});

/* ── Swipe down to close track screen ───────────────────── */
(function(){
  let startY=0,startScrollTop=0;
  const panel=$('ts-panel')||document.querySelector('.ts-panel');
  if(!panel)return;
  panel.addEventListener('touchstart',e=>{startY=e.touches[0].clientY;startScrollTop=panel.scrollTop},{passive:true});
  panel.addEventListener('touchmove',e=>{
    if(panel.scrollTop>5)return;
    const dy=e.touches[0].clientY-startY;
    if(dy>60){closeTrackScreen()}
  },{passive:true})
})();

/* ── Search controls ─────────────────────────────────────── */
searchInput.addEventListener('keydown',e=>{if(e.key==='Enter')doSearch(searchInput.value)});
searchSubmit.addEventListener('click',()=>doSearch(searchInput.value));
searchClear.addEventListener('click',()=>{searchInput.value='';$('searchResults').innerHTML='';allSearchTracks=[];searchStatus.textContent='Digite algo para buscar músicas no YouTube';loadMoreWrap.style.display='none';searchInput.focus()});
loadMoreBtn.addEventListener('click',()=>doSearch(searchInput.value,true));
document.querySelectorAll('.filter-chip').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');activeFilter=btn.dataset.filter;if(searchInput.value.trim())doSearch(searchInput.value)})});
$('heroSearchBtn').addEventListener('click',()=>{const q=$('heroSearch').value.trim();if(!q)return;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));document.querySelector('[data-view="search"]').classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$('view-search').classList.add('active');searchInput.value=q;doSearch(q)});
$('heroSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('heroSearchBtn').click()});
$('refreshTrending').addEventListener('click',()=>{$('trendingGrid').innerHTML=Array(6).fill('<div class="skeleton-card"></div>').join('');loadTrending()});
document.querySelectorAll('.chip').forEach(chip=>{chip.addEventListener('click',()=>{document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));document.querySelector('[data-view="search"]').classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$('view-search').classList.add('active');searchInput.value=chip.dataset.q;doSearch(chip.dataset.q);closeSidebar()})});
document.querySelectorAll('.nav-btn').forEach(btn=>{btn.addEventListener('click',()=>{const view=btn.dataset.view;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(`view-${view}`).classList.add('active');if(view==='playlist')renderPlaylistView();if(view==='recents')renderRecentsView();if(window.innerWidth<=768)closeSidebar()})});
$('playPlaylist').addEventListener('click',()=>{if(playlist.length)playTrack(playlist[0],playlist,0)});
$('shufflePlaylist').addEventListener('click',()=>{if(!playlist.length)return;isShuffle=true;btnShuffle.classList.add('active');$('tsShuffle').classList.add('active');const idx=Math.floor(Math.random()*playlist.length);playTrack(playlist[idx],playlist,idx);toast('Playlist aleatória iniciada','success')});
$('clearPlaylist').addEventListener('click',()=>{if(!playlist.length)return;playlist=[];savePl();renderPlaylistView();toast('Playlist limpa','error');playerFav.classList.remove('saved');document.querySelectorAll('.track-row-fav').forEach(btn=>{btn.classList.remove('saved');const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill','none')})});

/* ── Sidebar ─────────────────────────────────────────────── */
function closeSidebar(){sidebar.classList.remove('open');sidebarOverlay.classList.remove('show')}
menuToggle.addEventListener('click',()=>{sidebar.classList.toggle('open');sidebarOverlay.classList.toggle('show')});
sidebarOverlay.addEventListener('click',closeSidebar);
$('themeToggleSide').addEventListener('click',()=>{const cur=document.documentElement.getAttribute('data-theme');document.documentElement.setAttribute('data-theme',cur==='dark'?'light':'dark')});
$('themeToggleMobile').addEventListener('click',()=>{const cur=document.documentElement.getAttribute('data-theme');document.documentElement.setAttribute('data-theme',cur==='dark'?'light':'dark')});

/* ── Keyboard shortcuts ──────────────────────────────────── */
document.addEventListener('keydown',e=>{
  const tag=e.target.tagName.toLowerCase();
  if(tag==='input'||tag==='textarea')return;
  if(e.code==='Space'){e.preventDefault();togglePlay()}
  else if(e.code==='ArrowRight'){e.preventDefault();if(e.shiftKey)nextTrack();else if(ytReady){const d=ytPlayer.getDuration()||0;ytPlayer.seekTo(Math.min((ytPlayer.getCurrentTime()||0)+10,d))}}
  else if(e.code==='ArrowLeft'){e.preventDefault();if(e.shiftKey)prevTrack();else if(ytReady)ytPlayer.seekTo(Math.max((ytPlayer.getCurrentTime()||0)-10,0))}
  else if(e.code==='KeyM'){e.preventDefault();muteBtn.click()}
  else if(e.code==='Escape')closeTrackScreen()
});

/* ── Queue panel toggle ──────────────────────────────────── */
const queueToggle=$('queueToggle');
if(queueToggle)queueToggle.addEventListener('click',()=>{const qp=$('queuePanel');if(qp)qp.classList.toggle('open');renderQueuePanel()});

/* ── Init ────────────────────────────────────────────────── */
setVolBar(80);
window.addEventListener('load',async()=>{
  setTimeout(()=>splash.classList.add('hidden'),1800);
  await Promise.all([loadTrending(),loadAnime()])
});
