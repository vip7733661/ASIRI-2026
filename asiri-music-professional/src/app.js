import { EventBus } from './core/event-bus.js';
import { StorageService } from './services/storage-service.js';
import { SpotifyClient } from './services/spotify-client.js';
import { PlayerEngine } from './services/player-engine.js';
import { AuthService, spotifyClientId } from './services/auth-service.js';

const $=s=>document.querySelector(s);
const bus=new EventBus();
const storage=new StorageService({namespace:'asiri-music-pro',version:1});
storage.migrateLegacy({'spotify_access_token':'spotify.accessToken','spotify_expires_at':'spotify.expiresAt','spotify_refresh_token':'spotify.refreshToken'});
const auth=new AuthService({storage,bus});
const spotify=new SpotifyClient({clientId:spotifyClientId,storage,eventBus:bus});
const player=new PlayerEngine({spotify,eventBus:bus});

const loginButton=$('#loginButton'),healthCard=$('#healthCard'),healthStatus=$('#healthStatus'),profileCard=$('#profileCard'),profileName=$('#profileName'),profilePlan=$('#profilePlan'),searchForm=$('#searchForm'),searchInput=$('#searchInput'),statusText=$('#statusText'),results=$('#results'),resultCount=$('#resultCount'),template=$('#trackTemplate'),playerBar=$('#playerBar'),playerCover=$('#playerCover'),playerTitle=$('#playerTitle'),playerArtist=$('#playerArtist'),playButton=$('#playButton'),prevButton=$('#prevButton'),nextButton=$('#nextButton');

function setStatus(text){statusText.textContent=text}
function setHealth(ok,text){healthCard.classList.toggle('ok',ok);healthCard.classList.toggle('warn',!ok);healthStatus.textContent=text}
function renderTrack(track){const node=template.content.cloneNode(true);node.querySelector('.cover').src=track.album?.images?.[0]?.url||'';node.querySelector('.name').textContent=track.name||'بدون اسم';node.querySelector('.artist').textContent=track.artists?.map(a=>a.name).join('، ')||'';node.querySelector('.album').textContent=track.album?.name||'';node.querySelector('.open').href=track.external_urls?.spotify||`https://open.spotify.com/track/${track.id}`;node.querySelector('.play').onclick=async()=>{setStatus('جارٍ تجهيز المشغل…');try{await player.playUris([track.uri||`spotify:track:${track.id}`]);setStatus('بدأ التشغيل داخل Asiri Music ✓')}catch(e){console.error(e);setStatus(e.message||'تعذر التشغيل الآن.')}};return node}

async function loadProfile(){if(!auth.isAuthenticated()){profileCard.classList.add('hidden');loginButton.classList.remove('hidden');setHealth(false,'بانتظار تسجيل الدخول');return}try{const me=await spotify.get('/me');profileName.textContent=me.display_name||me.id;profilePlan.textContent=me.product==='premium'?'Spotify Premium':'Spotify متصل';profileCard.classList.remove('hidden');loginButton.classList.add('hidden');setHealth(true,'النواة مستقرة وجاهزة');setStatus('تم الاتصال. يمكنك البحث والتشغيل.');try{await player.initialize()}catch(e){console.warn('Player waits for SDK/user gesture',e)}}catch(e){console.error(e);setHealth(false,'تعذر التحقق من Spotify');loginButton.classList.remove('hidden')}}

searchForm.addEventListener('submit',async event=>{event.preventDefault();const q=searchInput.value.trim();if(!q)return;results.innerHTML='';resultCount.textContent='';setStatus('جارٍ البحث…');try{const params=new URLSearchParams({q,type:'track',limit:'10',offset:'0'});const data=await spotify.get(`/search?${params}`);const items=data.tracks?.items||[];items.forEach(t=>results.appendChild(renderTrack(t)));resultCount.textContent=`${items.length} نتيجة`;setStatus(items.length?'اختر أغنية للتشغيل.':'لا توجد نتائج.')}catch(e){console.error(e);setStatus(e.code==='AUTH_REQUIRED'?'سجّل الدخول أولًا.':e.message||'تعذر البحث.')}});

loginButton.onclick=()=>auth.login();
playButton.onclick=()=>player.toggle();prevButton.onclick=()=>player.previous();nextButton.onclick=()=>player.next();
bus.on('player:ready',()=>setHealth(true,'Spotify Player جاهز'));
bus.on('player:error',payload=>{console.error(payload);setHealth(false,'المشغل يحتاج إعادة تهيئة')});
bus.on('player:state',state=>{const t=state.track;if(!t)return;playerBar.classList.remove('hidden');playerCover.src=t.album?.images?.[0]?.url||'';playerTitle.textContent=t.name||'';playerArtist.textContent=t.artists?.map(a=>a.name).join('، ')||'';playButton.textContent=state.paused?'▶':'⏸'});
window.onSpotifyWebPlaybackSDKReady=()=>{if(auth.isAuthenticated())player.initialize().catch(console.error)};
window.addEventListener('error',event=>{console.error(event.error||event.message);setHealth(false,'تم عزل خطأ دون إيقاف التطبيق')});
window.addEventListener('unhandledrejection',event=>{console.error(event.reason);setHealth(false,'تم احتواء خطأ غير متوقع')});

setHealth(true,'تم تحميل النواة الاحترافية');
loadProfile();