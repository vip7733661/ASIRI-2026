(() => {
  'use strict';
  const PORTFOLIO_KEY='asiri-intelligence-os-v1-portfolio';
  const ALERT_KEY='asiri-intelligence-os-v1-alerts-seen';
  const $=id=>document.getElementById(id);
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const money=v=>finite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v):'—';
  const num=(v,d=1)=>finite(v)?new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v):'—';
  const esc=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const state={market:null,portfolio:[],signals:[]};

  function loadPortfolio(){try{const x=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||'[]');state.portfolio=Array.isArray(x)?x:[];}catch{state.portfolio=[];}}
  function freshWindowHours(date=new Date()){const d=date.getUTCDay();return d===0||d===1?84:42;}
  function dataAgeHours(){const t=Date.parse(state.market?.generatedAt||'');return Number.isFinite(t)?(Date.now()-t)/36e5:Infinity;}
  function marketRegime(){const s=state.market?.symbols?.SPY;if(!s)return 'unknown';if(s.latestClose>s.sma20&&s.sma20>s.sma50&&s.rsi14<72)return 'positive';if(s.latestClose<s.sma50)return 'defensive';return 'neutral';}
  function levels(s){const entryLow=s.latestClose*.995,entryHigh=s.latestClose*1.01;let stop=Math.min(s.sma20||s.latestClose*.94,s.latestClose*.94);if(stop>=entryLow)stop=entryLow*.95;const risk=Math.max(.01,entryLow-stop);return{entryLow,entryHigh,stop,target1:entryLow+risk*2,target2:entryLow+risk*3};}
  function score(s){
    if(!s||!finite(s.quality?.score)||s.quality.score<90)return{score:0,type:'blocked',label:'موقوف',reasons:['جودة البيانات أقل من 90']};
    let n=45;const reasons=[];const rv=finite(s.volume)&&finite(s.avgVolume20)&&s.avgVolume20>0?s.volume/s.avgVolume20:null;
    if(s.latestClose>s.sma20){n+=12;reasons.push('السعر فوق SMA20');}else{n-=12;reasons.push('السعر تحت SMA20');}
    if(s.sma20>s.sma50){n+=15;reasons.push('SMA20 فوق SMA50');}else{n-=14;reasons.push('الاتجاه المتوسط سلبي');}
    if(finite(s.rsi14)&&s.rsi14>=48&&s.rsi14<=68){n+=12;reasons.push('RSI في نطاق دخول صحي');}else if(s.rsi14>74){n-=16;reasons.push('تشبع شرائي');}else if(s.rsi14<35){n-=10;reasons.push('زخم ضعيف');}
    if(finite(rv)&&rv>=1.15){n+=12;reasons.push('حجم نسبي مؤكد');}else if(finite(rv)&&rv<.7){n-=6;reasons.push('الحجم دون المتوسط');}
    if(finite(s.changePercent)&&s.changePercent>6){n-=12;reasons.push('خطر مطاردة بعد صعود حاد');}
    if(marketRegime()==='positive'){n+=5;reasons.push('السوق داعم');}else if(marketRegime()==='defensive'){n-=10;reasons.push('السوق دفاعي');}
    n=Math.max(0,Math.min(100,Math.round(n)));
    let type='watch',label='مراقبة';
    if(n>=82&&s.latestClose>s.sma20&&s.sma20>s.sma50&&finite(rv)&&rv>=1.15&&s.rsi14<=68){type='buy';label='Golden Buy Alert';}
    else if(n>=68){type='hold';label='احتفاظ / مراقبة دخول';}
    else if(n<35){type='reduce';label='تخفيف / تجنب';}
    return{score:n,type,label,reasons,rv};
  }
  function buildSignals(){
    const held=new Map(state.portfolio.map(p=>[p.symbol,p]));const out=[];
    for(const s of Object.values(state.market?.symbols||{})){
      const a=score(s);if(a.type==='blocked')continue;const lv=levels(s);let type=a.type,label=a.label,context='فرصة خارج المحفظة';
      const p=held.get(s.symbol);
      if(p){context='داخل المحفظة';const pnlPct=p.avgCost>0?(s.latestClose-p.avgCost)/p.avgCost*100:null;if((s.latestClose<s.sma50&&pnlPct<0)||a.score<25){type='exit';label='تنبيه خروج دفاعي';a.reasons.unshift('كسر الاتجاه مع مركز خاسر');}else if(a.score<45){type='reduce';label='تنبيه تخفيف';}}
      if(type==='buy'||type==='exit'||type==='reduce'||(p&&type==='hold'))out.push({symbol:s.symbol,s,a,type,label,context,levels:lv});
    }
    state.signals=out.sort((x,y)=>{const priority={exit:5,buy:4,reduce:3,hold:2,watch:1};return priority[y.type]-priority[x.type]||y.a.score-x.a.score;});
  }
  function card(x){const l=x.levels;return`<article class="alert-card ${x.type==='buy'?'golden':x.type==='exit'?'exit':''}"><div class="alert-card-head"><div><h4>${esc(x.symbol)} · ${x.a.score}/100</h4><small>${esc(x.context)}</small></div><span class="alert-chip ${x.type}">${esc(x.label)}</span></div><div class="alert-levels"><div><span>الدخول</span><strong>${money(l.entryLow)}–${money(l.entryHigh)}</strong></div><div><span>وقف/إلغاء</span><strong>${money(l.stop)}</strong></div><div><span>الهدف 1</span><strong>${money(l.target1)}</strong></div><div><span>الهدف 2</span><strong>${money(l.target2)}</strong></div></div><p class="alert-reasons">${esc(x.a.reasons.slice(0,4).join(' · '))}</p><p class="alert-reasons">RSI ${num(x.s.rsi14)} · RVOL ${num(x.a.rv,2)} · جودة ${num(x.s.quality?.score,0)}/100</p></article>`;}
  function render(){
    const fresh=dataAgeHours()<=freshWindowHours();const buys=state.signals.filter(x=>x.type==='buy');const risk=state.signals.filter(x=>x.type==='exit'||x.type==='reduce');
    $('alertFreshness').textContent=fresh?'البيانات حديثة':'البيانات قديمة';$('alertFreshness').className=fresh?'alert-fresh':'alert-stale';
    $('alertBuyCount').textContent=fresh?String(buys.length):'0';$('alertRiskCount').textContent=String(risk.length);$('alertMarket').textContent={positive:'إيجابي',neutral:'حيادي',defensive:'دفاعي',unknown:'غير متاح'}[marketRegime()];
    $('alertUpdated').textContent=state.market?.generatedAt?new Date(state.market.generatedAt).toLocaleString('ar-SA'):'—';
    $('goldenBuyList').innerHTML=!fresh?'<div class="alert-warning">تم تعطيل إشارات الشراء لأن بيانات السوق ليست حديثة بما يكفي. حدّث Snapshot أولًا.</div>':buys.length?buys.map(card).join(''):'<div class="alert-empty">لا توجد إشارة شراء مكتملة الشروط الآن. الانتظار قرار.</div>';
    $('portfolioAlertList').innerHTML=risk.length?risk.map(card).join(''):'<div class="alert-empty">لا توجد إشارات خروج أو تخفيف قوية في البيانات الحالية.</div>';
    if(fresh)notifyNew(buys.concat(risk));
  }
  function seen(){try{return new Set(JSON.parse(localStorage.getItem(ALERT_KEY)||'[]'));}catch{return new Set();}}
  function notifyNew(items){if(Notification.permission!=='granted')return;const s=seen();let changed=false;for(const x of items){const id=`${state.market.generatedAt}|${x.symbol}|${x.type}`;if(s.has(id))continue;s.add(id);changed=true;new Notification(`${x.label}: ${x.symbol}`,{body:`الدرجة ${x.a.score}/100 — افتح Asiri Intelligence OS للتفاصيل.`,icon:'icon.svg',tag:id});}if(changed)localStorage.setItem(ALERT_KEY,JSON.stringify([...s].slice(-100)));}
  async function enableNotifications(){if(!('Notification'in window)){alert('هذا المتصفح لا يدعم إشعارات الويب.');return;}const p=await Notification.requestPermission();$('enableAlerts').textContent=p==='granted'?'الإشعارات مفعلة':'تعذر تفعيل الإشعارات';if(p==='granted')notifyNew(state.signals);}
  async function load(){try{loadPortfolio();const r=await fetch(`market-data.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);state.market=await r.json();buildSignals();render();}catch(e){$('goldenBuyList').innerHTML=`<div class="alert-warning">تعذر تشغيل المحرك: ${esc(e.message)}</div>`;}}
  $('enableAlerts')?.addEventListener('click',enableNotifications);$('refreshAlerts')?.addEventListener('click',load);window.addEventListener('storage',e=>{if(e.key===PORTFOLIO_KEY)load();});load();
})();