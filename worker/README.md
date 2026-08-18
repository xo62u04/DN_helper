# 中繼 Worker 部署步驟

隊友沒有 GitHub 帳號也要能上傳進度，所以用這支 Cloudflare Worker 代為讀寫 repo。
GitHub 權杖只放在 Worker 的 secret 裡，**不會出現在任何人的瀏覽器**。

整個流程只有團長要做一次，大概十分鐘。

## 1. 先準備一組 GitHub 權杖

到 [GitHub → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)：

- **Repository access**：Only select repositories → 只選 `DN_helper`
- **Permissions**：Repository permissions → **Contents: Read and write**
- **Expiration**：設一個到期日（到期後回來重發，重跑一次第 4 步就好）

產出來的 `github_pat_…` 先留著，等一下貼進 Worker。**不要 commit 進 repo**，
這是 public repo，GitHub 掃到會直接把它作廢。

## 2. 裝 wrangler 並登入 Cloudflare

```bash
npm install -g wrangler
```

```bash
wrangler login
```

會開瀏覽器要你授權 Cloudflare 帳號（免費帳號就夠）。

## 3. 進到這個資料夾

```bash
cd worker
```

## 4. 設兩組 secret

```bash
wrangler secret put GITHUB_TOKEN
```

貼上第 1 步那組權杖，按 Enter。接著設一組團隊密碼（自己想一組，之後要發給隊友）：

```bash
wrangler secret put TEAM_KEY
```

> `TEAM_KEY` 可以不設，但那樣任何知道 Worker 網址的人都能改你們的資料。
> 網址會出現在網頁原始碼裡，等於是公開的，所以建議設。

## 5. 部署

```bash
wrangler deploy
```

成功會印出網址，長得像 `https://dn-helper-relay.<你的帳號>.workers.dev`。

## 6. 每個人設定一次

把**網址**和**團隊密碼**發給隊友（用私訊，不要貼在公開的地方）。
各自打開 https://xo62u04.github.io/DN_helper/roster.html →「雲端存檔 → 連線設定」，
填「中繼網址」和「團隊密碼」→ 儲存設定。

之後就是打完點打勾、自動上傳、自動下載，隊友完全不用碰 GitHub。

## 驗證有沒有活著

```bash
curl https://dn-helper-relay.<你的帳號>.workers.dev/
```

回 `DN Helper relay OK` 就是活的。再測讀取（把 `<密碼>` 換成你的 TEAM_KEY）：

```bash
curl -H "X-Team-Key: <密碼>" https://dn-helper-relay.<你的帳號>.workers.dev/state
```

回一包含 `content` 和 `sha` 的 JSON 就代表讀寫路徑通了。

## 設定值

`wrangler.toml` 的 `[vars]` 是非機密設定，可以直接改：

| 變數 | 預設 | 說明 |
|---|---|---|
| `REPO` | `xo62u04/DN_helper` | 資料要寫到哪個 repo |
| `BRANCH` | `main` | 分支 |
| `FILE_PATH` | `data/state.json` | 存檔檔案 |
| `ALLOWED_ORIGIN` | `https://xo62u04.github.io` | 只允許這個網站呼叫。本機測試想放行就改成 `*` |

secret（`GITHUB_TOKEN`、`TEAM_KEY`）不寫在檔案裡，只能用 `wrangler secret put` 設。

## 出問題怎麼查

| 症狀 | 原因 |
|---|---|
| 頁面顯示「團隊密碼不對」 | `TEAM_KEY` 沒對上，重新在設定裡填一次 |
| 「中繼讀取失敗 500」 | Worker 沒設 `GITHUB_TOKEN`，重跑第 4 步 |
| 「GitHub 寫入失敗 403」 | 權杖沒有 Contents 寫入權限，或權杖過期了 |
| 「HTTP 409」 | 剛好兩個人同時上傳，再按一次上傳就好 |
| 瀏覽器 console 出現 CORS 錯誤 | `ALLOWED_ORIGIN` 跟你開的網址不一樣 |

權杖外洩的話：到 GitHub 把那組 token 撤銷、重發一組、重跑第 4 步和第 5 步即可，
repo 內容本身有 git 歷史可以還原。
