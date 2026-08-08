const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const FALLBACK_QUEUE_WINDOW=8;

class AsiriPlaybackEngineV2 extends EventTarget{
  constructor({getToken,api,onStatus=()=>{},onHealth=()=>{}}){
    super();
    this.getToken=getToken;
    this.api=api;
    this.onStatus=onStatus;
    this.onHealth=onHealth;
    this.player=null;
    this.deviceId='';
    this.queue=[];
    this.index=-1;
    this.connecting=null;
    this.command=Promise.resolve();
    this.generation=0;
    this.lastPlaybackState=null;
    this.remoteQueueMode='batch';
    this.remoteQueueIndexes=new Set();
    this.autoplayBlocked=false;
  }

  emit(type,detail={}){
    this.dispatchEvent(new CustomEvent(type,{detail}));
    window.dispatchEvent(new CustomEvent(`asiri:${type}`,{detail}));
  }

  async waitForSdk(timeout=12000){
    const started=Date.now();
    while(!window.Spotify?.Player){
      if(Date.now()-started>timeout)throw new Error('تعذر تحميل Spotify Player SDK');
      await sleep(100);
    }
  }

  async connect(){
    if(this.player&&this.deviceId)return this.deviceId;
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{
      await this.waitForSdk();
      if(!this.player)this.createPlayer(++this.generation);
      const connected=await this.player.connect();
      if(!connected)throw new Error('تعذر اتصال مشغل Spotify');
      for(let i=0;i<60&&!this.deviceId;i++)await sleep(150);
      if(!this.deviceId)throw new Error('لم يرسل Spotify معرف جهاز التشغيل');
      return this.deviceId;
    })().finally(()=>{this.connecting=null});
    return this.connecting;
  }

  createPlayer(generation){
    this.player=new Spotify.Player({
      name:'Asiri Music OS',
      getOAuthToken:async callback=>callback(await this.getToken()),
      volume:.8,
      enableMediaSession:true
    });
    this.player.addListener('ready',({device_id})=>{
      if(generation!==this.generation)return;
      this.deviceId=device_id;
      this.onHealth(true,'Playback Engine v6 جاهز');
      this.emit('playback-ready',{deviceId:device_id});
    });
    this.player.addListener('not_ready',({device_id})=>{
      if(device_id===this.deviceId)this.deviceId='';
      this.onHealth(false,'فقد اتصال جهاز التشغيل');
      this.emit('playback-not-ready',{deviceId:device_id});
    });
    this.player.addListener('player_state_changed',state=>{
      if(!state)return;
      this.lastPlaybackState=state;
      const track=state.track_window?.current_track;
      if(track){
        const previousIndex=this.index;
        const found=this.queue.findIndex(item=>item.id===track.id||item.uri===track.uri||item.id===track.linked_from?.id);
        if(found>=0)this.index=found;
        if(found>=0&&found!==previousIndex&&this.remoteQueueMode==='single'){
          this.primeNextTrack(this.deviceId).catch(error=>console.warn('[Playback Engine v6] queue prime',error));
        }
      }
      this.emit('player-state',{track,paused:state.paused,position:state.position,duration:state.duration,index:this.index,queue:[...this.queue]});
    });
    this.player.addListener('initialization_error',({message})=>this.fail(message));
    this.player.addListener('authentication_error',({message})=>this.fail(message||'يلزم تسجيل الدخول مجددًا'));
    this.player.addListener('account_error',({message})=>this.fail(message||'يتطلب التشغيل حساب Premium'));
    this.player.addListener('playback_error',({message})=>this.fail(message||'تعذر تشغيل Spotify'));
    this.player.addListener('autoplay_failed',()=>{
      this.autoplayBlocked=true;
      const message='iPhone منع بدء الصوت تلقائيًا. اضغط لتفعيل الصوت وتشغيل الأغنية.';
      this.onHealth(false,'يلزم تفعيل الصوت بضغطة على iPhone');
      this.emit('autoplay-failed',{message});
    });
  }

  fail(message){
    console.error('[Playback Engine v6]',message);
    this.onHealth(false,message);
    this.emit('playback-error',{message});
  }

  async activateFromGesture(){
    this.autoplayBlocked=false;
    if(!this.player&&window.Spotify?.Player)this.createPlayer(++this.generation);
    if(this.player?.activateElement)return this.player.activateElement();
    await this.connect();
    if(this.player?.activateElement)await this.player.activateElement();
  }

  setQueue(tracks,{startIndex=0,source='unknown'}={}){
    this.queue=[...new Map((tracks||[]).filter(track=>track?.id).map(track=>[track.id,track])).values()];
    if(!this.queue.length)throw new Error('لا توجد أغنيات صالحة للتشغيل');
    this.index=Math.min(Math.max(Number(startIndex)||0,0),this.queue.length-1);
    this.remoteQueueMode='batch';
    this.remoteQueueIndexes.clear();
    this.emit('queue-changed',{tracks:[...this.queue],currentIndex:this.index,source});
    return [...this.queue];
  }

  enqueue(task){
    this.command=this.command.catch(()=>{}).then(task);
    return this.command;
  }

  async waitUntilDeviceVisible(deviceId,timeout=8000,{active=false}={}){
    const started=Date.now();
    while(Date.now()-started<timeout){
      try{
        const data=await this.api('/me/player/devices');
        const device=(data.devices||[]).find(item=>item.id===deviceId);
        if(device&&(!active||device.is_active===true))return device;
      }catch{}
      await sleep(300);
    }
    return null;
  }

  async activatePlaybackDevice(deviceId,device){
    if(device?.is_restricted)throw new Error('جهاز Asiri Music مقيّد من Spotify ولا يقبل أوامر التشغيل');
    if(device?.is_active===true)return device;
    await this.api('/me/player',{
      method:'PUT',
      body:JSON.stringify({device_ids:[deviceId],play:false})
    });
    const activeDevice=await this.waitUntilDeviceVisible(deviceId,5000,{active:true});
    if(!activeDevice)throw new Error('Spotify لم يفعّل جهاز Asiri Music للصوت بعد');
    return activeDevice;
  }

  async prepareDevice(){
    const deviceId=await this.connect();
    const device=await this.waitUntilDeviceVisible(deviceId);
    if(!device)throw new Error('Spotify لم يعتمد جهاز Asiri Music بعد');
    await this.activatePlaybackDevice(deviceId,device);
    return deviceId;
  }

  trackUri(track){
    const id=String(track?.id||'').trim();
    const uri=String(track?.uri||'').trim();
    if(/^spotify:track:[A-Za-z0-9]+$/.test(uri))return uri;
    return /^[A-Za-z0-9]+$/.test(id)?`spotify:track:${id}`:'';
  }

  trackMatchesState(state,track){
    const current=state?.track_window?.current_track;
    if(!current||!track)return false;
    const wantedIds=new Set([track.id,track.linked_from?.id].filter(Boolean).map(String));
    const currentIds=[current.id,current.linked_from?.id].filter(Boolean).map(String);
    return current.uri===this.trackUri(track)||currentIds.some(id=>wantedIds.has(id));
  }

  async waitForTrack(track,timeout=2800){
    const started=Date.now();
    let resumed=false;
    while(Date.now()-started<timeout){
      if(this.autoplayBlocked){
        const error=new Error('iPhone منع بدء الصوت تلقائيًا.');
        error.code='AUTOPLAY_BLOCKED';
        throw error;
      }
      let state=this.lastPlaybackState;
      try{state=await this.player?.getCurrentState?.()||state}catch{}
      if(this.trackMatchesState(state,track)){
        if(!state?.paused)return true;
        if(!resumed&&this.player?.resume){
          resumed=true;
          try{await this.player.resume()}catch{}
        }
      }
      await sleep(140);
    }
    return false;
  }

  async sendStartPlayback(deviceId,uris,startPosition){
    return this.api('/me/player/play?device_id='+encodeURIComponent(deviceId),{
      method:'PUT',
      body:JSON.stringify({uris,position_ms:startPosition})
    });
  }

  shouldFallback(error,uriCount){
    const status=Number(error?.status)||0;
    return error?.code==='TRACK_NOT_CONFIRMED'||(uriCount>1&&(status===400||status===403));
  }

  async primeNextTrack(deviceId){
    if(!deviceId)return null;
    const end=Math.min(this.queue.length,this.index+1+FALLBACK_QUEUE_WINDOW);
    for(let nextIndex=this.index+1;nextIndex<end;nextIndex++){
      if(this.remoteQueueIndexes.has(nextIndex))continue;
      this.remoteQueueIndexes.add(nextIndex);
      const uri=this.trackUri(this.queue[nextIndex]);
      if(!uri)continue;
      try{
        await this.api('/me/player/queue?uri='+encodeURIComponent(uri)+'&device_id='+encodeURIComponent(deviceId),{method:'POST'});
        return nextIndex;
      }catch(error){
        const status=Number(error?.status)||0;
        console.warn('[Playback Engine v6] skipped unavailable next item',error);
        if(status===401||status===429||status>=500)return null;
      }
    }
    return null;
  }

  async playQueue(tracks,{startIndex=0,source='unknown',userGesture=false,positionMs=0}={}){
    this.setQueue(tracks,{startIndex,source});
    if(userGesture)await this.activateFromGesture();
    return this.playIndex(this.index,{positionMs});
  }

  async playIndex(index,{positionMs=0}={}){
    return this.enqueue(async()=>{
      if(!this.queue.length)throw new Error('لا توجد قائمة تشغيل حالية');
      this.index=(Number(index)+this.queue.length)%this.queue.length;
      const track=this.queue[this.index];
      this.onStatus(`جارٍ تشغيل ${track.name}…`);
      this.emit('track-selected',{track,index:this.index,queue:[...this.queue]});

      const deviceId=await this.prepareDevice();
      const uris=this.queue.slice(this.index).map(item=>this.trackUri(item)).filter(Boolean);
      const selectedUri=this.trackUri(track);
      if(!selectedUri||!uris.length)throw new Error('الأغنية المطلوبة غير صالحة لبدء التشغيل');
      const startPosition=Math.max(0,Number(positionMs)||0);

      let batchError=null;
      this.lastPlaybackState=null;
      try{
        await this.sendStartPlayback(deviceId,uris,startPosition);
        if(await this.waitForTrack(track)){
          this.remoteQueueMode='batch';
          this.remoteQueueIndexes.clear();
          this.onHealth(true,'Playback Engine v6 يعمل');
          this.onStatus(`يعمل الآن: ${track.name} — ${this.index+1} من ${this.queue.length} • التشغيل المستمر مفعّل`);
          this.emit('queue-mode',{mode:'continuous',queued:uris.length,total:uris.length});
          return track;
        }
        batchError=new Error('Spotify استلم القائمة لكنه لم ينتقل إلى الأغنية المطلوبة.');
        batchError.code='TRACK_NOT_CONFIRMED';
      }catch(error){batchError=error}

      if(!this.shouldFallback(batchError,uris.length))throw batchError;
      console.warn('[Playback Engine v6] batch start failed; retrying selected track only',batchError);
      this.lastPlaybackState=null;
      await this.sendStartPlayback(deviceId,[selectedUri],startPosition);
      if(!await this.waitForTrack(track,4200)){
        const error=new Error('Spotify استلم أمر التشغيل لكنه لم ينتقل إلى الأغنية المطلوبة.');
        error.code='TRACK_NOT_CONFIRMED';
        throw error;
      }

      this.remoteQueueMode='single';
      this.remoteQueueIndexes.clear();
      const primedIndex=await this.primeNextTrack(deviceId);
      this.onHealth(true,'Playback Engine v6 يعمل');
      this.onStatus(`يعمل الآن: ${track.name} • تم تثبيت التشغيل المباشر للأغنية المطلوبة`);
      this.emit('queue-mode',{mode:'resilient',queued:1+(primedIndex===null?0:1),total:uris.length});
      return track;
    });
  }

  next(){return this.playIndex(this.index<0?0:this.index+1)}
  previous(){return this.playIndex(this.index<0?0:this.index-1)}
  async toggle(){
    await this.activateFromGesture();
    if(!this.player)throw new Error('المشغل غير جاهز');
    return this.player.togglePlay();
  }

  async seek(positionMs){
    await this.connect();
    if(!this.player)throw new Error('المشغل غير جاهز');
    return this.player.seek(Math.max(0,Number(positionMs)||0));
  }

  getQueue(){return [...this.queue]}
  getCurrentIndex(){return this.index}
}

window.AsiriPlaybackEngineV2=AsiriPlaybackEngineV2;
window.dispatchEvent(new CustomEvent('asiri:playback-engine-v2-loaded'));
