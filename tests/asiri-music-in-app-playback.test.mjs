import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {safeResumePosition,upsertHistory} from '../asiri-music-staging/src/listening-history-core.js';
import {buildSmartMixQueries,personalizeTracks,smartMixSeeds} from '../asiri-music-staging/src/smart-mix-core.js';

const root=new URL('../asiri-music-staging/',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Asiri Music requests the official Spotify in-app playback permissions',async()=>{
  const app=await read('src/app.js');
  for(const scope of ['streaming','user-read-playback-state','user-modify-playback-state']){
    assert.match(app,new RegExp(`['"]${scope}['"]`));
  }
  assert.doesNotMatch(app,/scopeVersion|PLAYBACK_AUTH_VERSION/);
  assert.match(app,/ensurePlaybackEngine\(\)\.connect\(\)/);
});

test('the Spotify Web Playback SDK and Asiri playback engine load before the app',async()=>{
  const html=await read('index.html');
  const sdk=html.indexOf('https://sdk.scdn.co/spotify-player.js');
  const sdkReady=html.indexOf('onSpotifyWebPlaybackSDKReady');
  const engine=html.indexOf('src/playback-engine-v2.js');
  const app=html.indexOf('src/app.js');
  assert.ok(sdkReady>=0&&sdk>sdkReady&&engine>sdk&&app>engine);
  assert.match(html,/▶ تشغيل هنا/);
  assert.match(html,/playback-engine-v2\.js\?v=20260808-playback-v5/);
});

test('the regular iPhone shell no longer forces native Spotify playback',async()=>{
  const shell=await read('src/os-shell.js');
  const css=await read('stable-web.css');
  assert.doesNotMatch(shell,/native-playback/);
  assert.doesNotMatch(css,/\.player\s*\{[^}]*display\s*:\s*none/i);
});

test('saved library tracks use the Asiri playback queue',async()=>{
  const library=await read('src/library.js');
  assert.match(library,/play\.textContent='▶ تشغيل هنا'/);
  assert.match(library,/bridge\.playQueue\(\[track\]/);
  assert.match(library,/source:'saved-session',userGesture:true/);
});

test('Now Playing is wired to the in-app player with seek and taste controls',async()=>{
  const html=await read('index.html');
  const app=await read('src/app.js');
  const nowPlaying=await read('src/now-playing.js');
  assert.match(html,/id="nowPlaying"/);
  assert.match(html,/id="nowSeek"/);
  assert.match(html,/src\/now-playing\.js/);
  assert.match(app,/seekPlayback:async positionMs=>ensurePlaybackEngine\(\)\.seek\(positionMs\)/);
  assert.match(nowPlaying,/asiri:player-state/);
  assert.match(nowPlaying,/AsiriTasteEngine\.rate\(currentTrack,'like'\)/);
});

test('continuous playback confirms the selected track and isolates a rejected Spotify queue',async()=>{
  const engine=await read('src/playback-engine-v2.js');
  assert.match(engine,/const FALLBACK_QUEUE_WINDOW=8;/);
  assert.match(engine,/this\.queue\.slice\(this\.index\)\.map\(item=>this\.trackUri\(item\)\)\.filter\(Boolean\)/);
  assert.match(engine,/trackMatchesState\(state,track\)/);
  assert.match(engine,/TRACK_NOT_CONFIRMED/);
  assert.match(engine,/status===400\|\|status===403/);
  assert.match(engine,/sendStartPlayback\(deviceId,\[selectedUri\],startPosition\)/);
  assert.match(engine,/primeNextTrack\(deviceId\)/);
  assert.match(engine,/status===401\|\|status===429\|\|status>=500/);
  assert.match(engine,/التشغيل المستمر مفعّل/);
  assert.match(engine,/تم تثبيت التشغيل المباشر للأغنية المطلوبة/);
});

test('universal search delegates the user gesture to one playback activation path',async()=>{
  const search=await read('src/precise-search.js');
  assert.doesNotMatch(search,/bridge\.activateFromGesture/);
  assert.match(search,/bridge\.playQueue\(queue,\{startIndex:index,source:'universal-search',userGesture:true\}\)/);
});

test('Now Playing exposes an interactive Up Next queue inside Asiri',async()=>{
  const html=await read('index.html');
  const nowPlaying=await read('src/now-playing.js');
  const library=await read('src/library.js');
  assert.match(html,/id="nowQueueToggle"/);
  assert.match(html,/id="nowQueueList"/);
  assert.match(nowPlaying,/asiri:queue-changed/);
  assert.match(nowPlaying,/source:'now-playing-up-next'/);
  assert.match(library,/sessionAction\('▶ تشغيل هنا','session-play'/);
});

test('listening history keeps recent tracks unique and clamps resume points safely',()=>{
  const track=id=>({id,name:'Track '+id,uri:'spotify:track:'+id,artists:[{name:'Artist'}],album:{name:'Album',images:[]}});
  let items=upsertHistory([],track('a'),1000);
  items=upsertHistory(items,track('b'),2000);
  items=upsertHistory(items,track('a'),3000);
  assert.deepEqual(items.map(item=>item.id),['a','b']);
  assert.equal(items[0].listenedAt,3000);
  assert.equal(safeResumePosition(3500,180000),0);
  assert.equal(safeResumePosition(65000,180000),65000);
  assert.equal(safeResumePosition(175000,180000),0);
});

test('Continue Listening resumes the Asiri queue from its saved position',async()=>{
  const html=await read('index.html');
  const app=await read('src/app.js');
  const engine=await read('src/playback-engine-v2.js');
  const history=await read('src/listening-history.js');
  assert.match(html,/id="continueListeningContent"/);
  assert.match(html,/src\/listening-history\.js/);
  assert.match(app,/positionMs=0/);
  assert.match(engine,/position_ms:startPosition/);
  assert.match(history,/source:'resume-history'/);
  assert.match(history,/asiri:open-now-playing/);
});

test('Smart Mix derives personal seeds and filters disliked tracks',()=>{
  const makeTrack=(id,artist,popularity=50)=>({id,name:'Track '+id,uri:'spotify:track:'+id,popularity,is_playable:true,artists:[{name:artist}],album:{images:[]}});
  const taste={
    artists:{'محمد عبده':{score:8,likes:3},'راشد الماجد':{score:3,likes:1}},
    tracks:{blocked:{id:'blocked',value:'dislike'}}
  };
  const history=[makeTrack('recent','محمد عبده'),makeTrack('other','عبادي الجوهر')];
  assert.equal(smartMixSeeds(taste,history,3)[0],'محمد عبده');
  assert.match(buildSmartMixQueries(taste,history,4)[0],/محمد عبده/);
  const mixed=personalizeTracks([
    makeTrack('a','محمد عبده',80),makeTrack('a','محمد عبده',80),makeTrack('blocked','محمد عبده',100),
    makeTrack('b','راشد الماجد',60),makeTrack('c','محمد عبده',70),makeTrack('d','عبادي الجوهر',65)
  ],{taste,history,limit:6,maxPerArtist:2});
  assert.equal(new Set(mixed.map(track=>track.id)).size,mixed.length);
  assert.ok(!mixed.some(track=>track.id==='blocked'));
  assert.ok(mixed.filter(track=>track.artists[0].name==='محمد عبده').length<=2);
  assert.notEqual(mixed[0]?.artists[0].name,mixed[1]?.artists[0].name);
});

test('Asiri Smart Mix is wired to in-app playback and Saved Sessions',async()=>{
  const html=await read('index.html');
  const smartMix=await read('src/smart-mix.js');
  assert.match(html,/id="smartMixPanel"/);
  assert.match(html,/id="smartMixGenerate"/);
  assert.match(html,/src\/smart-mix\.js/);
  assert.match(smartMix,/smartMix\.last\.v1/);
  assert.match(smartMix,/source:'smart-mix',userGesture:true/);
  assert.match(smartMix,/asiri:open-now-playing/);
  assert.match(smartMix,/aiDj\.lastSession/);
  assert.doesNotMatch(smartMix,/\/recommendations|\/me\/top/);
});
