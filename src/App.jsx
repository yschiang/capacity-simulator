import { useState, useMemo } from "react";

const DEFAULT = {
  jobsPerOrder: 2,
  cAvgLatency: 1,
  cP99Latency: 30,
  cPods: 15,
  cQueuePerPod: 2,
  bPool: 60,
  busyRatioTarget: 0.7,
};

function App() {
  const [params, setParams] = useState(DEFAULT);
  const [selectedN, setSelectedN] = useState(10);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const Ns = [5, 10, 20, 30];

  const set = (key, val) => setParams((p) => ({ ...p, [key]: val }));

  const derived = useMemo(() => {
    const { jobsPerOrder, cAvgLatency, cPods, cQueuePerPod, bPool, busyRatioTarget } = params;
    const cPodCapacity = 1 + cQueuePerPod;
    const cTotalCapacity = cPods * cPodCapacity;
    const bMaxOrders = Math.floor(bPool / jobsPerOrder);
    const simulations = Ns.map((n) => {
      const bWorkers = n * jobsPerOrder;
      const bUtil = Math.min(bWorkers / bPool, 1);
      const bBuffer = Math.max(0, bPool - bWorkers);
      const bOverflow = bWorkers > bPool;
      const bOverflowBy = Math.max(0, bWorkers - bPool);

      // C: actual in-flight is capped by what B can actually send
      const cInFlight = Math.min(n, bMaxOrders) * jobsPerOrder;
      const rawQueueDepth = Math.max(0, cInFlight / cPods - 1);
      const avgQueueDepth = Math.min(rawQueueDepth, cQueuePerPod); // #2: cap at queue size
      const cOverflow = cInFlight > cTotalCapacity;
      const cRejectCount = Math.max(0, cInFlight - cTotalCapacity); // #7: requests that get rejected

      // #3: busy ratio = pods that have at least 1 request / total pods
      const busyPods = Math.min(cInFlight, cPods);
      const busyRatio = busyPods / cPods;

      const extraWait = cOverflow ? null : avgQueueDepth * cAvgLatency; // #4: N/A when overflow
      const speedImpact = (!cOverflow && cAvgLatency > 0 && extraWait !== null) ? extraWait / cAvgLatency : null;
      const suggestedPods = Math.ceil(cInFlight / busyRatioTarget); // #1: use capped cInFlight
      const addPods = Math.max(0, suggestedPods - cPods);

      let cStatus, cStatusColor;
      if (cInFlight <= cPods) { cStatus = "✓ 充裕"; cStatusColor = "text-emerald-700"; }
      else if (cInFlight <= cTotalCapacity * 0.85) { cStatus = "✓ 夠用"; cStatusColor = "text-emerald-600"; }
      else if (cInFlight <= cTotalCapacity) { cStatus = "⚠️ 接近上限"; cStatusColor = "text-amber-600"; }
      else { cStatus = `❌ 超載 (${cRejectCount} rejected)`; cStatusColor = "text-red-600"; }

      // B overflow status - unified: ≤60% green, 60-80% amber, >80% red
      let bStatus, bStatusColor;
      if (bOverflow) { bStatus = `❌ 不夠 (缺${bOverflowBy})`; bStatusColor = "text-red-600"; }
      else if (bUtil > 0.8) { bStatus = "⚠️ 接近上限"; bStatusColor = "text-red-600"; }
      else if (bUtil > 0.6) { bStatus = "✓ 正常"; bStatusColor = "text-amber-600"; }
      else { bStatus = "✓ 充裕"; bStatusColor = "text-emerald-600"; }

      return { n, bWorkers, bUtil, bBuffer, bOverflow, bOverflowBy, bStatus, bStatusColor, cInFlight, avgQueueDepth, cOverflow, cRejectCount, busyRatio, cStatus, cStatusColor, extraWait, speedImpact, suggestedPods, addPods };
    });
    return { cPodCapacity, cTotalCapacity, bMaxOrders, simulations };
  }, [params]);

  const currentSim = derived.simulations.find(s => s.n === selectedN) || derived.simulations[0];

  const bg = (val, green, yellow) => {
    if (val <= green) return "bg-emerald-100 text-emerald-800";
    if (val <= yellow) return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  };
  const bgReverse = (val, red, yellow) => {
    if (val <= red) return "bg-red-100 text-red-800";
    if (val <= yellow) return "bg-amber-100 text-amber-800";
    return "bg-emerald-100 text-emerald-800";
  };
  const utilColor = (pct) => {
    if (pct <= 0.6) return { bar: "bg-emerald-400", text: "text-emerald-700" };
    if (pct <= 0.8) return { bar: "bg-amber-400", text: "text-amber-700" };
    return { bar: "bg-red-400", text: "text-red-700" };
  };

  const bColors = utilColor(currentSim.bUtil);
  const cColors = utilColor(currentSim.busyRatio);

  const FlowArrow = ({ label, sublabel }) => (
    <div className="flex flex-col items-center justify-center px-1 shrink-0">
      <div className="text-xs font-medium text-slate-500 mb-0.5 whitespace-nowrap">{label}</div>
      <svg width="48" height="16" viewBox="0 0 48 16" className="text-slate-300">
        <line x1="0" y1="8" x2="40" y2="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
        <polygon points="40,3 48,8 40,13" fill="currentColor"/>
      </svg>
      {sublabel && <div className="text-xs text-slate-400 mt-0.5 whitespace-nowrap">{sublabel}</div>}
    </div>
  );

  const MiniBar = ({ value, max, color }) => (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(value/max,1)*100}%` }}/>
    </div>
  );

  const InputRow = ({ label, paramKey, min, max, step, unit }) => (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-36 text-xs font-medium text-slate-600 shrink-0">{label}</div>
      <input type="range" min={min} max={max} step={step} value={params[paramKey]}
        onChange={(e) => set(paramKey, Number(e.target.value))} className="w-24 h-1 accent-sky-600"/>
      <div className="flex items-center gap-1">
        <input type="number" min={min} max={max} step={step} value={params[paramKey]}
          onChange={(e) => { const v = Number(e.target.value); if (v >= min && v <= max) set(paramKey, v); }}
          className="w-14 text-sm font-bold text-sky-700 text-right bg-transparent border-b border-slate-200 focus:border-sky-500 focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Noto Sans TC', sans-serif" }} className="max-w-6xl mx-auto p-4">

      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">全鏈路容量模擬器</h1>
          <p className="text-sm text-slate-500 mt-1">調整參數即時看架構流量與模擬結果</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">同時工單 N =</span>
          {Ns.map(n => (
            <button key={n} onClick={() => setSelectedN(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedN === n ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Design Assumptions (collapsible) ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 mb-5 shadow-sm overflow-hidden">
        <button onClick={() => setShowAssumptions(!showAssumptions)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">設計假設 — 訊息流模型</div>
          <span className={`text-slate-400 transition-transform ${showAssumptions ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showAssumptions && <div className="px-5 pb-5 border-t border-slate-100 pt-4">

        {/* Flow overview */}
        <div className="bg-slate-50 rounded-lg p-4 mb-4" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          <div className="text-xs text-slate-500 mb-2 font-sans font-medium">完整鏈路</div>
          <div className="text-sm text-slate-700 leading-relaxed">
            A (Browser) → <span className="text-violet-600 font-semibold">API Gateway</span> → <span className="text-sky-600 font-semibold">B (SpringBoot)</span> → <span className="text-slate-500">[CORBA]</span> → <span className="text-slate-500">External MW (SpringBoot)</span> → <span className="text-emerald-600 font-semibold">C Server</span> → <span className="text-orange-600 font-semibold">D (Device)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Component assumptions */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">各元件模型</div>

            <div className="border-l-3 border-sky-400 pl-3 py-1">
              <div className="text-sm font-semibold text-sky-700">B — Worker Pool (SpringBoot)</div>
              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                <div>• B 內部分為 <strong>B1</strong>（接單、拆 tasks、分配）和 <strong>B2</strong>（worker pool 執行 jobs），容量瓶頸在 B2</div>
                <div>• A 的每個請求 = 1 個<strong>工單</strong>（操作一台 Device）</div>
                <div>• B1 收到工單後，將 tasks 分配給 B2 的 worker 執行</div>
                <div>• 每個工單最多起 <strong>2~4 個 parallel jobs</strong>，每個 job 佔 B2 的 1 個 worker</div>
                <div>• 每個 job 依序執行多個 tasks，每個 task = 1 次 CORBA call</div>
                <div>• 工單是 <strong>long-running</strong>（分鐘級），不是秒級 request-response</div>
                <div>• B1 有自己的 SpringBoot Tomcat threads（輕量、不影響 sizing）</div>
                <div>• 模擬器的「B worker pool」= B2 的 pool size</div>
              </div>
            </div>

            <div className="border-l-3 border-slate-300 pl-3 py-1">
              <div className="text-sm font-semibold text-slate-600">External MW — Spring Boot Tomcat</div>
              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                <div>• 純 pass-through 轉發，無業務邏輯</div>
                <div>• Thread-per-request 模型，blocking 等待 C 回應</div>
                <div>• 長期建議評估是否移除</div>
              </div>
            </div>

            <div className="border-l-3 border-emerald-400 pl-3 py-1">
              <div className="text-sm font-semibold text-emerald-700">C — Server (Single-threaded)</div>
              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                <div>• 每個 pod <strong>single-threaded</strong>，同時只處理 1 個請求</div>
                <div>• 有 <strong>internal queue</strong>（預設 size=2），多的請求排隊等待</div>
                <div>• IO-bound，瓶頸在後端 Device 回應速度</div>
                <div>• 透過 K8s pod 數量水平擴展</div>
              </div>
            </div>

            <div className="border-l-3 border-orange-400 pl-3 py-1">
              <div className="text-sm font-semibold text-orange-700">D — Device</div>
              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                <div>• 每台 Device 最多接受 <strong>N 條平行連線</strong>（= jobs per 工單）</div>
                <div>• 同一工單的所有 tasks 打同一台 Device</div>
                <div>• Device 是整條鏈路的最終瓶頸</div>
              </div>
            </div>
          </div>

          {/* Right: Key formulas & constraints */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">核心公式與限制</div>

            <div className="bg-sky-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-sky-700 mb-1.5">容量推導（從同時工單數 N 開始）</div>
              <div className="text-xs text-slate-700 space-y-1 font-mono">
                <div>B workers 需求 = N × jobs_per_工單</div>
                <div>C in-flight    = N × jobs_per_工單</div>
                <div>C pods 需求    = C_in-flight / busy_ratio_target</div>
                <div>MW threads     ≥ C pods</div>
              </div>
            </div>

            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-emerald-700 mb-1.5">C 的 queue 模型</div>
              <div className="text-xs text-slate-700 space-y-1 font-mono">
                <div>pod capacity   = 1 (processing) + queue_size</div>
                <div>total capacity = pods × pod_capacity</div>
                <div>avg queue depth= max(0, in-flight/pods - 1)</div>
                <div>               capped at queue_size</div>
                <div>extra latency  = queue_depth × C_avg_latency</div>
                <div>overflow       = in-flight &gt; total_capacity → rejected</div>
              </div>
              <div className="text-xs text-slate-500 mt-1.5 font-sans">
                設計原則：queue 當 <strong>safety net</strong>，不當 capacity。
                注意：公式假設請求均勻分佈到所有 pods，實際 K8s round-robin 可能不均勻，部分 pod 會更早 queue 滿。
              </div>
            </div>

            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-amber-700 mb-1.5">Timeout 鏈（外層 &gt; 內層）</div>
              <div className="text-xs text-slate-700 space-y-1 font-mono">
                <div>單次 task: C_p99 &lt; MW→C &lt; B→MW</div>
                <div>整個工單:  分鐘級（依 task 數量）</div>
                <div>A→B:      工單 timeout + buffer</div>
              </div>
            </div>

            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-red-700 mb-1.5">關鍵限制</div>
              <div className="text-xs text-slate-700 space-y-1">
                <div>• B pool ÷ jobs = 同時工單上限（<strong>硬天花板</strong>）</div>
                <div>• C pods 不足 → queue 堆積 → latency 飆高 → timeout</div>
                <div>• p99/avg 比值越大，系統越不穩定</div>
                <div>• B 和 C 必須<strong>同時擴展</strong>，只擴一邊沒用</div>
              </div>
            </div>
          </div>
        </div>

        {/* Monitoring note */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-start gap-2">
          <span className="text-sm">📌</span>
          <div className="text-xs text-slate-500">
            <strong className="text-slate-600">上線觀察重點：</strong>
            C busy ratio 和 avg queue depth 是最關鍵的兩個指標。
            busy ratio &gt; 0.7 或 queue depth &gt; 1 持續出現，就該考慮加 C pods。
            B worker utilization &gt; 50% 則考慮加 B pool 或限制同時工單數。
          </div>
        </div>
        </div>}
      </div>

      {/* ═══ Glossary & Relationships (collapsible) ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 mb-5 shadow-sm overflow-hidden">
        <button onClick={() => setShowGlossary(!showGlossary)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">名詞定義與關聯</div>
          <span className={`text-slate-400 transition-transform ${showGlossary ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showGlossary && <div className="px-5 pb-5 border-t border-slate-100 pt-4">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: hierarchy */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">層級關聯</div>
            <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs space-y-0.5 leading-relaxed">
              <div className="text-slate-700"><strong className="text-sky-700">工單 (Order)</strong></div>
              <div className="text-slate-400 pl-2">│  A 發出的 1 個請求 = 1 個工單 = 操作 1 台 Device</div>
              <div className="text-slate-400 pl-2">│</div>
              <div className="text-slate-400 pl-2">├─ <strong className="text-sky-700">Job</strong> ×{params.jobsPerOrder}（平行執行）</div>
              <div className="text-slate-400 pl-2">│    每個 job 佔 B2 的 1 個 worker</div>
              <div className="text-slate-400 pl-2">│    同一工單的 jobs 打同一台 Device</div>
              <div className="text-slate-400 pl-2">│</div>
              <div className="text-slate-400 pl-2">│  └─ <strong className="text-sky-700">Task</strong> ×N（依序執行）</div>
              <div className="text-slate-400 pl-2">│       每個 task = 1 次 CORBA call → MW → C → D</div>
              <div className="text-slate-400 pl-2">│       task 延遲 = C avg {params.cAvgLatency}s / p99 {params.cP99Latency}s</div>
              <div className="text-slate-400 pl-2">│</div>
              <div className="text-slate-400 pl-2">└─ 工單完成 = 所有 jobs 完成 = 所有 tasks 完成</div>
              <div className="text-slate-400 pl-4">  耗時 = max(各 job 的 tasks 數) × avg task 延遲</div>
              <div className="text-slate-400 pl-4">  通常 <strong className="text-amber-600">分鐘級</strong></div>
            </div>
          </div>

          {/* Right: definitions table */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">名詞定義</div>
            <div className="space-y-0">
              {[
                ['工單 Order', 'A 的 1 個 HTTP 請求。代表對 1 台 Device 執行一組操作。是容量規劃的基本單位。', 'bg-sky-50 border-sky-200'],
                ['Job', `工單被拆分後的平行執行單元。每個工單最多 ${params.jobsPerOrder} 個 jobs，每個佔 1 個 B2 worker。`, 'bg-sky-50 border-sky-200'],
                ['Task', '1 個 job 內依序執行的最小單元。每個 task = 1 次 CORBA call，經 MW 轉發到 C，最終打到 D。', 'bg-sky-50 border-sky-200'],
                ['N（同時工單數）', '系統同時在處理的工單數量。所有容量計算的起點。', 'bg-amber-50 border-amber-200'],
                ['B2 Worker', `實際執行 job 的執行緒。1 個 worker 被 1 個 job 佔住直到完成。pool size = ${params.bPool}。`, 'bg-slate-50 border-slate-200'],
                ['C Pod', `處理 task 的伺服器。單執行緒 + queue(${params.cQueuePerPod})。目前 ${params.cPods} pods。`, 'bg-emerald-50 border-emerald-200'],
                ['Busy Ratio', `有請求的 C pods / 總 C pods。target = ${params.busyRatioTarget}，超過就該擴。`, 'bg-emerald-50 border-emerald-200'],
                ['In-flight', `正在 C 裡面（處理中 + queue 中）的 requests 總數。= N × ${params.jobsPerOrder}。`, 'bg-emerald-50 border-emerald-200'],
              ].map(([term, def, colors], i) => (
                <div key={i} className={`flex border-b ${i === 0 ? 'rounded-t-lg' : ''} ${i === 7 ? 'rounded-b-lg border-b-0' : ''} ${colors}`}>
                  <div className="w-32 shrink-0 py-2 px-3 text-xs font-semibold text-slate-700 border-r border-slate-200">{term}</div>
                  <div className="py-2 px-3 text-xs text-slate-600">{def}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Multiplier chain */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">數量放大鏈</div>
          <div className="flex items-center gap-2 text-xs flex-wrap" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <span className="px-2.5 py-1 bg-sky-50 border border-sky-200 rounded font-semibold">N 個工單</span>
            <span className="text-slate-400">×{params.jobsPerOrder}</span>
            <span className="text-slate-300">→</span>
            <span className="px-2.5 py-1 bg-sky-50 border border-sky-200 rounded font-semibold">N×{params.jobsPerOrder} jobs</span>
            <span className="text-slate-400">= B workers</span>
            <span className="text-slate-300">→</span>
            <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded font-semibold">N×{params.jobsPerOrder} concurrent C calls</span>
            <span className="text-slate-400">= C in-flight</span>
            <span className="text-slate-300">→</span>
            <span className="px-2.5 py-1 bg-orange-50 border border-orange-200 rounded font-semibold">N 台 Device 被操作</span>
          </div>
          <div className="text-xs text-slate-400 mt-1.5">
            例：N=10 → {10 * params.jobsPerOrder} jobs → {10 * params.jobsPerOrder} concurrent C requests → 10 台 Device
          </div>
        </div>
        </div>}
      </div>

      {/* ═══ Inputs ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">輸入參數</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
          <div>
            <InputRow label="Jobs per 工單" paramKey="jobsPerOrder" min={1} max={4} step={1} />
            <InputRow label="C avg latency" paramKey="cAvgLatency" min={0.5} max={10} step={0.5} unit="s" />
            <InputRow label="C p99 latency" paramKey="cP99Latency" min={1} max={60} step={1} unit="s" />
            <InputRow label="Busy ratio target" paramKey="busyRatioTarget" min={0.3} max={0.95} step={0.05} />
          </div>
          <div>
            <InputRow label="C pods" paramKey="cPods" min={5} max={200} step={5} />
            <InputRow label="C queue / pod" paramKey="cQueuePerPod" min={0} max={10} step={1} />
            <InputRow label="B worker pool" paramKey="bPool" min={20} max={200} step={10} />
          </div>
        </div>
        <div className="flex gap-6 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div>C pod capacity: <strong className="text-slate-700">{derived.cPodCapacity}</strong></div>
          <div>C total capacity: <strong className="text-slate-700">{derived.cTotalCapacity}</strong></div>
          <div>B max 工單: <strong className="text-slate-700">{derived.bMaxOrders}</strong></div>
        </div>
      </div>

      {/* ═══ Architecture Flow ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5 shadow-sm overflow-x-auto">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">架構訊息流 <span className="text-sky-600 normal-case">N={selectedN}</span></div>

        <div className="flex items-stretch gap-0 min-w-[920px] py-2">
          {/* A */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-24 bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-center">
              <div className="text-lg mb-1">🌐</div>
              <div className="text-xs font-bold text-slate-700">A</div>
              <div className="text-xs text-slate-400">Browser</div>
              <div className="mt-2 text-xs">
                <span className="font-mono font-bold text-slate-600">{selectedN}</span>
                <span className="text-slate-400"> 工單</span>
              </div>
            </div>
          </div>

          <FlowArrow label="REST" sublabel={`${selectedN} req`} />

          {/* API GW */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-28 bg-violet-50 border-2 border-violet-200 rounded-xl p-3 text-center">
              <div className="text-lg mb-1">🛡️</div>
              <div className="text-xs font-bold text-violet-700">API Gateway</div>
              <div className="mt-2 text-xs text-violet-500">Rate Limit</div>
              <div className="text-xs font-mono font-bold text-violet-700 mt-0.5">N ≤ {derived.bMaxOrders}</div>
            </div>
          </div>

          <FlowArrow label="REST" sublabel={`${selectedN} req`} />

          {/* B */}
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-36 border-2 rounded-xl p-3 text-center ${currentSim.bOverflow ? 'bg-red-50 border-red-300' : currentSim.bUtil > 0.8 ? 'bg-red-50 border-red-300' : currentSim.bUtil > 0.6 ? 'bg-amber-50 border-amber-200' : 'bg-sky-50 border-sky-200'}`}>
              <div className="text-lg mb-1">⚙️</div>
              <div className="text-xs font-bold text-slate-700">B — Worker Pool</div>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">pool</span>
                  <span className="font-mono font-bold text-slate-700">{params.bPool}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">need</span>
                  <span className={`font-mono font-bold ${currentSim.bOverflow ? 'text-red-600' : bColors.text}`}>{currentSim.bWorkers}{currentSim.bOverflow && ' ✗'}</span>
                </div>
                <MiniBar value={currentSim.bWorkers} max={params.bPool} color={currentSim.bOverflow ? 'bg-red-400' : bColors.bar} />
                <div className={`text-xs font-bold ${currentSim.bOverflow ? 'text-red-600' : bColors.text}`}>
                  {currentSim.bOverflow ? `缺 ${currentSim.bOverflowBy}` : `${(currentSim.bUtil*100).toFixed(0)}%`}
                </div>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-xs text-slate-400">
                ×{params.jobsPerOrder} jobs/工單
              </div>
            </div>
          </div>

          <FlowArrow label="CORBA" sublabel={`${currentSim.cInFlight} calls`} />

          {/* MW */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-28 bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-center">
              <div className="text-lg mb-1">🔄</div>
              <div className="text-xs font-bold text-slate-700">MW</div>
              <div className="text-xs text-slate-400">Spring Boot</div>
              <div className="mt-2 text-xs">
                <span className="text-slate-500">threads </span>
                <span className="font-mono font-bold text-slate-600">200×2</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">+50ms</div>
            </div>
          </div>

          <FlowArrow label="CORBA" sublabel={`${currentSim.cInFlight} calls`} />

          {/* C */}
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-36 border-2 rounded-xl p-3 text-center ${currentSim.cOverflow ? 'bg-red-50 border-red-300' : currentSim.busyRatio >= 1 ? 'bg-red-50 border-red-300' : currentSim.busyRatio > params.busyRatioTarget ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="text-lg mb-1">🖥️</div>
              <div className="text-xs font-bold text-slate-700">C — Server</div>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">pods</span>
                  <span className="font-mono font-bold text-slate-700">{params.cPods}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">in-flight</span>
                  <span className={`font-mono font-bold ${currentSim.cOverflow ? 'text-red-600' : cColors.text}`}>{currentSim.cInFlight}{currentSim.cOverflow && ' ✗'}</span>
                </div>
                <MiniBar value={currentSim.cInFlight} max={derived.cTotalCapacity} color={currentSim.cOverflow ? 'bg-red-400' : cColors.bar} />
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">queue</span>
                  <span className={`font-mono font-bold ${currentSim.avgQueueDepth >= params.cQueuePerPod ? 'text-red-600' : currentSim.avgQueueDepth > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {currentSim.avgQueueDepth.toFixed(1)}/{params.cQueuePerPod}
                  </span>
                </div>
                {currentSim.cOverflow ? (
                  <div className="text-xs font-bold text-red-600">{currentSim.cRejectCount} rejected</div>
                ) : (
                  <div className={`text-xs font-bold ${cColors.text}`}>busy {currentSim.busyRatio.toFixed(2)}</div>
                )}
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-xs text-slate-400">
                avg {params.cAvgLatency}s · p99 {params.cP99Latency}s
              </div>
            </div>
          </div>

          <FlowArrow label="" sublabel="" />

          {/* D */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-28 bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-center">
              <div className="text-lg mb-1">📡</div>
              <div className="text-xs font-bold text-orange-700">D</div>
              <div className="text-xs text-orange-500">Device</div>
              <div className="mt-2 text-xs text-orange-600">max {params.jobsPerOrder} conn</div>
              <div className="text-xs text-orange-400">per device</div>
            </div>
          </div>
        </div>

        {/* Timeout + Status */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs flex-wrap" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <span className="text-slate-400 font-sans">Timeout:</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">C:{params.cP99Latency}s</span>
            <span className="text-slate-300">&lt;</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">MW→C:{params.cP99Latency+3}s</span>
            <span className="text-slate-300">&lt;</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">B→MW:{params.cP99Latency+5}s</span>
            <span className="text-slate-300">&lt;</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">A→B: 分鐘級</span>
            <span className="text-emerald-500 font-bold">✓</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className={`text-xs font-semibold ${currentSim.cStatusColor}`}>N={selectedN}: {currentSim.cStatus}</span>
            {currentSim.addPods > 0 && <span className="text-xs text-sky-600">→ 建議 C pods 加到 {currentSim.suggestedPods} (+{currentSim.addPods})</span>}
          </div>
        </div>
      </div>

      {/* ═══ Matrix ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">模擬矩陣</div>
          <div className="flex gap-3 text-xs">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200"></span>健康</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200"></span>注意</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200"></span>危險</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left py-2.5 px-4 font-medium w-48">指標</th>
                {Ns.map(n => (
                  <th key={n} className={`text-center py-2.5 px-3 font-medium ${selectedN===n ? 'bg-sky-100 text-sky-700' : ''}`}>
                    N={n}{selectedN===n && ' ◄'}</th>
                ))}
                <th className="text-left py-2.5 px-4 font-medium text-slate-400" style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>公式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                {l:'B workers 需求',k:'bWorkers',r:v=>bg(v,params.bPool*.6,params.bPool*.8),f:`N×${params.jobsPerOrder}`},
                {l:'B 利用率',k:'bUtil',fm:v=>`${(v*100).toFixed(0)}%`,r:v=>bg(v,.6,.8),f:'workers/pool (capped 100%)'},
                {l:'B buffer',k:'bBuffer',r:v=>bgReverse(v,5,params.bPool*.4),f:'pool-workers (min 0)'},
                {l:'B 狀態',k:'bStatus',r:()=>'',st:true,bSt:true,f:`pool=${params.bPool}`},
                {l:'C in-flight',k:'cInFlight',r:()=>'',f:`min(N,B max)×${params.jobsPerOrder}`,bold:true},
                {l:'C avg queue depth',k:'avgQueueDepth',fm:v=>v.toFixed(1),r:v=>bg(v,.5,params.cQueuePerPod*.7),f:`in-flight/pods-1 (cap ${params.cQueuePerPod})`},
                {l:'C busy ratio',k:'busyRatio',fm:v=>v.toFixed(2),r:v=>bg(v,params.busyRatioTarget,.9),f:'busy_pods/total_pods'},
                {l:'C 狀態',k:'cStatus',r:()=>'',st:true,f:`cap=${derived.cTotalCapacity} (${params.cPods}×${derived.cPodCapacity})`},
                {l:'每task額外等待',k:'extraWait',fm:v=>v===null?'N/A':`${v.toFixed(1)}s`,r:v=>v===null?'bg-red-100 text-red-800':bg(v,params.cAvgLatency*.5,params.cAvgLatency*1.5),f:'queue×C_avg (溢出=N/A)'},
                {l:'工單速度影響',k:'speedImpact',fm:v=>v===null?'N/A':v<=.05?'—':`+${(v*100).toFixed(0)}%`,r:v=>v===null?'bg-red-100 text-red-800':bg(v,.3,1),f:'extra/C_avg'},
                {l:'建議 C pods',k:'suggestedPods',r:()=>'bg-sky-50 text-sky-700',f:`cInFlight/${params.busyRatioTarget}`,sug:true},
                {l:'需加 C pods',k:'addPods',r:v=>v===0?'bg-emerald-100 text-emerald-700':v<=20?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700',fm:v=>v===0?'不用':`+${v}`,sug:true},
              ].map((row,ri) => (
                <tr key={ri} className={`hover:bg-slate-50/50 ${row.sug?'bg-sky-50/30':''}`}>
                  <td className="py-2 px-4 font-medium text-slate-700" style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>{row.l}</td>
                  {derived.simulations.map(s => {
                    const val=s[row.k]; const disp=row.fm?row.fm(val):val; const cls=row.st?(row.bSt?s.bStatusColor:s.cStatusColor):row.r(val);
                    return <td key={s.n} className={`text-center py-2 px-3 ${selectedN===s.n?'bg-sky-50/50':''}`}>
                      {row.st?<span className={`text-xs font-semibold ${cls}`}>{disp}</span>
                      :row.bold?<span className="font-semibold">{disp}</span>
                      :<span className={`inline-block w-16 py-0.5 rounded text-xs font-semibold ${cls}`}>{disp}</span>}
                    </td>;
                  })}
                  <td className="py-2 px-4 text-xs text-slate-400" style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>{row.f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Insight ═══ */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">快速判讀</div>
        <div className="space-y-2 text-sm text-slate-600">
          <div>B pool={params.bPool} 最多 <strong className="text-sky-700">{derived.bMaxOrders}</strong> 個同時工單</div>
          <div>C pods={params.cPods} 不排隊撐 <strong className="text-sky-700">{Math.floor(params.cPods/params.jobsPerOrder)}</strong> 個，queue全開撐 <strong className="text-sky-700">{Math.floor(derived.cTotalCapacity/params.jobsPerOrder)}</strong> 個</div>
          <div>{derived.bMaxOrders > Math.floor(derived.cTotalCapacity/params.jobsPerOrder)
            ? <span className="text-red-600 font-medium">⚠️ B 放行的工單數 &gt; C 能承接的 → C 是瓶頸</span>
            : <span className="text-emerald-600 font-medium">✓ C capacity 足以承接 B 的最大工單數</span>}
          </div>
        </div>
      </div>

      {/* ═══ Monitoring Metrics Guide (collapsible) ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button onClick={() => setShowMetrics(!showMetrics)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">監控指標 Guide</div>
          <span className={`text-slate-400 transition-transform ${showMetrics ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showMetrics && <div className="px-5 pb-5 border-t border-slate-100 pt-4">

        {/* Priority legend */}
        <div className="flex gap-4 mb-4 text-xs">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span><strong>P0</strong> 必看 — 出事第一時間要知道</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span><strong>P1</strong> 日常 — 趨勢觀察和容量預警</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400"></span><strong>P2</strong> 輔助 — 問題排查時看</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <th className="text-left py-2 px-3 font-medium w-10">P</th>
                <th className="text-left py-2 px-3 font-medium w-24">元件</th>
                <th className="text-left py-2 px-3 font-medium w-40">指標</th>
                <th className="text-center py-2 px-3 font-medium w-28">WARN</th>
                <th className="text-center py-2 px-3 font-medium w-28">CRITICAL</th>
                <th className="text-left py-2 px-3 font-medium">為什麼重要</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* P0 */}
              <tr className="bg-red-50/30">
                <td className="py-2.5 px-3 font-bold text-red-600">P0</td>
                <td className="py-2.5 px-3 font-medium text-emerald-700">C</td>
                <td className="py-2.5 px-3 font-mono font-medium">busy_ratio</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; {params.busyRatioTarget}</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 0.9</span></td>
                <td className="py-2.5 px-3 text-slate-600">最早反映 C 壓力的信號。超過 target 代表 pods 不夠，queue 開始堆積</td>
              </tr>
              <tr className="bg-red-50/30">
                <td className="py-2.5 px-3 font-bold text-red-600">P0</td>
                <td className="py-2.5 px-3 font-medium text-emerald-700">C</td>
                <td className="py-2.5 px-3 font-mono font-medium">avg_queue_depth</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 1</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">≥ {params.cQueuePerPod}</span></td>
                <td className="py-2.5 px-3 text-slate-600">queue 當 safety net，長期 &gt; 0 就該加 pods。= {params.cQueuePerPod} 代表 queue 滿了，開始 reject</td>
              </tr>
              <tr className="bg-red-50/30">
                <td className="py-2.5 px-3 font-bold text-red-600">P0</td>
                <td className="py-2.5 px-3 font-medium text-emerald-700">C</td>
                <td className="py-2.5 px-3 font-mono font-medium">pod_ready_count</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&lt; HPA min</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&lt; 50%</span></td>
                <td className="py-2.5 px-3 text-slate-600">pods 掛了直接降低容量，比 busy ratio 飆高更緊急</td>
              </tr>
              <tr className="bg-red-50/30">
                <td className="py-2.5 px-3 font-bold text-red-600">P0</td>
                <td className="py-2.5 px-3 font-medium text-sky-700">B</td>
                <td className="py-2.5 px-3 font-mono font-medium">worker_utilization</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 60%</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 80%</span></td>
                <td className="py-2.5 px-3 text-slate-600">B 的硬天花板。超過 80% 代表再來幾個工單就沒 worker 了</td>
              </tr>
              <tr className="bg-red-50/30">
                <td className="py-2.5 px-3 font-bold text-red-600">P0</td>
                <td className="py-2.5 px-3 font-medium text-sky-700">B</td>
                <td className="py-2.5 px-3 font-mono font-medium">task_timeout_rate</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 5%</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 10%</span></td>
                <td className="py-2.5 px-3 text-slate-600">單次 CORBA call 超時。升高代表 C 或 D 回應變慢</td>
              </tr>

              {/* P1 */}
              <tr>
                <td className="py-2.5 px-3 font-bold text-amber-600">P1</td>
                <td className="py-2.5 px-3 font-medium text-sky-700">B</td>
                <td className="py-2.5 px-3 font-mono font-medium">concurrent_orders</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">觀察中</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">觀察中</span></td>
                <td className="py-2.5 px-3 text-slate-600">上線初期先收集 peak 數據，確定 N 後再設閾值（WARN: N×0.8, CRIT: N）</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-amber-600">P1</td>
                <td className="py-2.5 px-3 font-medium text-emerald-700">C</td>
                <td className="py-2.5 px-3 font-mono font-medium">response_latency<br/><span className="text-slate-400">p50 / p95 / p99</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">p99 &gt; 基線×1.2</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">p99 &gt; 基線×1.5</span></td>
                <td className="py-2.5 px-3 text-slate-600">C 或 D 變慢的信號。上線後前 2 週收集基線（預估 p99={params.cP99Latency}s）</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-amber-600">P1</td>
                <td className="py-2.5 px-3 font-medium text-sky-700">B</td>
                <td className="py-2.5 px-3 font-mono font-medium">order_completion_time<br/><span className="text-slate-400">p50 / p95 / p99</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 基線×1.5</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 基線×2</span></td>
                <td className="py-2.5 px-3 text-slate-600">工單 e2e 時間。上線後前 2 週收集基線再設閾值</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-amber-600">P1</td>
                <td className="py-2.5 px-3 font-medium text-sky-700">B</td>
                <td className="py-2.5 px-3 font-mono font-medium">circuit_breaker_state</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">HALF_OPEN</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">OPEN</span></td>
                <td className="py-2.5 px-3 text-slate-600">熔斷 = 下游持續失敗，系統正在自我保護。需立即查 C/D 狀態</td>
              </tr>

              {/* P2 */}
              <tr className="bg-sky-50/20">
                <td className="py-2.5 px-3 font-bold text-sky-600">P2</td>
                <td className="py-2.5 px-3 font-medium text-orange-600">D</td>
                <td className="py-2.5 px-3 font-mono font-medium">device_error_rate</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 1%</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 5%</span></td>
                <td className="py-2.5 px-3 text-slate-600">D 連線失敗或超時。所有上游指標異常的最終根因可能在這裡</td>
              </tr>
              <tr className="bg-sky-50/20">
                <td className="py-2.5 px-3 font-bold text-sky-600">P2</td>
                <td className="py-2.5 px-3 font-medium text-orange-600">D</td>
                <td className="py-2.5 px-3 font-mono font-medium">device_response_time</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 基線×1.5</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 基線×2</span></td>
                <td className="py-2.5 px-3 text-slate-600">D 變慢會拉高 C latency，連鎖影響整條鏈路</td>
              </tr>
              <tr className="bg-sky-50/20">
                <td className="py-2.5 px-3 font-bold text-sky-600">P2</td>
                <td className="py-2.5 px-3 font-medium text-violet-600">API GW</td>
                <td className="py-2.5 px-3 font-mono font-medium">reject_rate (429)</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 0</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 5%</span></td>
                <td className="py-2.5 px-3 text-slate-600">GW 開始擋流量，代表工單數超過設定上限</td>
              </tr>
              <tr className="bg-sky-50/20">
                <td className="py-2.5 px-3 font-bold text-sky-600">P2</td>
                <td className="py-2.5 px-3 font-medium text-sky-700">B1</td>
                <td className="py-2.5 px-3 font-mono font-medium">tomcat_thread_util</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 80%</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 95%</span></td>
                <td className="py-2.5 px-3 text-slate-600">B1 接單入口。正常輕量不會滿，滿了代表有異常（如工單處理卡住）</td>
              </tr>
              <tr className="bg-sky-50/20">
                <td className="py-2.5 px-3 font-bold text-sky-600">P2</td>
                <td className="py-2.5 px-3 font-medium text-slate-500">MW</td>
                <td className="py-2.5 px-3 font-mono font-medium">thread_utilization</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 80%</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 95%</span></td>
                <td className="py-2.5 px-3 text-slate-600">MW 是 pass-through，正常不會是瓶頸。升高代表 MW 有問題</td>
              </tr>
              <tr className="bg-sky-50/20">
                <td className="py-2.5 px-3 font-bold text-sky-600">P2</td>
                <td className="py-2.5 px-3 font-medium text-slate-500">MW</td>
                <td className="py-2.5 px-3 font-mono font-medium">forwarding_latency</td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">&gt; 100ms</span></td>
                <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono">&gt; 500ms</span></td>
                <td className="py-2.5 px-3 text-slate-600">MW 自身延遲（不含 C）。應 &lt; 50ms，升高代表 MW thread pool 或 GC 問題</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quick decision tree */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">告警響了怎麼看</div>
          <div className="text-xs text-slate-600 space-y-1.5">
            <div><strong className="text-red-600">C pod_ready_count 掉了</strong> → 查 K8s events（OOM? CrashLoop? node 問題?）→ 不是 C 變慢，是 C 消失了</div>
            <div><strong className="text-red-600">C avg_queue_depth 飆高</strong> → 看 busy_ratio 是否也高 → 是：pods 不夠，加 C pods → 否：部分 pod 負載不均，查 load balancing</div>
            <div><strong className="text-red-600">C busy_ratio 飆高</strong> → 看 queue_depth → 確認是流量增加（看 B concurrent_orders）還是 C/D 變慢（看 C latency → D error_rate）</div>
            <div><strong className="text-red-600">B worker_util 飆高</strong> → 看 concurrent_orders 是否超預期 → 如果正常，看 C latency 是否變慢拖住 worker</div>
            <div><strong className="text-red-600">task_timeout_rate 升高</strong> → 看 C response_latency p99 → 如果 C 正常，看 D device_response_time → 最後看 MW forwarding_latency</div>
            <div><strong className="text-amber-600">order_completion_time 上升</strong> → 看 C queue_depth（排隊久了）→ 或看 C latency / D response_time（變慢了）</div>
            <div><strong className="text-amber-600">circuit_breaker OPEN</strong> → 下游持續失敗 → 查 C pod_ready_count 和 D device_error_rate</div>
          </div>
        </div>
        </div>}
      </div>
    </div>
  );
}

export default App;
