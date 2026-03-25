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

      // B overflow status - #5: 50~80% is normal (emerald)
      let bStatus, bStatusColor;
      if (bOverflow) { bStatus = `❌ 不夠 (缺${bOverflowBy})`; bStatusColor = "text-red-600"; }
      else if (bUtil > 0.8) { bStatus = "⚠️ 接近上限"; bStatusColor = "text-amber-600"; }
      else if (bUtil > 0.5) { bStatus = "✓ 正常"; bStatusColor = "text-emerald-600"; }
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
    if (pct <= 0.5) return { bar: "bg-emerald-400", text: "text-emerald-700" };
    if (pct <= 0.7) return { bar: "bg-amber-400", text: "text-amber-700" };
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
      <div className="w-16 text-right">
        <span className="text-sm font-bold text-sky-700">{params[paramKey]}</span>
        {unit && <span className="text-xs text-slate-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'Noto Sans TC', sans-serif" }} className="max-w-6xl mx-auto p-4">

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">全鏈路容量模擬器</h1>
        <p className="text-sm text-slate-500 mt-1">調整參數即時看架構流量與模擬結果</p>
      </div>

      {/* ═══ Design Assumptions ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">設計假設 — 訊息流模型</div>

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
      </div>

      {/* ═══ Architecture Flow ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">架構訊息流</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">N =</span>
            {Ns.map(n => (
              <button key={n} onClick={() => setSelectedN(n)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${selectedN === n ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

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
            <div className={`w-36 border-2 rounded-xl p-3 text-center ${currentSim.bOverflow ? 'bg-red-50 border-red-300' : currentSim.bUtil > 0.8 ? 'bg-amber-50 border-amber-300' : currentSim.bUtil > 0.5 ? 'bg-amber-50 border-amber-200' : 'bg-sky-50 border-sky-200'}`}>
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
                  <th key={n} className={`text-center py-2.5 px-3 font-medium cursor-pointer ${selectedN===n ? 'bg-sky-100 text-sky-700' : 'hover:bg-slate-100'}`}
                    onClick={() => setSelectedN(n)}>N={n}{selectedN===n && ' ◄'}</th>
                ))}
                <th className="text-left py-2.5 px-4 font-medium text-slate-400" style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>公式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                {l:'B workers 需求',k:'bWorkers',r:v=>bg(v,params.bPool*.5,params.bPool*.8),f:`N×${params.jobsPerOrder}`},
                {l:'B 利用率',k:'bUtil',fm:v=>`${(v*100).toFixed(0)}%`,r:v=>bg(v,.5,.7),f:'workers/pool (capped 100%)'},
                {l:'B buffer',k:'bBuffer',r:v=>bgReverse(v,5,params.bPool*.3),f:'pool-workers (min 0)'},
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
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
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
    </div>
  );
}

export default App;
