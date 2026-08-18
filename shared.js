/* ===================================================================
   DN Helper — 共用資料層
   三個頁面（角色資料 / 副本分團 / 深淵分隊）共用同一份名單。
   資料存在瀏覽器 localStorage，用「匯出 JSON」交給團長 commit 進 git。
   =================================================================== */

const DBKEY = 'dn_helper_v1';
const ELEMS = ['火','水','光','暗','無'];
const ROLES = ['輸出','補師','坦','輔助'];
// BUFF 分類：分團演算法用這些標籤判斷一團缺什麼
const BUFFTAGS = ['增傷','爆擊','破防','減抗','回血','護盾','復活','解控','加速'];

let storageOK = true;
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ storageOK=false; return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){ storageOK=false; } }
};

let uid = 1;
const nid = () => 'i' + (uid++);
const esc = s => String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

/* ---------------- 預設資料 ---------------- */
function defaultDB(){
  // C(角色名, 帶?, 主武+, 副武+, 防具+, 主武裝等, 副武裝等, 防具裝等)
  const C = (name,carry,me,se,ae,mt,st,at) => ({
    id:nid(), name, job:name, elem:'', carry, active:true,
    atk:0, crit:0, def:0, fd:0,
    mwTier:mt||'60A', mwEnh:me||0, swTier:st||'60A', swEnh:se||0, aTier:at||'60A', aEnh:ae||0
  });
  const P = (name,chars) => ({id:nid(), name, active:true, free:true, potion:1, chars});
  return {
    people:[
      P('雷電',[ C('護士',true), C('月光',true), C('光輝',false) ]),
      P('綠間',[ C('毀滅',true,9,9,7), C('聖徒',false) ]),
      P('梅林',[ C('時空',true,7,10,6) ]),
      P('地瓜',[ C('劍鬥',true,11,11,8), C('影舞',true,6,6,6,'60A','60A','60B') ]),
      P('黃賴',[ C('天弓',true), C('狂戰',true) ]),
    ],
    // 職業庫：BUFF / 屬性刻意留空，由你們自己填（我查不到 SEA 經典服的可靠來源，不編數字）
    jobs:['護士','月光','光輝','毀滅','聖徒','時空','劍鬥','影舞','天弓','狂戰']
           .map(n=>({name:n, base:'', elem:'', role:'', buffs:[], pct:0, note:''})),
    dungeons:[
      {key:'abp_h',   name:'大主教 地獄', size:4, req:0},
      {key:'giant_h', name:'巨人 地獄',   size:4, req:0},
      {key:'kim_n',   name:'颱風金 普通', size:4, req:0},
      {key:'kim_h',   name:'颱風金 地獄', size:4, req:0},
      {key:'sea',     name:'海龍',        size:8, req:0},
      {key:'green',   name:'綠龍',        size:8, req:0},
      {key:'desert',  name:'沙龍',        size:8, req:0},
    ],
    clears:{},   // { 週期起始日: { "charId|dungeonKey": true } }
    gear:{ tiers:[{k:'50S',v:100},{k:'50L',v:130},{k:'60B',v:170},{k:'60A',v:210},{k:'70A',v:260}],
           wPer:12, aPer:5 },
    cfg:{ mode:'save', teamSize:4, minCarry:2, autoFill:true, balance:true,
          resetDay:4, useFd:true, useCrit:false, sameElem:true }
  };
}

/* ---------------- 讀寫 ---------------- */
function normChar(c){
  return {
    id:nid(), name:String(c.name), job:c.job||c.name, elem:c.elem||'',
    carry:!!c.carry, active:c.active!==false,
    atk:+c.atk||0, crit:+c.crit||0, def:+c.def||0, fd:+c.fd||0,
    mwTier:c.mwTier||c.wTier||'60A', mwEnh:+(c.mwEnh??c.wEnh)||0,
    swTier:c.swTier||c.wTier||'60A', swEnh:+(c.swEnh??c.wEnh)||0,
    aTier:c.aTier||'60A',            aEnh:+c.aEnh||0
  };
}
function normPerson(p){
  p.id=nid(); p.active=p.active!==false; p.free=p.free!==false; p.potion=p.potion??1;
  p.chars=(p.chars||[]).map(normChar);
  return p;
}
function mergeDefaults(s){
  const d=defaultDB();
  s.people.forEach(normPerson);
  s.jobs     = Array.isArray(s.jobs)&&s.jobs.length ? s.jobs.map(j=>({
                 name:j.name, base:j.base||'', elem:j.elem||'', role:j.role||'',
                 buffs:Array.isArray(j.buffs)?j.buffs:[], pct:+j.pct||0, note:j.note||''})) : d.jobs;
  s.dungeons = Array.isArray(s.dungeons)&&s.dungeons.length ? s.dungeons : d.dungeons;
  s.clears   = s.clears && typeof s.clears==='object' ? s.clears : {};
  s.gear     = s.gear&&Array.isArray(s.gear.tiers)&&s.gear.tiers.length ? s.gear : d.gear;
  s.cfg      = Object.assign(d.cfg, s.cfg||{});
  return s;
}
function loadDB(){
  try{
    const s=JSON.parse(LS.get(DBKEY));
    if(s&&Array.isArray(s.people)&&s.people.length) return mergeDefaults(s);
  }catch(e){}
  // 從舊版深淵分隊器接過來，免得已經填好的裝備白填
  try{
    const old=JSON.parse(LS.get('dn_split_v3'));
    if(old&&Array.isArray(old.people)&&old.people.length){
      const d=defaultDB();
      return mergeDefaults({people:old.people, gear:old.gear, cfg:old.cfg,
                            jobs:d.jobs, dungeons:d.dungeons, clears:{}});
    }
  }catch(e){}
  return defaultDB();
}
let DB = loadDB();
const saveDB = () => { LS.set(DBKEY, JSON.stringify(DB)); POWCACHE=null; };

/* ---------------- 週期（本週打過沒） ---------------- */
// 伺服器每週固定一天重置，預設週四；可在角色資料頁改。
function weekStart(date, resetDay){
  const t = new Date(date||Date.now()); t.setHours(0,0,0,0);
  const back = (t.getDay() - (resetDay??DB.cfg.resetDay) + 7) % 7;
  t.setDate(t.getDate()-back);
  return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
}
const curWeek = () => weekStart();
function clearsOf(week){ const w=week||curWeek(); return DB.clears[w] || (DB.clears[w]={}); }
const ckey = (cid,dk) => cid+'|'+dk;
function isCleared(cid,dk,week){ return !!clearsOf(week)[ckey(cid,dk)]; }
function setCleared(cid,dk,v,week){
  const c=clearsOf(week);
  if(v) c[ckey(cid,dk)]=true; else delete c[ckey(cid,dk)];
  saveDB();
}
function resetWeek(week){ DB.clears[week||curWeek()]={}; saveDB(); }

/* ---------------- 戰力 ---------------- */
const tierVal = k => (DB.gear.tiers.find(t=>t.k===k)||{v:0}).v;
const estOf = c => !c ? 0 :
    tierVal(c.mwTier)+(+c.mwEnh||0)*DB.gear.wPer
  + tierVal(c.swTier)+(+c.swEnh||0)*DB.gear.wPer
  + tierVal(c.aTier) +(+c.aEnh ||0)*DB.gear.aPer;

let POWCACHE=null;
// 有填表攻就用表攻；沒填的用裝備推估，再依「已填表攻者的平均比例」換算到同一個尺度
function atkRatio(){
  if(POWCACHE!=null) return POWCACHE;
  let sum=0,n=0;
  DB.people.forEach(p=>p.chars.forEach(c=>{
    const e=estOf(c); if(c.atk>0&&e>0){ sum+=c.atk/e; n++; }
  }));
  return POWCACHE = n ? sum/n : 1;
}
const isEst = c => !(c&&c.atk>0);
const baseAtk = c => !c ? 0 : (c.atk>0 ? c.atk : Math.round(estOf(c)*atkRatio()));
// 戰力 = 表攻 ×(1+終傷%) ×(1+爆擊%)，後兩項可在設定裡開關
function powerOf(c){
  if(!c) return 0;
  let v = baseAtk(c);
  if(DB.cfg.useFd)   v *= 1 + (+c.fd||0)/100;
  if(DB.cfg.useCrit) v *= 1 + (+c.crit||0)/100;
  return Math.round(v);
}
function findChar(pid,cid){
  const p=DB.people.find(x=>x.id===pid);
  return p ? {p, c:p.chars.find(x=>x.id===cid)} : {p:null,c:null};
}
function allChars(onlyActive){
  const out=[];
  DB.people.forEach(p=>{ if(onlyActive&&!p.active) return;
    p.chars.forEach(c=>{ if(onlyActive&&!c.active) return; out.push({p,c}); }); });
  return out;
}
const jobOf  = c => DB.jobs.find(j=>j.name===(c.job||c.name)) || null;
const elemOf = c => c.elem || (jobOf(c)||{}).elem || '';
const roleOf = c => (jobOf(c)||{}).role || '';
const buffsOf= c => (jobOf(c)||{}).buffs || [];

/* ---------------- 匯出 / 匯入 ---------------- */
const packChar = c => ({name:c.name, job:c.job, elem:c.elem, carry:c.carry, active:c.active,
  atk:c.atk, crit:c.crit, def:c.def, fd:c.fd,
  mwTier:c.mwTier, mwEnh:c.mwEnh, swTier:c.swTier, swEnh:c.swEnh, aTier:c.aTier, aEnh:c.aEnh});
const packPerson = p => ({name:p.name, active:p.active, free:p.free, potion:p.potion,
  chars:p.chars.map(packChar)});

function exportJSON(){
  return JSON.stringify({people:DB.people.map(packPerson), jobs:DB.jobs,
    dungeons:DB.dungeons, clears:DB.clears, gear:DB.gear, cfg:DB.cfg}, null, 2);
}
function importJSON(txt){
  const s=JSON.parse(txt);
  if(!s||!Array.isArray(s.people)) throw new Error('格式不對');
  DB = mergeDefaults(s); saveDB(); return true;
}
// 只匯出「我自己」那一份，各自填完丟給團長合併
function exportMine(personName){
  const p=DB.people.find(x=>x.name===personName);
  return p ? JSON.stringify({people:[packPerson(p)]}, null, 2) : '';
}
// 合併某個人的資料（同名覆蓋，沒有就新增）
function mergePerson(txt){
  const s=JSON.parse(txt);
  const list = Array.isArray(s.people) ? s.people : [s];
  list.forEach(raw=>{
    const p=normPerson(JSON.parse(JSON.stringify(raw)));
    const i=DB.people.findIndex(x=>x.name===p.name);
    if(i>=0) DB.people[i]=p; else DB.people.push(p);
  });
  saveDB(); return list.length;
}

/* ---------------- 從 git 讀共用名單 ---------------- */
// 團長把 exportJSON() 存成 data/roster.json commit 進去。
// 用 http(s) 開（GitHub Pages）才讀得到；直接用 file:// 開會被 CORS 擋，屬正常。
async function fetchRepoRoster(){
  try{
    const r = await fetch('data/roster.json', {cache:'no-store'});
    return r.ok ? await r.text() : null;
  }catch(e){ return null; }
}

/* ---------------- 導覽列 ---------------- */
function navBar(active, subtitle){
  const pages=[['roster.html','角色資料'],['raid.html','副本分團'],['index.html','深淵分隊']];
  const links=pages.map(function(pg){
    return '<a href="'+pg[0]+'" class="'+(pg[0]===active?'on':'')+'">'+pg[1]+'</a>';
  }).join('');
  return '<header><h1>DN Helper</h1><nav>'+links+'</nav>'
       + '<span class="sub">'+esc(subtitle||'')+'</span></header>';
}
