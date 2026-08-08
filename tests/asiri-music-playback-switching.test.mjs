import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const engineUrl=new URL('../asiri-music-staging/src/playback-engine-v2.js',import.meta.url);

async function loadEngine(){
  const source=await readFile(engineUrl,'utf8');
  const window={dispatchEvent(){}};
  const quietConsole={...console,warn(){}};
  class StubCustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail}}
  vm.runInNewContext(source,{window,EventTarget,CustomEvent:StubCustomEvent,console:quietConsole,setTimeout,clearTimeout},{filename:'playback-engine-v2.js'});
  return window.AsiriPlaybackEngineV2;
}

const track=id=>({id,name:`Track ${id}`,uri:`spotify:track:${id}`,artists:[{name:'Artist'}],album:{images:[]}});
const stateFor=(id,paused=false)=>({paused,position:100,duration:180000,track_window:{current_track:{id,uri:`spotify:track:${id}`}}});

test('playback preparation does not transfer an already active Asiri device',async()=>{
  const Engine=await loadEngine(),calls=[];
  const engine=new Engine({getToken:async()=>'token',api:async(...args)=>{calls.push(args)}});
  engine.connect=async()=>'asiri-device';
  engine.waitUntilDeviceVisible=async()=>({id:'asiri-device',is_active:true,is_restricted:false});
  assert.equal(await engine.prepareDevice(),'asiri-device');
  assert.equal(calls.length,0);
});

test('an inactive Asiri device is transferred and confirmed active before audio starts',async()=>{
  const Engine=await loadEngine(),calls=[];
  let active=false,current='old';
  const engine=new Engine({
    getToken:async()=>'token',
    api:async(path,options={})=>{
      calls.push({path,options});
      if(path==='/me/player/devices')return{devices:[{id:'asiri-device',is_active:active,is_restricted:false}]};
      if(path==='/me/player'){
        active=true;
        return null;
      }
      if(path.startsWith('/me/player/play'))current=JSON.parse(options.body).uris[0].split(':').at(-1);
      return null;
    }
  });
  engine.emit=()=>{};
  engine.connect=async()=>'asiri-device';
  engine.player={getCurrentState:async()=>stateFor(current),resume:async()=>{}};
  engine.setQueue([track('wanted')],{startIndex:0});

  const played=await engine.playIndex(0);
  const transferIndex=calls.findIndex(call=>call.path==='/me/player');
  const startIndex=calls.findIndex(call=>call.path.startsWith('/me/player/play'));
  const transfer=calls[transferIndex];
  assert.equal(played.id,'wanted');
  assert.ok(transferIndex>=0&&startIndex>transferIndex);
  assert.deepEqual(JSON.parse(transfer.options.body),{device_ids:['asiri-device'],play:false});
  assert.ok(calls.slice(transferIndex+1,startIndex).some(call=>call.path==='/me/player/devices'));
});

test('reconnecting an existing Web Playback player keeps its ready-listener generation valid',async()=>{
  const Engine=await loadEngine();
  const engine=new Engine({getToken:async()=>'token',api:async()=>null});
  engine.generation=7;
  engine.waitForSdk=async()=>{};
  engine.player={connect:async()=>{engine.deviceId='asiri-device';return true}};
  assert.equal(await engine.connect(),'asiri-device');
  assert.equal(engine.generation,7);
});

test('Asiri confirms the selected track after starting a healthy remaining queue',async()=>{
  const Engine=await loadEngine(),calls=[];
  let current='old';
  const engine=new Engine({
    getToken:async()=>'token',
    api:async(path,options={})=>{
      calls.push({path,options});
      if(path.startsWith('/me/player/play'))current=JSON.parse(options.body).uris[0].split(':').at(-1);
    }
  });
  engine.emit=()=>{};
  engine.prepareDevice=async()=>'asiri-device';
  engine.player={getCurrentState:async()=>stateFor(current),resume:async()=>{}};
  engine.setQueue([track('a'),track('b')],{startIndex:0});
  const played=await engine.playIndex(0);
  const starts=calls.filter(call=>call.path.startsWith('/me/player/play'));
  assert.equal(played.id,'a');
  assert.equal(starts.length,1);
  assert.deepEqual(JSON.parse(starts[0].options.body).uris,['spotify:track:a','spotify:track:b']);
  assert.match(starts[0].path,/device_id=asiri-device/);
});

test('a rejected batch falls back to the requested song and primes the next item',async()=>{
  const Engine=await loadEngine(),calls=[];
  let current='old';
  const engine=new Engine({
    getToken:async()=>'token',
    api:async(path,options={})=>{
      calls.push({path,options});
      if(path.startsWith('/me/player/play')){
        const uris=JSON.parse(options.body).uris;
        if(uris.length>1){
          const error=new Error('queue contains an unavailable item');
          error.status=400;
          throw error;
        }
        current=uris[0].split(':').at(-1);
      }
    }
  });
  engine.emit=()=>{};
  engine.prepareDevice=async()=>'asiri-device';
  engine.player={getCurrentState:async()=>stateFor(current),resume:async()=>{}};
  engine.setQueue([track('wanted'),track('later')],{startIndex:0});
  const played=await engine.playIndex(0);
  const starts=calls.filter(call=>call.path.startsWith('/me/player/play')).map(call=>JSON.parse(call.options.body).uris);
  assert.equal(played.id,'wanted');
  assert.deepEqual(starts,[['spotify:track:wanted','spotify:track:later'],['spotify:track:wanted']]);
  assert.ok(calls.some(call=>call.path.startsWith('/me/player/queue?')&&call.path.includes('spotify%3Atrack%3Alater')));
});

test('a stale Spotify state triggers a selected-track retry before reporting success',async()=>{
  const Engine=await loadEngine(),calls=[];
  const engine=new Engine({
    getToken:async()=>'token',
    api:async(path,options={})=>{calls.push({path,options})}
  });
  engine.emit=()=>{};
  engine.prepareDevice=async()=>'asiri-device';
  let confirmations=0;
  engine.waitForTrack=async()=>++confirmations>1;
  engine.setQueue([track('wanted'),track('later')],{startIndex:0});
  const played=await engine.playIndex(0);
  const starts=calls.filter(call=>call.path.startsWith('/me/player/play')).map(call=>JSON.parse(call.options.body).uris);
  assert.equal(played.id,'wanted');
  assert.deepEqual(starts,[['spotify:track:wanted','spotify:track:later'],['spotify:track:wanted']]);
});

test('rate limits are surfaced without sending a duplicate selected-track request',async()=>{
  const Engine=await loadEngine(),calls=[];
  const engine=new Engine({
    getToken:async()=>'token',
    api:async(path,options={})=>{
      calls.push({path,options});
      if(path.startsWith('/me/player/play')){
        const error=new Error('rate limited');
        error.status=429;
        throw error;
      }
    }
  });
  engine.emit=()=>{};
  engine.prepareDevice=async()=>'asiri-device';
  engine.setQueue([track('a'),track('b')],{startIndex:0});
  await assert.rejects(engine.playIndex(0),/rate limited/);
  assert.equal(calls.filter(call=>call.path.startsWith('/me/player/play')).length,1);
});

test('fallback queue skips an unavailable next item and primes the following track',async()=>{
  const Engine=await loadEngine(),calls=[];
  const engine=new Engine({
    getToken:async()=>'token',
    api:async(path,options={})=>{
      calls.push({path,options});
      if(path.includes('spotify%3Atrack%3Ab')){
        const error=new Error('unavailable');
        error.status=403;
        throw error;
      }
    }
  });
  engine.emit=()=>{};
  engine.queue=[track('a'),track('b'),track('c')];
  engine.index=0;
  const primed=await engine.primeNextTrack('asiri-device');
  assert.equal(primed,2);
  const queued=calls.filter(call=>call.path.startsWith('/me/player/queue?')).map(call=>call.path);
  assert.equal(queued.length,2);
  assert.ok(queued[1].includes('spotify%3Atrack%3Ac'));
});

test('playback normalizes malformed track URIs before sending them to Spotify',async()=>{
  const Engine=await loadEngine();
  const engine=new Engine({getToken:async()=>'token',api:async()=>null});
  assert.equal(engine.trackUri({id:'abc123',uri:'spotify:episode:abc123'}),'spotify:track:abc123');
  assert.equal(engine.trackUri({id:'bad-id!',uri:''}),'');
});
