/* ===================================================================
   DN Helper — 共用資料層
   三個頁面（角色資料 / 副本分團 / 深淵分隊）共用同一份名單。
   資料存在瀏覽器 localStorage，用「匯出 JSON」交給團長 commit 進 git。
   =================================================================== */

const DBKEY = 'dn_helper_v1';
const ELEMS = ['火','水','光','暗','無'];
const ROLES = ['輸出','補師','坦','輔助'];
// 定位是靠職業名認的，不是靠職業庫填 —— 這幾個是硬規則，填錯也不會跑掉
const HEALER_JOBS = ['護士','光輝','聖徒'];
const TANK_JOBS   = ['毀滅','聖騎'];
// 補師的實際輸出大約是同裝輸出的幾成（團長給的實測值），只影響顯示，不影響分團
const DPS_COEF = {'護士':0.75, '光輝':0.40, '聖徒':0.25};
// BUFF 分類：分團演算法用這些標籤判斷一團缺什麼。
// 前五個是「有數值」的增益，每個職業給的百分比都不一樣，各自記各自的；
// 後面那些是有沒有的問題，不填數值。
const BUFF_NUM  = ['增傷','降抗','降爆抗','增加屬攻','增加物攻'];
const BUFF_FLAG = ['爆擊','破防','回血','護盾','復活','解控','加速'];
const BUFFTAGS  = BUFF_NUM.concat(BUFF_FLAG);
const isNumBuff = k => BUFF_NUM.indexOf(k)>=0;

/* BUFF 一律存成 [{k:標籤, v:百分比}]。舊資料是純字串陣列，v 補 0。 */
function normBuffs(list, legacyPct){
  const out=(Array.isArray(list)?list:[]).map(b=>
    typeof b==='string' ? {k:b.trim(), v:0} : {k:String(b.k||'').trim(), v:+b.v||0}
  ).filter(b=>b.k);
  // 舊版只有一個總增傷%，掛到「增傷」那格上，沒有的話就補一筆
  const lp=+legacyPct||0;
  if(lp>0){
    const hit=out.find(b=>b.k==='增傷');
    if(hit){ if(!hit.v) hit.v=lp; }
    else out.push({k:'增傷', v:lp});
  }
  return out;
}
const buffKeys   = list => (list||[]).map(b=>b.k);
// 各類別各自加總，不同類別不互相混，因為它們在傷害上的作用不一樣
function buffTotals(list){
  const t={};
  (list||[]).forEach(b=>{ if(isNumBuff(b.k)) t[b.k]=(t[b.k]||0)+(+b.v||0); });
  return t;
}
const buffText = list => (list||[]).map(b=>isNumBuff(b.k)&&b.v ? b.k+':'+b.v : b.k).join(',');
function parseBuffs(txt){
  return String(txt||'').split(/[,、]+/).map(x=>x.trim()).filter(Boolean).map(function(x){
    const m=x.match(/^(.+?)\s*[:：=]\s*(-?[\d.]+)\s*[%％]?$/);
    return m ? {k:m[1].trim(), v:+m[2]||0} : {k:x.replace(/[%％]$/,'').trim(), v:0};
  }).filter(b=>b.k);
}

let storageOK = true;
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ storageOK=false; return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){ storageOK=false; } }
};

let uid = 1;
const nid = () => 'i' + (uid++);
const esc = s => String(s??'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

const defRole = n => HEALER_JOBS.indexOf(n)>=0 ? '補師'
                    : TANK_JOBS.indexOf(n)>=0   ? '坦' : '輸出';

/* ---------------- 預設資料 ---------------- */
function defaultDB(){
  // C(角色名, 帶?, 主武+, 副武+, 防具+, 主武裝等, 副武裝等, 防具裝等)
  const C = (name,carry,me,se,ae,mt,st,at) => ({
    id:nid(), name, job:name, elem:'', carry, active:true,
    atk:0, crit:0, def:0, fd:0, ea:0,
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
    jobs:['護士','月光','光輝','毀滅','聖徒','聖騎','時空','劍鬥','影舞','天弓','狂戰']
           .map(n=>({name:n, base:'', elem:'', role:defRole(n), buffs:[],
                     dps:DPS_COEF[n]??1, note:''})),
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
          resetDay:4, useFd:true, useCrit:true, sameElem:true,
          critDmg:200, needHealer:true, needTank:true },
    meta:{ t:0 }
  };
}

/* ---------------- 讀寫 ---------------- */
function normChar(c){
  return {
    id:nid(), name:String(c.name), job:c.job||c.name, elem:c.elem||'',
    carry:!!c.carry, active:c.active!==false,
    atk:+c.atk||0, crit:+c.crit||0, def:+c.def||0, fd:+c.fd||0, ea:+c.ea||0,
    mwTier:c.mwTier||c.wTier||'60A', mwEnh:+(c.mwEnh??c.wEnh)||0,
    swTier:c.swTier||c.wTier||'60A', swEnh:+(c.swEnh??c.wEnh)||0,
    aTier:c.aTier||'60A',            aEnh:+c.aEnh||0
  };
}
function normPerson(p){
  p.id=nid(); p.active=p.active!==false; p.free=p.free!==false; p.potion=p.potion??1;
  p.t=+p.t||0;
  p.chars=(p.chars||[]).map(normChar);
  return p;
}
function mergeDefaults(s){
  const d=defaultDB();
  s.people.forEach(normPerson);
  s.jobs     = Array.isArray(s.jobs)&&s.jobs.length ? s.jobs.map(j=>({
                 name:j.name, base:j.base||'', elem:j.elem||'', role:j.role||defRole(j.name),
                 buffs:normBuffs(j.buffs, j.pct),
                 dps:j.dps==null ? (DPS_COEF[j.name]??1) : (+j.dps||0), note:j.note||''})) : d.jobs;
  // 預設職業庫新增過的職業（例如聖騎）要補進舊存檔，不然選單裡選不到
  d.jobs.forEach(dj=>{ if(!s.jobs.some(j=>j.name===dj.name)) s.jobs.push(dj); });
  s.dungeons = Array.isArray(s.dungeons)&&s.dungeons.length ? s.dungeons : d.dungeons;
  s.clears   = s.clears && typeof s.clears==='object' ? s.clears : {};
  s.gear     = s.gear&&Array.isArray(s.gear.tiers)&&s.gear.tiers.length ? s.gear : d.gear;
  s.cfg      = Object.assign(d.cfg, s.cfg||{});
  s.meta     = s.meta && typeof s.meta==='object' ? s.meta : {t:0};
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
// saveDB(person) —— 有帶成員時順便蓋上時間戳，多人合併時才知道誰改得比較晚。
// 改到職業庫／副本／裝等／設定這種全域資料時要另外呼叫 touchMeta()。
function saveDB(person){
  if(person) touchPerson(person);
  DB.meta = DB.meta||{t:0};
  LS.set(DBKEY, JSON.stringify(DB));
  POWCACHE=null;
  if(typeof Sync!=='undefined' && Sync.markDirty) Sync.markDirty();
}
function touchMeta(){ DB.meta={t:nowMs()}; }

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
// 每一格存 {v:有沒有打, t:改的時間}。存時間是為了多人同時改時能正確合併：
// 同一格以「比較晚改的那次」為準，取消打勾才不會被別人的舊資料復活。
function cellOf(week,cid,dk){
  const e=clearsOf(week)[ckey(cid,dk)];
  if(e===undefined) return null;
  if(typeof e==='boolean') return {v:e,t:0};      // 舊格式
  return e;
}
function isCleared(cid,dk,week){ const e=cellOf(week,cid,dk); return !!(e&&e.v); }
function setCleared(cid,dk,v,week){
  clearsOf(week)[ckey(cid,dk)]={v:!!v, t:Date.now()};
  saveDB();
}
function resetWeek(week){
  const c=clearsOf(week), now=Date.now();
  Object.keys(c).forEach(k=>{ c[k]={v:false,t:now}; });
  saveDB();
}

/* ---------------- 多人合併 ---------------- */
// 成員：同名比 t，晚改的贏。職業庫/副本/裝等/設定：整份比 meta.t。
// 通關格子：逐格比 t。這樣兩個人同時在改也不會互相蓋掉。
const nowMs = () => Date.now();
function touchPerson(p){ if(p) p.t = nowMs(); }
function mergeDB(remote, local){
  const R=mergeDefaults(JSON.parse(JSON.stringify(remote)));
  const out=JSON.parse(JSON.stringify(local));

  // 成員
  const byName={};
  out.people.forEach(p=>byName[p.name]=p);
  R.people.forEach(function(rp){
    const lp=byName[rp.name];
    if(!lp){ out.people.push(rp); return; }
    if((rp.t||0) > (lp.t||0)) out.people[out.people.indexOf(lp)]=rp;
  });

  // 職業庫 / 副本 / 裝等 / 設定：整份取比較新的
  const rt=(remote.meta&&remote.meta.t)||0, lt=(local.meta&&local.meta.t)||0;
  if(rt>lt){ out.jobs=R.jobs; out.dungeons=R.dungeons; out.gear=R.gear; out.cfg=R.cfg;
             out.meta={t:rt}; }

  // 通關紀錄：逐格取比較新的
  out.clears=out.clears||{};
  Object.keys(R.clears||{}).forEach(function(w){
    out.clears[w]=out.clears[w]||{};
    Object.keys(R.clears[w]).forEach(function(k){
      const re=R.clears[w][k], le=out.clears[w][k];
      const rT=(typeof re==='boolean')?0:(re.t||0);
      const lT=(le===undefined)?-1:((typeof le==='boolean')?0:(le.t||0));
      if(rT>lT) out.clears[w][k]=(typeof re==='boolean')?{v:re,t:0}:re;
    });
  });
  return out;
}

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
// 戰力 = 表攻 ×(1+終傷%) ×(1+屬攻%) ×(1 + 爆擊率% × (爆傷%-100)/100)
// 屬攻跟終傷一樣是乘的。爆傷目前 200%，70 等版本改成 300% 時只要改設定值。
function powerOf(c){
  if(!c) return 0;
  let v = baseAtk(c);
  if(DB.cfg.useFd) v *= 1 + (+c.fd||0)/100;
  v *= 1 + (+c.ea||0)/100;
  if(DB.cfg.useCrit) v *= 1 + (+c.crit||0)/100 * (((+DB.cfg.critDmg||200)-100)/100);
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

/* ---- 定位 ----
   職業名是硬規則，職業庫只有在它沒被硬規則涵蓋時才有話語權。
   分團時補師和坦「不算輸出戰力」，只算這團有沒有這個位子 —— 三種角色
   的攻擊力用同一條公式算（顯示用），但團隊戰力平均只看輸出。          */
function roleKind(c){
  if(!c) return '輸出';
  const n = c.job||c.name;
  if(HEALER_JOBS.indexOf(n)>=0) return '補師';
  if(TANK_JOBS.indexOf(n)>=0)   return '坦';
  const r = roleOf(c);
  return (r==='補師'||r==='坦') ? r : '輸出';
}
const isHealer = c => roleKind(c)==='補師';
const isTank   = c => roleKind(c)==='坦';
const isDps    = c => roleKind(c)==='輸出';
// 分團平衡只吃這個：補師和坦一律 0，不會把團隊戰力灌胖
const dpsPowerOf = c => isDps(c) ? powerOf(c) : 0;
// 等效輸出：補師實際打得出來的量，只給人看，不進分團計算
const effPowerOf = c => Math.round(powerOf(c) * (isDps(c) ? 1 : ((jobOf(c)||{}).dps ?? 1)));

/* ---------------- 匯出 / 匯入 ---------------- */
const packChar = c => ({name:c.name, job:c.job, elem:c.elem, carry:c.carry, active:c.active,
  atk:c.atk, crit:c.crit, def:c.def, fd:c.fd, ea:c.ea,
  mwTier:c.mwTier, mwEnh:c.mwEnh, swTier:c.swTier, swEnh:c.swEnh, aTier:c.aTier, aEnh:c.aEnh});
const packPerson = p => ({name:p.name, active:p.active, free:p.free, potion:p.potion,
  t:p.t||0, chars:p.chars.map(packChar)});

function exportJSON(){
  return JSON.stringify({people:DB.people.map(packPerson), jobs:DB.jobs,
    dungeons:DB.dungeons, clears:DB.clears, gear:DB.gear, cfg:DB.cfg,
    meta:DB.meta||{t:0}}, null, 2);
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

/* ===================================================================
   GitHub 同步：直接讀寫 repo 裡的 data/state.json
   靜態網頁沒有後端，所以用 GitHub 的 API 當儲存空間。
   讀取：public repo 不用權杖也讀得到。
   寫入：需要一組你自己產的 fine-grained token（只存在你這台電腦的
        localStorage，不會被 commit、也不會傳給任何第三方）。
   =================================================================== */
const Sync = (function(){
  const TOKKEY='dn_helper_gh_token', TEAMKEY='dn_helper_team_key', CFGKEY='dn_helper_gh_cfg';
  const state={ sha:null, dirty:false, busy:false, last:null, msg:'', timer:null, poll:null };
  const listeners=[];

  // 有填中繼網址就走中繼（隊友不用權杖）；沒填就直連 GitHub（要自己的權杖）
  function cfg(){
    let c=null;
    try{ c=JSON.parse(LS.get(CFGKEY)); }catch(e){}
    const m=/^([^.]+)\.github\.io$/.exec(location.hostname);
    const seg=location.pathname.split('/').filter(Boolean);
    return Object.assign({ relay:'', owner:m?m[1]:'', repo:m?(seg[0]||''):'',
                           branch:'main', path:'data/state.json', auto:true }, c||{});
  }
  function setCfg(c){ LS.set(CFGKEY, JSON.stringify(c)); }
  const token      = () => LS.get(TOKKEY) || '';
  const setToken   = t => LS.set(TOKKEY, t||'');
  const teamKey    = () => LS.get(TEAMKEY) || '';
  const setTeamKey = k => LS.set(TEAMKEY, k||'');
  const viaRelay   = () => !!cfg().relay;
  const ready      = () => { const c=cfg(); return c.relay ? true : !!(c.owner&&c.repo); };
  // 中繼模式下人人都能寫；直連模式要有自己的權杖
  const canWrite   = () => viaRelay() || !!token();

  function b64enc(str){
    const bytes=new TextEncoder().encode(str);
    let bin=''; bytes.forEach(b=>{ bin+=String.fromCharCode(b); });
    return btoa(bin);
  }
  function b64dec(b64){
    const bin=atob(String(b64).replace(/\s/g,''));
    return new TextDecoder().decode(Uint8Array.from(bin, ch=>ch.charCodeAt(0)));
  }
  const relayURL = () => cfg().relay.replace(/\/+$/,'') + '/state';
  function ghURL(){
    const c=cfg();
    return 'https://api.github.com/repos/'+c.owner+'/'+c.repo+'/contents/'+c.path;
  }
  function relayHeaders(){
    const h={};
    if(teamKey()) h['X-Team-Key']=teamKey();
    return h;
  }
  function ghHeaders(){
    const h={'Accept':'application/vnd.github+json'};
    if(token()) h['Authorization']='Bearer '+token();
    return h;
  }
  function emit(msg){ state.msg=msg; listeners.forEach(f=>{ try{ f(status()); }catch(e){} }); }
  function status(){
    return { ok:ready(), relay:viaRelay(), canWrite:canWrite(), hasToken:!!token(),
             dirty:state.dirty, busy:state.busy, last:state.last, msg:state.msg, cfg:cfg() };
  }
  function onChange(f){ listeners.push(f); f(status()); }

  // 讀遠端；回傳 {obj, sha}
  async function fetchRemote(){
    if(!ready()) return null;
    let content, sha;
    if(viaRelay()){
      const r=await fetch(relayURL()+'?t='+Date.now(), {headers:relayHeaders(), cache:'no-store'});
      if(!r.ok){
        const e=await r.json().catch(()=>({}));
        throw new Error(r.status===401 ? '團隊密碼不對' : ('中繼讀取失敗 '+r.status+' '+(e.error||'')));
      }
      const j=await r.json();
      if(!j.content) return {obj:null, sha:null};
      content=j.content; sha=j.sha;
    }else{
      const c=cfg();
      const r=await fetch(ghURL()+'?ref='+encodeURIComponent(c.branch)+'&t='+Date.now(),
                          {headers:ghHeaders(), cache:'no-store'});
      if(r.status===404) return {obj:null, sha:null};
      if(!r.ok) throw new Error('讀取失敗 HTTP '+r.status+(r.status===403?'（未登入的請求次數上限，設中繼或填權杖就會提高）':''));
      const j=await r.json();
      content=j.content; sha=j.sha;
    }
    return { obj:JSON.parse(b64dec(content)), sha:sha };
  }

  // 拉下來合併進本機
  async function pull(silent){
    if(!ready()) return false;
    state.busy=true; emit('讀取中…');
    try{
      const got=await fetchRemote();
      state.sha = got ? got.sha : null;
      if(got&&got.obj){
        DB = mergeDB(got.obj, DB);
        LS.set(DBKEY, JSON.stringify(DB)); POWCACHE=null;
      }
      state.last=new Date(); state.busy=false;
      emit(got&&got.obj ? '已同步 '+state.last.toLocaleTimeString() : '雲端還沒有存檔');
      return true;
    }catch(e){ state.busy=false; emit('讀取失敗：'+e.message); if(!silent) throw e; return false; }
  }

  // 推上去：先拉最新合併再寫，避免蓋掉別人剛改的
  async function push(){
    if(!ready())    throw new Error('還沒設定同步（中繼網址或 repo）');
    if(!canWrite()) throw new Error('直連模式要填自己的 GitHub 權杖才能上傳；改用中繼網址就不用');
    state.busy=true; emit('上傳中…');
    try{
      const got=await fetchRemote();
      if(got&&got.obj) DB = mergeDB(got.obj, DB);
      state.sha = got ? got.sha : null;
      const payload={ message:'更新分團進度 '+new Date().toLocaleString('zh-TW'),
                      content:b64enc(exportJSON()) };
      if(state.sha) payload.sha=state.sha;
      let r;
      if(viaRelay()){
        r=await fetch(relayURL(), {method:'PUT',
          headers:Object.assign({'Content-Type':'application/json'}, relayHeaders()),
          body:JSON.stringify(payload)});
      }else{
        payload.branch=cfg().branch;
        r=await fetch(ghURL(), {method:'PUT',
          headers:Object.assign({'Content-Type':'application/json'}, ghHeaders()),
          body:JSON.stringify(payload)});
      }
      if(!r.ok){
        const t=await r.text();
        let hint='';
        if(r.status===401) hint=viaRelay()?'（團隊密碼不對）':'（權杖無效）';
        if(r.status===403) hint='（權杖沒有 Contents 寫入權限）';
        if(r.status===409) hint='（別人同時在寫，再按一次上傳就好）';
        throw new Error('HTTP '+r.status+hint+' '+t.slice(0,120));
      }
      const j=await r.json();
      state.sha=(j.sha)||(j.content&&j.content.sha)||null;
      state.dirty=false; state.last=new Date(); state.busy=false;
      LS.set(DBKEY, JSON.stringify(DB));
      emit('已上傳 '+state.last.toLocaleTimeString());
      return true;
    }catch(e){ state.busy=false; emit('上傳失敗：'+e.message); throw e; }
  }

  function markDirty(){
    state.dirty=true; emit(state.msg);
    if(!cfg().auto || !canWrite() || !ready()) return;
    clearTimeout(state.timer);
    state.timer=setTimeout(()=>{ push().catch(()=>{}); }, 10000);  // 停手 10 秒才上傳，連續改動合併成一次 commit
  }
  function startPolling(sec){
    clearInterval(state.poll);
    state.poll=setInterval(()=>{ if(!state.busy&&!state.dirty) pull(true).then(r=>{ if(r&&window.onSynced) window.onSynced(); }); },
                           (sec||90)*1000);
  }
  return {cfg,setCfg,token,setToken,teamKey,setTeamKey,viaRelay,canWrite,
          ready,pull,push,markDirty,status,onChange,startPolling};
})();

/* ---------------- 導覽列 ---------------- */
function navBar(active, subtitle){
  const pages=[['roster.html','角色資料'],['raid.html','副本分團'],['index.html','深淵分隊']];
  const links=pages.map(function(pg){
    return '<a href="'+pg[0]+'" class="'+(pg[0]===active?'on':'')+'">'+pg[1]+'</a>';
  }).join('');
  return '<header><h1>DN Helper</h1><nav>'+links+'</nav>'
       + '<span class="sub">'+esc(subtitle||'')+'</span></header>';
}

/* ---------------- 雲端存檔面板（三頁共用） ---------------- */
function syncPanelHTML(){
  const c=Sync.cfg();
  return '<div class="panel" id="syncPanel">'
   + '<div class="row">'
   +   '<b>雲端存檔</b><span id="syncMsg" class="hint">—</span>'
   +   '<span id="syncDot" class="tag">未設定</span>'
   +   '<button onclick="Sync.push().then(afterSync).catch(e=>alert(e.message))">上傳我的更新</button>'
   +   '<button onclick="Sync.pull().then(afterSync).catch(e=>alert(e.message))">下載最新進度</button>'
   +   '<label><input type="checkbox" id="syncAuto"> 自動同步</label>'
   + '</div>'
   + '<details><summary>連線設定（第一次用要設，每台電腦各設一次）</summary>'
   +   '<div class="row" style="margin-top:10px">'
   +     '<label><b>中繼網址</b></label>'
   +     '<input type="text" id="ghRelay" style="width:330px" placeholder="https://dn-helper-relay.xxx.workers.dev" value="'+esc(c.relay)+'">'
   +     '<label>團隊密碼</label>'
   +     '<input type="password" id="ghTeamKey" style="width:170px" placeholder="團長給的那組">'
   +   '</div>'
   +   '<p class="hint" style="margin:6px 0 0"><b>一般隊友只要填這兩格就好</b>，不需要 GitHub 帳號也不需要權杖。</p>'
   +   '<details style="margin-top:12px"><summary>沒有中繼、要直連 GitHub 的話（需要自己的權杖）</summary>'
   +     '<div class="row" style="margin-top:8px">'
   +       '<label>帳號</label><input type="text" id="ghOwner" style="width:140px" value="'+esc(c.owner)+'">'
   +       '<label>repo</label><input type="text" id="ghRepo" style="width:140px" value="'+esc(c.repo)+'">'
   +       '<label>分支</label><input type="text" id="ghBranch" style="width:80px" value="'+esc(c.branch)+'">'
   +       '<label>檔案</label><input type="text" id="ghPath" style="width:160px" value="'+esc(c.path)+'">'
   +     '</div>'
   +     '<div class="row" style="margin-top:8px">'
   +       '<label>寫入權杖</label>'
   +       '<input type="password" id="ghToken" style="width:320px" placeholder="github_pat_… 只存在這台電腦">'
   +     '</div>'
   +     '<p class="hint" style="margin:8px 0 0">到 '
   +       '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained tokens</a>'
   +       ' 產一組：Repository access 只選這個 repo、Permissions 開 <b>Contents: Read and write</b>。'
   +       '權杖只存在你這台電腦，不會被 commit。有中繼的話就不需要這個。</p>'
   +   '</details>'
   +   '<div class="row" style="margin-top:12px">'
   +     '<button onclick="saveSyncCfg()">儲存設定</button>'
   +     '<button onclick="clearSecrets()">清掉這台電腦存的密碼／權杖</button>'
   +   '</div>'
   + '</details></div>';
}
function mountSync(onUpdate){
  const host=document.getElementById('sync');
  if(!host) return;
  host.innerHTML=syncPanelHTML();
  document.getElementById('syncAuto').checked = Sync.cfg().auto!==false;
  document.getElementById('syncAuto').addEventListener('change', function(e){
    const c=Sync.cfg(); c.auto=e.target.checked; Sync.setCfg(c);
  });
  window.afterSync = function(){ if(onUpdate) onUpdate(); };
  window.saveSyncCfg = function(){
    const c=Sync.cfg();
    const g=id=>{ const el=document.getElementById(id); return el?el.value.trim():''; };
    c.relay  = g('ghRelay').replace(/\/+$/,'');
    c.owner  = g('ghOwner');
    c.repo   = g('ghRepo');
    c.branch = g('ghBranch')||'main';
    c.path   = g('ghPath')||'data/state.json';
    Sync.setCfg(c);
    const tk=g('ghToken'); if(tk) Sync.setToken(tk);
    const kk=g('ghTeamKey'); if(kk) Sync.setTeamKey(kk);
    ['ghToken','ghTeamKey'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    alert('設定已儲存');
    Sync.pull().then(()=>{ if(onUpdate) onUpdate(); }).catch(e=>alert(e.message));
  };
  window.clearSecrets = function(){
    Sync.setToken(''); Sync.setTeamKey('');
    alert('已從這台電腦清除');
  };
  Sync.onChange(function(st){
    const dot=document.getElementById('syncDot'), msg=document.getElementById('syncMsg');
    if(!dot||!msg) return;
    msg.textContent=st.msg||'—';
    if(!st.ok){ dot.textContent='未設定'; dot.className='tag t-late'; }
    else if(st.busy){ dot.textContent='同步中'; dot.className='tag t-late'; }
    else if(st.dirty){ dot.textContent='有未上傳的改動'; dot.className='tag t-carry'; }
    else if(!st.canWrite){ dot.textContent='唯讀'; dot.className='tag t-leech'; }
    else { dot.textContent='已同步'+(st.relay?'（中繼）':''); dot.className='tag t-done'; }
  });
  if(Sync.ready()){
    Sync.pull(true).then(function(){ if(onUpdate) onUpdate(); });
    // 未登入的 GitHub API 只有 60 次/小時（整個 IP 共用），所以沒權杖時放慢輪詢；
    // 有權杖是 5000 次/小時，可以拉快讓大家更即時看到彼此的進度。
    Sync.startPolling(Sync.status().canWrite ? 60 : 240);
    window.onSynced=function(){ if(onUpdate) onUpdate(); };
  }
}
