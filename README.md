# 全鏈路容量模擬器

A → API GW → B (Worker Pool) → MW (Spring Boot) → C (Server) → D (Device)

互動式容量規劃工具，即時模擬不同工單數 (N) 下各元件的負載狀態。

## 🚀 部署到 GitHub Pages

### Step 1: 建立 GitHub Repo

```bash
# 在 GitHub 上建立新 repo，名稱例如 capacity-simulator
# 然後：
cd capacity-simulator
git init
git add .
git commit -m "init: capacity simulator"
git branch -M main
git remote add origin git@github.com:<你的帳號>/capacity-simulator.git
git push -u origin main
```

### Step 2: 啟用 GitHub Pages

1. 去 repo → **Settings** → **Pages**
2. Source 選 **GitHub Actions**
3. 推 code 後會自動部署

### Step 3: 存取

```
https://<你的帳號>.github.io/capacity-simulator/
```

⚠️ 如果 repo 名稱不是 `capacity-simulator`，記得改 `vite.config.js` 裡的 `base` 路徑。

## 🛠️ 本地開發

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 產出到 ./dist
```

## 📊 可調參數

| 參數 | 預設值 | 說明 |
|------|--------|------|
| Jobs per 工單 | 2 | 每個工單拆幾個平行 job |
| C avg latency | 1s | C 的平均延遲 |
| C p99 latency | 30s | C 的 p99 延遲 |
| C pods | 15 | C 的 pod 數量 |
| C queue / pod | 2 | 每個 C pod 的 queue 深度 |
| B worker pool | 60 | B 的 worker pool 大小 |
| Busy ratio target | 0.7 | C 的目標 busy ratio |
