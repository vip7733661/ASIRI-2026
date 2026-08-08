const CLIENT_ID='3ac122f971744e508bfd33ad0637d421';
const SCOPES=['user-read-private','user-read-email','streaming','user-read-playback-state','user-modify-playback-state','user-library-read','user-library-modify','playlist-read-private','playlist-modify-private','playlist-modify-public'];
const PLAYBACK_SCOPES=['streaming','user-read-playback-state','user-modify-playback-state'];
const NS='asiri-music-pro.v1.';
const $=selector=>document.querySelector(selector);
const get=key=>{try{return JSON.parse(localStorage.getItem(NS+key)||'null')?.value??null}catch{return null}};
const set=(key,value)=>localStorage.setItem(NS+key,JSON.stringify({envelopeVersion:1,savedAt:Date.now(),value}));
const remove=key=>localStorage.removeItem(NS+key);
let currentQueue=[];
let currentIndex=-1;
let playbackEngine=null;
let pendingPlaybackRequest=null;

function base64url(input){return btoa(String.fromCharCode(...new Uint8Array(input))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
async function sha256(text){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))}
function randomString(length=64){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~',values=crypto.getRandomValues(new Uint8Array(length));return Array.from(values,value=>chars[value%chars.length]).join('')}

async function login(){
  const verifier=randomString();
  const challenge=base64url(await sha256(verifier));
  set('spotify.codeVerifier',verifier);
  const redirectUri=new URL('callback.html',location.href).href;
  location.href='https://accounts.spotify.com/authorize?'+new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:redirectUri,scope:SCOPES.join(' '),code_challenge_method:'S256',code_challenge:challenge,show_dialog:'true'});
}

async function refresh(){
  const refreshToken=get('spotify.refreshToken');
  if(!refreshToken)return null;
  const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,grant_type:'refresh_token',refresh_token:refreshToken})});
  if(!response.ok)return null;
  const payload=await response.json();
  set('spotify.accessToken',payload.access_token);
  set('spotify.expiresAt',Date.now()+payload.expires_in*1000-60000);
  if(payload.refresh_token)set('spotify.refreshToken',payload.refresh_token);
  if(payload.scope)set('spotify.scope',payload.scope);
  return payload.access_token;
}

async function token(){
  const accessToken=get('spotify.accessToken');
  const expiresAt=Number(get('spotify.expiresAt')||0);
  return accessToken&&Date.now()<expiresAt?accessToken:refresh();
}

async function api(path,options={}){
  const accessToken=await token();
  if(!accessToken)throw new Error('AUTH_REQUIRED');
  const response=await fetch('https://api.spotify.com/v1'+path,{...options,headers:{Authorization:'Bearer '+accessToken,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  if(response.status===401){remove('spotify.accessToken');throw new Error('AUTH_REQUIRED')}
  if(!response.ok){
    let message='';
    try{message=(await response.json())?.error?.message||''}catch{}
    const error=new Error(message||`SPOTIFY_${response.status}`);
    error.status=response.status;
    throw error;
  }
  return response.status===204?null:response.json();
}

function health(ok,text){
  $('#healthCard')?.classList.toggle('ok',ok);
  $('#healthCard')?.classList.toggle('warn',!ok);
  if($('#healthStatus'))$('#healthStatus').textContent=text;
}
function status(text){if($('#statusText'))$('#statusText').textContent=text}

function grantedSpotifyScopes(){
  const raw=String(get('spotify.scope')||'').trim();
  return raw?new Set(raw.split(/\s+/).filter(Boolean)):null;
}

function missingPlaybackScopes(){
  const granted=grantedSpotifyScopes();
  return granted?PLAYBACK_SCOPES.filter(scope=>!granted.has(scope)):[];
}

function playbackAuthorizationError(){
  const error=new Error('صلاحية الصوت في جلسة Spotify الحالية غير مكتملة. فعّل الصوت مرة واحدة ثم جرّب الأغنية من جديد.');
  error.code='PLAYBACK_AUTH_REQUIRED';
  error.status=403;
  return error;
}

function requireKnownPlaybackScopes(){
  if(missingPlaybackScopes().length)throw playbackAuthorizationError();
}

function showPlaybackRecovery(message,{reauth=false}={}){
  const notice=$('#playbackRecovery');
  const text=$('#playbackRecoveryText');
  const button=$('#playbackRecoveryButton');
  if(text)text.textContent=message;
  if(button){
    button.dataset.action=reauth?'reauth':'retry';
    button.textContent=reauth?'تفعيل الصوت عبر Spotify':'🔊 تفعيل الصوت وتشغيل الأغنية';
  }
  notice?.classList.remove('hidden');
}

function hidePlaybackRecovery(){
  $('#playbackRecovery')?.classList.add('hidden');
}

function handlePlaybackFailure(error){
  const granted=grantedSpotifyScopes();
  const missing=missingPlaybackScopes();
  const authRequired=error?.code==='PLAYBACK_AUTH_REQUIRED'||error?.message==='AUTH_REQUIRED'||(Number(error?.status)===403&&(!granted||missing.length));
  if(authRequired){
    showPlaybackRecovery('Spotify متصل للبحث، لكن جلسة الحساب الحالية لا تملك صلاحيات الصوت المطلوبة داخل Asiri. التفعيل مرة واحدة يحفظ الصلاحيات الجديدة.',{reauth:true});
    const button=$('#loginButton');
    if(button){button.classList.remove('hidden');button.textContent='تفعيل الصوت عبر Spotify'}
    return;
  }
  if(error?.code==='AUTOPLAY_BLOCKED'){
    showPlaybackRecovery('iPhone منع بدء الصوت تلقائيًا. اضغط الزر الأخضر مرة واحدة وسأشغّل نفس الأغنية فورًا.');
    return;
  }
  showPlaybackRecovery(error?.message?`تعذر بدء الصوت: ${error.message}`:'تعذر بدء الصوت الآن. اضغط لإعادة المحاولة.');
}

function setQueue(tracks,{startIndex=0,source='web'}={}){
  currentQueue=[...new Map((tracks||[]).filter(track=>track?.id).map(track=>[track.id,track])).values()];
  currentIndex=currentQueue.length?Math.min(Math.max(startIndex,0),currentQueue.length-1):-1;
  window.dispatchEvent(new CustomEvent('asiri:queue-changed',{detail:{tracks:[...currentQueue],source,currentIndex}}));
  return [...currentQueue];
}

function spotifyUrl(track){
  return track?.external_urls?.spotify||`https://open.spotify.com/track/${encodeURIComponent(track?.id||'')}`;
}

function openTrack(track,index){
  if(!track?.id)throw new Error('الأغنية غير صالحة للتشغيل.');
  if(Number.isInteger(index))currentIndex=index;
  set('lastOpenedTrack',{id:track.id,name:track.name,artist:track.artists?.map(a=>a.name).join('، ')||'',openedAt:Date.now()});
  status(`تم إرسال «${track.name}» إلى تطبيق Spotify.`);
  window.location.href=spotifyUrl(track);
}

function ensurePlaybackEngine(){
  if(playbackEngine)return playbackEngine;
  if(!window.AsiriPlaybackEngineV2)throw new Error('مشغل Asiri لم يكتمل تحميله بعد. أعد المحاولة.');
  playbackEngine=new window.AsiriPlaybackEngineV2({getToken:token,api,onStatus:status,onHealth:health});
  playbackEngine.addEventListener('queue-changed',event=>{
    currentQueue=[...(event.detail?.tracks||[])];
    currentIndex=Number(event.detail?.currentIndex??-1);
  });
  playbackEngine.addEventListener('player-state',event=>updatePlayerBar(event.detail));
  playbackEngine.addEventListener('track-selected',event=>{
    currentIndex=Number(event.detail?.index??currentIndex);
    showPlayerTrack(event.detail?.track,false);
  });
  playbackEngine.addEventListener('autoplay-failed',event=>{
    showPlaybackRecovery(event.detail?.message||'iPhone منع بدء الصوت تلقائيًا. اضغط لتفعيل الصوت وتشغيل الأغنية.');
  });
  playbackEngine.addEventListener('playback-error',event=>{
    showPlaybackRecovery(event.detail?.message||'تعذر تشغيل Spotify داخل Asiri.');
  });
  return playbackEngine;
}

function showPlayerTrack(track,playing){
  if(!track)return;
  const bar=$('#playerBar');
  bar?.classList.remove('hidden');
  bar?.classList.toggle('is-playing',Boolean(playing));
  const image=track.album?.images?.[0]?.url||track.images?.[0]?.url||'';
  if($('#playerCover'))$('#playerCover').src=image;
  if($('#playerTitle'))$('#playerTitle').textContent=track.name||'يعمل الآن';
  if($('#playerArtist'))$('#playerArtist').textContent=(track.artists||[]).map(artist=>artist.name).join('، ');
  if($('#playButton'))$('#playButton').textContent=playing?'⏸':'▶';
}

function updatePlayerBar(detail={}){
  if(Number.isInteger(detail.index))currentIndex=detail.index;
  showPlayerTrack(detail.track,!detail.paused);
  const duration=Number(detail.duration)||0;
  const position=Number(detail.position)||0;
  if($('#playerProgress'))$('#playerProgress').style.width=duration?Math.min(100,Math.max(0,position/duration*100))+'%':'0%';
}

async function activateFromGesture(){
  try{
    requireKnownPlaybackScopes();
    return ensurePlaybackEngine().activateFromGesture();
  }catch(error){
    handlePlaybackFailure(error);
    throw error;
  }
}

async function playQueue(tracks,{startIndex=0,source='web',userGesture=false,positionMs=0}={}){
  const queue=setQueue(tracks,{startIndex,source});
  if(!queue.length)throw new Error('لا توجد أغنيات صالحة للتشغيل.');
  pendingPlaybackRequest={tracks:[...queue],startIndex:currentIndex,source,positionMs};
  try{
    requireKnownPlaybackScopes();
    const engine=ensurePlaybackEngine();
    if(userGesture)await engine.activateFromGesture();
    await engine.playQueue(queue,{startIndex:currentIndex,source,userGesture:false,positionMs});
    pendingPlaybackRequest=null;
    hidePlaybackRecovery();
    return queue;
  }catch(error){
    handlePlaybackFailure(error);
    throw error;
  }
}

function render(track,index,queue){
  const fragment=$('#trackTemplate').content.cloneNode(true);
  const card=fragment.querySelector('.track');
  card.dataset.trackId=track.id||'';
  fragment.querySelector('.cover').src=track.album?.images?.[0]?.url||'';
  fragment.querySelector('.name').textContent=track.name||'';
  fragment.querySelector('.artist').textContent=track.artists?.map(artist=>artist.name).join('، ')||'';
  fragment.querySelector('.album').textContent=track.album?.name||'';
  const openLink=fragment.querySelector('.open');
  openLink.href=spotifyUrl(track);
  openLink.textContent='عرض في Spotify';
  const playButton=fragment.querySelector('.play');
  playButton.textContent='▶ تشغيل هنا';
  playButton.addEventListener('click',async event=>{
    event.preventDefault();
    event.stopPropagation();
    try{await activateFromGesture();await playQueue(queue,{startIndex:index,source:'search'});}
    catch(error){status(error.message||'تعذر تشغيل الأغنية.');}
  });
  queueMicrotask(()=>window.dispatchEvent(new CustomEvent('asiri:track-rendered',{detail:{card,track}})));
  return fragment;
}

async function load(){
  health(true,'Asiri Music جاهز');
  if(!get('spotify.accessToken')&&!get('spotify.refreshToken')){health(false,'بانتظار تسجيل الدخول');return}
  try{
    const me=await api('/me');
    if($('#profileName'))$('#profileName').textContent=me.display_name||me.id;
    if($('#profilePlan'))$('#profilePlan').textContent='Spotify متصل';
    $('#profileCard')?.classList.remove('hidden');
    if(missingPlaybackScopes().length){
      const button=$('#loginButton');
      if(button){button.classList.remove('hidden');button.textContent='تفعيل الصوت عبر Spotify'}
      health(false,'Spotify متصل — يلزم تفعيل صلاحيات الصوت');
      showPlaybackRecovery('البحث يعمل، لكن جلسة Spotify المحفوظة لا تحتوي جميع صلاحيات Web Playback. فعّل الصوت مرة واحدة فقط.',{reauth:true});
      return;
    }
    $('#loginButton')?.classList.add('hidden');
    status('اختر أغنية واستمع إليها داخل Asiri Music.');
    try{await ensurePlaybackEngine().connect();health(true,'Spotify Player جاهز — الاستماع داخل Asiri Music')}
    catch(error){
      console.error(error);
      health(false,error.message||'تعذر تجهيز المشغل الداخلي');
      handlePlaybackFailure(error);
      status('تعذر تجهيز Web Playback الآن. اتبع رسالة الصوت الظاهرة ثم أعد المحاولة.');
    }
  }catch(error){
    console.error(error);
    health(false,'يلزم تسجيل الدخول مجددًا');
    const button=$('#loginButton');
    if(button){button.classList.remove('hidden');button.textContent='الدخول عبر Spotify'}
  }
}

$('#loginButton')?.addEventListener('click',login);
$('#playbackRecoveryButton')?.addEventListener('click',async event=>{
  if(event.currentTarget?.dataset?.action==='reauth')return login();
  try{
    requireKnownPlaybackScopes();
    const engine=ensurePlaybackEngine();
    const activation=engine.activateFromGesture();
    await activation;
    const request=pendingPlaybackRequest;
    if(request){
      await playQueue(request.tracks,{startIndex:request.startIndex,source:request.source,userGesture:false,positionMs:request.positionMs});
    }else{
      await engine.toggle();
      hidePlaybackRecovery();
    }
  }catch(error){
    handlePlaybackFailure(error);
  }
});
$('#searchForm')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const query=$('#searchInput')?.value.trim();
  if(!query)return;
  $('#results').innerHTML='';
  status('جارٍ البحث…');
  try{
    const data=await api('/search?'+new URLSearchParams({q:query,type:'track',limit:'10',offset:'0'}));
    const queue=data.tracks?.items||[];
    setQueue(queue,{startIndex:0,source:'general-search'});
    queue.forEach((track,index)=>$('#results').appendChild(render(track,index,queue)));
    $('#resultCount').textContent=queue.length+' نتيجة';
    status(queue.length?'اختر «تشغيل هنا» على أي أغنية.':'لا توجد نتائج.');
  }catch(error){console.error(error);status(error.message==='AUTH_REQUIRED'?'سجّل الدخول أولًا.':error.message)}
});

window.AsiriMusicBridge={
  api,
  playQueue,
  replaceQueue:setQueue,
  activateFromGesture,
  getQueue:()=>[...currentQueue],
  getCurrentIndex:()=>currentIndex,
  setStatus:status,
  getStorage:get,
  setStorage:set,
  reconnectPlayer:async()=>ensurePlaybackEngine().connect(),
  hasInAppPlayback:()=>Boolean(playbackEngine?.deviceId),
  previousTrack:async()=>ensurePlaybackEngine().previous(),
  togglePlayback:async()=>ensurePlaybackEngine().toggle(),
  nextTrack:async()=>ensurePlaybackEngine().next(),
  seekPlayback:async positionMs=>ensurePlaybackEngine().seek(positionMs),
  openTrack,
  openTrackNative:openTrack
};
window.dispatchEvent(new CustomEvent('asiri:bridge-ready'));
$('#prevButton')?.addEventListener('click',async()=>{try{await activateFromGesture();await ensurePlaybackEngine().previous()}catch(error){status(error.message)}});
$('#playButton')?.addEventListener('click',async()=>{try{await activateFromGesture();await ensurePlaybackEngine().toggle()}catch(error){status(error.message)}});
$('#nextButton')?.addEventListener('click',async()=>{try{await activateFromGesture();await ensurePlaybackEngine().next()}catch(error){status(error.message)}});
load();
