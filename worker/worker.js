/* ===================================================================
   DN Helper — Cloudflare Worker 中繼
   隊友的瀏覽器不放 GitHub 權杖，改成打這支 Worker，由它代為讀寫
   repo 裡的 data/state.json。權杖只存在 Worker 的 secret 裡。

   部署方式看 worker/README.md
   =================================================================== */

function corsOf(req, env){
  const allow = env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': (allow === '*') ? '*' : (origin === allow ? origin : allow),
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Team-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(obj, status, cors){
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({}, cors, {'Content-Type':'application/json; charset=utf-8'})
  });
}

export default {
  async fetch(req, env){
    const cors = corsOf(req, env);
    if(req.method === 'OPTIONS') return new Response(null, {headers: cors});

    const url = new URL(req.url);
    if(url.pathname === '/' || url.pathname === '')
      return new Response('DN Helper relay OK', {headers: Object.assign({}, cors, {'Content-Type':'text/plain; charset=utf-8'})});
    if(url.pathname !== '/state')
      return json({error:'沒有這個路徑，只有 /state'}, 404, cors);

    if(!env.GITHUB_TOKEN) return json({error:'Worker 還沒設 GITHUB_TOKEN'}, 500, cors);
    if(!env.REPO)         return json({error:'Worker 還沒設 REPO'}, 500, cors);

    // 有設團隊密碼就要驗；沒設就是誰知道網址誰都能寫
    if(env.TEAM_KEY && req.headers.get('X-Team-Key') !== env.TEAM_KEY)
      return json({error:'團隊密碼不對'}, 401, cors);

    const path   = env.FILE_PATH || 'data/state.json';
    const branch = env.BRANCH || 'main';
    const api    = 'https://api.github.com/repos/' + env.REPO + '/contents/' + path;
    const ghHead = {
      'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'dn-helper-relay'          // GitHub API 一定要帶 UA，不帶會被擋
    };

    try{
      if(req.method === 'GET'){
        const r = await fetch(api + '?ref=' + encodeURIComponent(branch) + '&t=' + Date.now(),
                              {headers: ghHead});
        if(r.status === 404) return json({content:null, sha:null}, 200, cors);
        if(!r.ok) return json({error:'GitHub 讀取失敗 ' + r.status}, 502, cors);
        const j = await r.json();
        return json({content:j.content, sha:j.sha}, 200, cors);
      }

      if(req.method === 'PUT'){
        const body = await req.json();
        if(!body || !body.content) return json({error:'沒有 content'}, 400, cors);
        const payload = {
          message: body.message || ('更新分團進度 ' + new Date().toISOString()),
          content: body.content,
          branch: branch
        };
        if(body.sha) payload.sha = body.sha;          // 沒有 sha 代表是第一次建檔
        const r = await fetch(api, {method:'PUT',
          headers: Object.assign({}, ghHead, {'Content-Type':'application/json'}),
          body: JSON.stringify(payload)});
        const txt = await r.text();
        if(!r.ok){
          // 409 = 別人剛好也在寫，前端會重抓再試
          return json({error:'GitHub 寫入失敗 ' + r.status, detail: txt.slice(0,200)},
                      r.status === 409 ? 409 : 502, cors);
        }
        return json({sha: JSON.parse(txt).content.sha}, 200, cors);
      }
    }catch(e){
      return json({error:'中繼發生錯誤：' + e.message}, 500, cors);
    }
    return json({error:'不支援這個方法'}, 405, cors);
  }
};
