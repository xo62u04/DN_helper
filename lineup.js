/* ===================================================================
   DN Helper — 分團引擎
   純邏輯，不碰畫面。raid.html 和 board.html 共用同一份，
   免得兩頁各有一份、對同一份編組存檔做出不一樣的行為。
   依賴 shared.js（DB / allChars / isCleared / powerOf …）
   =================================================================== */

const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;};

// pending: [{p,c}]，size: 4 或 8
// 規則：同一團不能有同一個人的兩隻角色；盡量同屬性同團；各團戰力盡量平均
function buildTeams(pending, size){
  if(!pending.length) return [];
  const byPerson={};
  pending.forEach(function(r){ (byPerson[r.p.id]=byPerson[r.p.id]||{p:r.p,list:[]}).list.push(r.c); });
  const people=Object.keys(byPerson).map(k=>byPerson[k]);
  const cap=Math.min(size,people.length);                 // 一團最多塞得下幾個「自己人」
  const R=Math.max(Math.ceil(pending.length/cap), Math.max.apply(null,people.map(x=>x.list.length)));

  let best=null;
  for(let it=0; it<800; it++){
    const rounds=Array.from({length:R},()=>({slots:[],pids:new Set()}));
    const order=shuffle(people.slice()).sort((a,b)=>b.list.length-a.list.length);
    order.forEach(function(x){
      const cs=shuffle(x.list.slice());
      // 集中裝填：優先把前面的團塞滿，這樣才會出現「我們 5 個人 + 補 3 個」的團，
      // 而不是每團都缺一半人。總外援人數一樣，但缺人的團會集中在後面。
      const pick=shuffle(rounds.map((_,i)=>i))
        .sort((a,b)=>(rounds[b].slots.length-rounds[a].slots.length) || (a-b))
        .filter(i=>rounds[i].slots.length<cap)
        .slice(0,cs.length);
      cs.forEach((c,k)=>{ const r=rounds[pick[k]]; if(!r) return; r.slots.push({p:x.p,c:c}); r.pids.add(x.p.id); });
    });
    const sc=scoreTeams(rounds,size);
    if(!best||sc<best.sc) best={rounds,sc};
  }
  return best.rounds.map(r=>r.slots);
}
// 補師和坦是稀缺的，能分散就不要擠在同一團。
// 罰則只罰「明明夠分卻擠在一起」——補師總數少於團數時，後面的團本來就註定沒補，不罰。
function coverGap(rounds, pred){
  const total = rounds.reduce((n,r)=>n+r.slots.filter(s=>pred(s.c)).length, 0);
  const covered = rounds.filter(r=>r.slots.some(s=>pred(s.c))).length;
  return Math.max(0, Math.min(total, rounds.length) - covered);
}
function scoreTeams(rounds,size){
  const avgs=[]; let mix=0, spread=0;
  rounds.forEach(function(r){
    const els={}; let has=0;
    r.slots.forEach(function(s){ const e=elemOf(s.c); if(e){ els[e]=1; has++; } });
    if(DB.cfg.sameElem&&has) mix += Object.keys(els).length-1;
    // 團隊戰力用等效輸出：補師和坦照職業係數折算後算進來，
    // 不會用純表攻把平均灌胖，也不會整個不算
    avgs.push(r.slots.length ? r.slots.reduce((n,s)=>n+effPowerOf(s.c),0)/r.slots.length : 0);
  });
  const mean=avgs.reduce((a,b)=>a+b,0)/(avgs.length||1);
  spread = (avgs.length>1&&mean>0) ? (Math.max.apply(null,avgs)-Math.min.apply(null,avgs))/mean : 0;
  const healGap = DB.cfg.needHealer!==false ? coverGap(rounds, isHealer) : 0;
  const tankGap = DB.cfg.needTank  !==false ? coverGap(rounds, isTank)   : 0;
  // 每團一補一坦 > 團數少 > 屬性一致 > 戰力平均
  return healGap*5000 + tankGap*5000 + mix*1000 + spread*300
       + rounds.reduce((n,r)=>n+Math.max(0,size-r.slots.length),0);
}

/* ---- 這團的隊伍增益合計：各類別各自加總，不同類別不相加 ---- */

const LINEUP_KEY='dn_helper_lineup_v3';
const lineupCache={};        // key = 'sz'+人數：同人數的副本共用同一份編組

// 團的組合跨副本一致（4 人本一套、8 人本一套），
// 不然同一批人每本副本換一次隊友，實際上沒辦法打。
const lkey = size => 'sz'+size;
function lineupKeyOf(dk){
  const d=DB.dungeons.find(x=>x.key===dk);
  return d ? lkey(d.size) : dk;
}
// 拿編組陣列：副本 key 或 'szN' 都通
function lineupOf(dk){ return lineupCache[lineupKeyOf(dk)] || []; }

// 這個人數的副本裡，這隻角色還有沒有沒打完的
function needsSize(c, size){
  return DB.dungeons.filter(d=>d.size===size).some(d=>!isCleared(c.id, d.key));
}
function eligible(size){ return allChars(true).filter(r=>needsSize(r.c, size)); }

// 名單指紋只看「有哪些人」，不看打勾狀態 ——
// 打個勾就整個重排的話，編組又變成換來換去了
function rosterSig(size){
  return size+'|'+allChars(true).map(r=>r.p.id+'/'+r.c.id).sort().join(',');
}
function loadLineups(){
  try{ return JSON.parse(LS.get(LINEUP_KEY))||{}; }catch(e){ return {}; }
}
function saveLineups(o){ LS.set(LINEUP_KEY, JSON.stringify(o)); }

// 把存下來的 {pid,cid} 還原成 {p,c}，找不到的人（已刪除）直接跳過
function hydrate(saved){
  return saved.map(function(team){
    return team.map(function(ref){
      const p=DB.people.find(x=>x.id===ref.pid);
      const c=p&&p.chars.find(x=>x.id===ref.cid);
      return (p&&c&&p.active&&c.active) ? {p:p,c:c} : null;
    }).filter(Boolean);
  }).filter(t=>t.length);
}
function persistLineup(dkOrKey){
  const key = /^sz\d+$/.test(String(dkOrKey)) ? dkOrKey : lineupKeyOf(dkOrKey);
  const size = +String(key).slice(2)||0;
  const store=loadLineups();
  store[key]={sig:rosterSig(size),
              teams:(lineupCache[key]||[]).map(t=>t.map(s=>({pid:s.p.id, cid:s.c.id})))};
  saveLineups(store);
}
function lineupFor(dk, size, force){
  const key=lkey(size);
  if(force || !lineupCache[key]){
    const sig=rosterSig(size);
    const store=loadLineups();
    let teams=null;
    if(!force && store[key] && store[key].sig===sig){
      const t=hydrate(store[key].teams);
      if(t.length) teams=t;
    }
    if(!teams){
      const pool=eligible(size);
      teams=buildTeams(pool.length?pool:allChars(true), size);
    }
    lineupCache[key]=teams;
    persistLineup(key);
  }
  return lineupCache[key];
}
// 同步拉下來會換掉整份 DB，編組快取裡的舊物件要跟著丟掉重建，
// 不然 charLabel 對不到人會顯示成「毀滅(0)」這種鬼東西
function dropLineupCache(){
  Object.keys(lineupCache).forEach(k=>delete lineupCache[k]);
}
function regenLineups(){
  dropLineupCache();
  saveLineups({});
}

// 同一個人的兩隻角色不能在同一團
function clashes(team, s, skipIdx){
  return team.some((x,k)=>k!==skipIdx && x.p.id===s.p.id);
}
const capOf = size => size;
