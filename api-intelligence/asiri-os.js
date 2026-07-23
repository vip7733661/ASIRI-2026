(() => {
  'use strict';
  const STORAGE_KEY = 'asiri-intelligence-os-v1-portfolio';
  const $ = (id) => document.getElementById(id);
  const state = { market: null, positions: [] };
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => finite(v) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v) : '—';
  const number = (v,d=2) => finite(v) ? new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v) : '—';
  const pct = (v) => finite(v) ? `${v>=0?'+':''}${number(v,2)}%` : '—';
  const escapeHtml = (v) => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function loadPositions(){
    try { state.positions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { state.positions = []; }
    if (!Array.isArray(state.positions)) state.positions=[];
  }
  function savePositions(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state.positions)); }
  function snapshot(symbol){ return state.market?.symbols?.[symbol] || null; }

  function technicalScore(s){
    if (!s || !finite(s.quality?.score) || s.quality.score < 80) return {score:0,decision:'blocked',label:'موقوف',reasons:['جودة البيانات غير كافية']};
    let score=50; const reasons=[];
    if (s.latestClose > s.sma20){score+=12;reasons.push('السعر فوق SMA20');} else {score-=10;reasons.push('السعر تحت SMA20');}
    if (s.sma20 > s.sma50){score+=14;reasons.push('الاتجاه المتوسط إيجابي');} else {score-=12;reasons.push('SMA20 دون SMA50');}
    if (finite(s.rsi14) && s.rsi14>=45 && s.rsi14<=68){score+=10;reasons.push('RSI ضمن نطاق صحي');}
    else if (finite(s.rsi14) && s.rsi14>75){score-=15;reasons.push('RSI مرتفع');}
    else if (finite(s.rsi14) && s.rsi14<35){score-=8;reasons.push('زخم ضعيف');}
    const rv = finite(s.volume)&&finite(s.avgVolume20)&&s.avgVolume20>0 ? s.volume/s.avgVolume20 : null;
    if (finite(rv) && rv>=1.15){score+=8;reasons.push('حجم أعلى من المتوسط');}
    if (finite(s.changePercent) && s.changePercent>8){score-=10;reasons.push('ارتفاع يومي حاد؛ خطر مطاردة');}
    score=Math.max(0,Math.min(100,Math.round(score)));
    if (score>=75) return {score,decision:'hold',label:'احتفاظ / مراقبة دخول',reasons};
    if (score>=58) return {score,decision:'watch',label:'مراقبة',reasons};
    if (score>=40) return {score,decision:'wait',label:'انتظار',reasons};
    return {score,decision:'reduce',label:'تخفيف / تجنب',reasons};
  }

  function marketRegime(){
    const spy=snapshot('SPY');
    if(!spy) return {label:'غير متاح',tone:'os-warning'};
    if(spy.latestClose>spy.sma20 && spy.sma20>spy.sma50 && spy.rsi14<72) return {label:'إيجابي منضبط',tone:'os-positive'};
    if(spy.latestClose<spy.sma50) return {label:'دفاعي',tone:'os-negative'};
    return {label:'حيادي',tone:'os-warning'};
  }

  function portfolioRows(){
    return state.positions.map(p=>{
      const s=snapshot(p.symbol); const current=s?.latestClose;
      const cost=p.quantity*p.avgCost; const value=finite(current)?p.quantity*current:null;
      const pnl=finite(value)?value-cost:null; const pnlPct=cost>0&&finite(pnl)?pnl/cost*100:null;
      return {...p,s,current,cost,value,pnl,pnlPct,analysis:technicalScore(s)};
    });
  }

  function render(){
    const rows=portfolioRows(); const totalCost=rows.reduce((a,r)=>a+r.cost,0); const totalValue=rows.reduce((a,r)=>a+(r.value||0),0); const totalPnl=totalValue-totalCost;
    $('osMarketRegime').textContent=marketRegime().label; $('osMarketRegime').className=marketRegime().tone;
    $('osPositionCount').textContent=String(rows.length); $('osCost').textContent=money(totalCost); $('osValue').textContent=money(totalValue);
    $('osPnl').textContent=money(totalPnl); $('osPnl').className=totalPnl>=0?'os-positive':'os-negative';
    $('osPnlPct').textContent=totalCost>0?pct(totalPnl/totalCost*100):'—';
    const body=$('osPortfolioBody');
    if(!rows.length){ body.innerHTML='<tr><td colspan="9" class="os-empty">أضف أول مركز من النموذج أعلاه. البيانات تبقى على جهازك.</td></tr>'; }
    else body.innerHTML=rows.map(r=>{
      const weight=totalValue>0&&finite(r.value)?r.value/totalValue*100:null;
      const concentration=finite(weight)&&weight>35?' · تركّز مرتفع':'';
      return `<tr><td><strong>${escapeHtml(r.symbol)}</strong></td><td>${number(r.quantity,4)}</td><td>${money(r.avgCost)}</td><td>${money(r.current)}</td><td>${money(r.value)}</td><td class="${(r.pnl||0)>=0?'os-positive':'os-negative'}">${money(r.pnl)}<br><small>${pct(r.pnlPct)}</small></td><td>${finite(weight)?number(weight,1)+'%':'—'}</td><td><span class="os-decision ${r.analysis.decision}">${r.analysis.label}</span><div class="os-reasons">${escapeHtml(r.analysis.reasons.slice(0,2).join(' · ')+concentration)}</div></td><td><button class="os-remove" data-remove="${escapeHtml(r.symbol)}">حذف</button></td></tr>`;
    }).join('');
    body.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{state.positions=state.positions.filter(p=>p.symbol!==btn.dataset.remove);savePositions();render();}));
    renderOpportunities(rows.map(r=>r.symbol));
  }

  function renderOpportunities(held){
    const items=Object.values(state.market?.symbols||{}).filter(s=>!held.includes(s.symbol)).map(s=>({...s,analysis:technicalScore(s)})).filter(x=>x.analysis.decision!=='blocked').sort((a,b)=>b.analysis.score-a.analysis.score).slice(0,3);
    $('osOpportunities').innerHTML=items.length?items.map((s,i)=>`<div class="os-opportunity"><span>#${i+1}</span><strong>${escapeHtml(s.symbol)} · ${s.analysis.score}/100</strong><div>${money(s.latestClose)} · RSI ${number(s.rsi14,1)}</div><p class="os-reasons">${escapeHtml(s.analysis.reasons.slice(0,3).join(' · '))}</p></div>`).join(''):'<div class="os-empty">لا توجد فرص قابلة للتقييم حاليًا.</div>';
  }

  function populateSymbols(){
    const select=$('osSymbol'); const symbols=Object.keys(state.market?.symbols||{}).sort();
    select.innerHTML=symbols.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }

  async function loadMarket(){
    try{
      const res=await fetch(`market-data.json?t=${Date.now()}`,{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data=await res.json(); if(!data.generatedAt||!data.symbols) throw new Error('snapshot غير مكتمل');
      state.market=data; $('osDataState').textContent=`بيانات موثقة: ${Object.keys(data.symbols).length} رموز · ${new Date(data.generatedAt).toLocaleString('ar-SA')}`;
      populateSymbols(); render();
    }catch(err){ $('osDataState').textContent=`تعذر تحميل بيانات السوق: ${err.message}`; render(); }
  }

  $('osPositionForm').addEventListener('submit',(e)=>{
    e.preventDefault(); const symbol=$('osSymbol').value; const quantity=Number($('osQuantity').value); const avgCost=Number($('osAvgCost').value);
    if(!symbol||!finite(quantity)||quantity<=0||!finite(avgCost)||avgCost<=0) return;
    const existing=state.positions.find(p=>p.symbol===symbol);
    if(existing){ existing.quantity=quantity; existing.avgCost=avgCost; } else state.positions.push({symbol,quantity,avgCost,createdAt:new Date().toISOString()});
    savePositions(); e.target.reset(); populateSymbols(); render();
  });
  $('osExport').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),positions:state.positions},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='asiri-intelligence-os-portfolio.json';a.click();URL.revokeObjectURL(a.href);
  });
  loadPositions(); loadMarket();
})();