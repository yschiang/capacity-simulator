# 監控指標 Guide

A → API GW → B1 (接單) → B2 (Worker Pool) → [CORBA] → MW (SpringBoot) → C Server → D (Device)

## 優先級定義

- **P0 必看** — 出事第一時間要知道
- **P1 日常** — 趨勢觀察和容量預警
- **P2 輔助** — 問題排查時看

---

## P0 — 必看指標

### C: busy_ratio

| | |
|---|---|
| **什麼** | 有請求的 pods 數 / 總 pods 數 |
| **WARN** | > busy ratio target（預設 0.7，依設定調整） |
| **CRITICAL** | > 0.9 |
| **為什麼重要** | 最早反映 C 壓力的信號。超過 target 代表 pods 不夠，queue 開始堆積 |
| **告警響了** | 先看 queue_depth → 確認是流量增加（看 B concurrent_orders）還是 C/D 變慢（看 C latency → D error_rate） |

### C: avg_queue_depth

| | |
|---|---|
| **什麼** | 每個 pod 平均排隊的請求數 |
| **WARN** | > 1 |
| **CRITICAL** | ≥ queue_size（預設 2 = queue 滿了，開始 reject） |
| **為什麼重要** | queue 當 safety net，不當 capacity。長期 > 0 就該加 pods |
| **設計原則** | depth × C avg latency = 額外延遲。depth=2 代表每個 task 多等 2s |

### C: pod_ready_count

| | |
|---|---|
| **什麼** | 實際 ready 的 C pod 數量 |
| **WARN** | < HPA minReplicas |
| **CRITICAL** | < 50% of expected |
| **為什麼重要** | pods 掛了直接降低容量，比 busy ratio 飆高更緊急 |
| **告警響了** | 查 K8s events（OOM? CrashLoop? node 問題?）→ 不是 C 變慢，是 C 消失了 |

### B: worker_utilization

| | |
|---|---|
| **什麼** | 在忙的 B2 workers / pool size |
| **WARN** | > 60% |
| **CRITICAL** | > 80% |
| **為什麼重要** | B 的硬天花板。超過 80% 代表再來幾個工單就沒 worker 了 |
| **告警響了** | 看 concurrent_orders 是否超預期 → 如果正常，看 C latency 是否變慢拖住 worker |

### B: task_timeout_rate

| | |
|---|---|
| **什麼** | 單次 CORBA call 超時的比例 |
| **WARN** | > 5% |
| **CRITICAL** | > 10% |
| **為什麼重要** | 升高代表 C 或 D 回應變慢 |
| **告警響了** | 看 C response_latency p99 → 如果 C 正常，看 D device_response_time → 最後看 MW forwarding_latency |

---

## P1 — 日常觀察

### B: concurrent_orders

| | |
|---|---|
| **什麼** | 目前同時在跑的工單數 |
| **WARN** | 上線初期先收集數據，確定 N 後設 N×0.8 |
| **CRITICAL** | 上線初期先收集數據，確定 N 後設 = N |
| **為什麼重要** | 觀察 peak 同時工單數，用來決定 N 的目標值。上線初期最重要的觀察指標 |
| **備註** | 上線後前 2 週收集 peak 數據，之後再定 N 和對應閾值 |

### C: response_latency (p50 / p95 / p99)

| | |
|---|---|
| **什麼** | C 回應單次 task 的延遲分佈 |
| **WARN** | p99 > 基線 × 1.2 |
| **CRITICAL** | p99 > 基線 × 1.5 |
| **為什麼重要** | C 或 D 變慢的信號。p99/p50 比值越大，長尾越嚴重 |
| **備註** | 上線後前 2 週收集基線（預估 p99 ≈ 30s），之後再設閾值 |

### B: order_completion_time (p50 / p95 / p99)

| | |
|---|---|
| **什麼** | 工單的端到端完成時間 |
| **WARN** | > 基線 × 1.5 |
| **CRITICAL** | > 基線 × 2 |
| **為什麼重要** | 上升 = C 排隊（queue depth 高）或 D 變慢（C latency 高） |
| **備註** | 上線後前 2 週收集基線再設閾值 |

### B: circuit_breaker_state

| | |
|---|---|
| **什麼** | 熔斷器狀態：CLOSED / HALF_OPEN / OPEN |
| **WARN** | HALF_OPEN（探測中） |
| **CRITICAL** | OPEN（熔斷中） |
| **為什麼重要** | 熔斷 = 下游持續失敗，系統正在自我保護。需立即查 C/D 狀態 |

---

## P2 — 問題排查

### D: device_error_rate

| | |
|---|---|
| **什麼** | Device 連線失敗或超時的比例 |
| **WARN** | > 1% |
| **CRITICAL** | > 5% |
| **為什麼重要** | 所有上游指標異常的最終根因可能在這裡。D 是整條鏈路的最終瓶頸 |

### D: device_response_time

| | |
|---|---|
| **什麼** | Device 回應時間 |
| **WARN** | > 基線 × 1.5 |
| **CRITICAL** | > 基線 × 2 |
| **為什麼重要** | D 變慢會拉高 C latency，連鎖影響整條鏈路 |

### API GW: reject_rate (429)

| | |
|---|---|
| **什麼** | API Gateway 拒絕的請求比例 |
| **WARN** | > 0（開始擋了） |
| **CRITICAL** | > 5% |
| **為什麼重要** | GW 開始擋流量，代表工單數超過設定上限 |

### B1: tomcat_thread_utilization

| | |
|---|---|
| **什麼** | B1 (接單入口) 的 Tomcat thread 利用率 |
| **WARN** | > 80% |
| **CRITICAL** | > 95% |
| **為什麼重要** | B1 正常輕量不會滿，滿了代表有異常（如工單處理卡住） |

### MW: thread_utilization

| | |
|---|---|
| **什麼** | threads.busy / threads.config.max |
| **WARN** | > 80% |
| **CRITICAL** | > 95% |
| **為什麼重要** | MW 是 pass-through，正常不會是瓶頸。升高代表 MW 有問題 |

### MW: forwarding_latency

| | |
|---|---|
| **什麼** | MW 自身延遲（不含 C 的回應時間） |
| **WARN** | > 100ms |
| **CRITICAL** | > 500ms |
| **為什麼重要** | 應 < 50ms。升高代表 MW thread pool 壅塞或 GC 問題 |

---

## 告警響了怎麼看

```
C pod_ready_count 掉了
  → 查 K8s events（OOM? CrashLoop? node 問題?）
  → 不是 C 變慢，是 C 消失了

C avg_queue_depth 飆高
  → 看 busy_ratio 是否也高
    → 是：pods 不夠，加 C pods
    → 否：部分 pod 負載不均，查 load balancing

C busy_ratio 飆高
  → 看 queue_depth
    → 確認是流量增加（看 B concurrent_orders）
    → 還是 C/D 變慢（看 C latency → D error_rate）

B worker_util 飆高
  → 看 concurrent_orders 是否超預期
    → 如果正常，看 C latency 是否變慢拖住 worker

task_timeout_rate 升高
  → 看 C response_latency p99
    → 如果 C 正常，看 D device_response_time
    → 最後看 MW forwarding_latency

order_completion_time 上升
  → 看 C queue_depth（排隊久了）
  → 或看 C latency / D response_time（變慢了）

circuit_breaker OPEN
  → 下游持續失敗
  → 查 C pod_ready_count 和 D device_error_rate
```
