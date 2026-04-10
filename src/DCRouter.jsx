import { useState, useCallback } from "react";

const API_URL = process.env.REACT_APP_API_URL;
//  || "http://localhost:8000";

// DC coordinates for the map
const DC_COORDS = {
  "AWS-EU-West-1":        { dc_lat: 53.34,  dc_lon: -6.27,   mapX: 148, mapY: 108 },
  "AWS-US-West-1":        { dc_lat: 37.33,  dc_lon: -121.89, mapX: 332, mapY: 118 },
  "Azure-Australia-SE-1": { dc_lat: -37.81, dc_lon: 144.96,  mapX: 492, mapY: 192 },
  "Azure-West-Europe":    { dc_lat: 52.37,  dc_lon: 4.90,    mapX: 178, mapY: 103 },
  "GCP-Asia-East-1":      { dc_lat: 25.03,  dc_lon: 121.56,  mapX: 512, mapY: 128 },
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ── API call ──────────────────────────────────────────────────
async function callPredict({ userLat, userLon, networkLoad, packetLoss, bandwidth }) {
  // Find closest DC to get distance_km
  const closest = Object.entries(DC_COORDS)
    .map(([name, dc]) => ({
      name,
      dist: haversine(userLat, userLon, dc.dc_lat, dc.dc_lon)
    }))
    .sort((a, b) => a.dist - b.dist)[0];

  const payload = {
    distance_km:  closest.dist,
    network_load: networkLoad,
    packet_loss:  packetLoss,
    bandwidth:    bandwidth,
  };

  const res = await fetch(`${API_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ── Mini Map ──────────────────────────────────────────────────
function MiniMap({ result, userLat, userLon }) {
  if (!result) return (
    <div style={{ background:"#111c2b", borderRadius:10, height:200,
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ color:"#2e4a66", fontSize:13 }}>Run a prediction to see the routing map</span>
    </div>
  );

  const bestPos = DC_COORDS[result.optimal_dc_name];
  const userX = 270, userY = 155;

  return (
    <div style={{ background:"#111c2b", borderRadius:10, overflow:"hidden" }}>
      <svg width="100%" height="200" viewBox="0 0 640 200">
        <ellipse cx="150" cy="110" rx="90"  ry="50"  fill="#1e2d3d" opacity="0.7"/>
        <ellipse cx="345" cy="120" rx="110" ry="55"  fill="#1e2d3d" opacity="0.6"/>
        <ellipse cx="510" cy="140" rx="80"  ry="45"  fill="#1e2d3d" opacity="0.6"/>
        <ellipse cx="490" cy="192" rx="60"  ry="35"  fill="#1e2d3d" opacity="0.5"/>

        {bestPos && (
          <line x1={userX} y1={userY} x2={bestPos.mapX} y2={bestPos.mapY}
                stroke="#1D9E75" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.9"/>
        )}

        {Object.entries(DC_COORDS).map(([name, pos]) => {
          const isOpt = name === result.optimal_dc_name;
          return (
            <g key={name}>
              <circle cx={pos.mapX} cy={pos.mapY} r={isOpt ? 8 : 5}
                      fill={isOpt ? "#E24B4A" : "#2e4a66"} opacity={isOpt ? 1 : 0.7}/>
              {isOpt && (
                <text x={pos.mapX} y={pos.mapY - 13} textAnchor="middle"
                      fill="#9FE1CB" fontSize="10" fontFamily="monospace">
                  {result.region}
                </text>
              )}
            </g>
          );
        })}

        <circle cx={userX} cy={userY} r="5" fill="#378ADD"/>
        <text x={userX} y={userY + 15} textAnchor="middle"
              fill="#6ea8d8" fontSize="10" fontFamily="monospace">You</text>
      </svg>
    </div>
  );
}

// ── Slider ────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, color, format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: 5 }}>
        <span style={{ color:"#8ba4be", fontSize:13 }}>{label}</span>
        <span style={{ color:"#e0eaf4", fontSize:13, fontFamily:"monospace" }}>
          {format ? format(value) : value}
        </span>
      </div>
      <div style={{ position:"relative", height:4, background:"#1e3048", borderRadius:2 }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%",
                      width:`${pct}%`, background:color, borderRadius:2 }}/>
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={e => onChange(parseFloat(e.target.value))}
               style={{ position:"absolute", top:"50%", left:0, width:"100%",
                        height:"100%", transform:"translateY(-50%)",
                        opacity:0, cursor:"pointer", margin:0 }}/>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export default function DCRouter() {
  const [userLat,     setUserLat]     = useState(51.5074);
  const [userLon,     setUserLon]     = useState(-0.1278);
  const [networkLoad, setNetworkLoad] = useState(0.42);
  const [packetLoss,  setPacketLoss]  = useState(0.8);
  const [bandwidth,   setBandwidth]   = useState(850);
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const handlePredict = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callPredict({ userLat, userLon, networkLoad, packetLoss, bandwidth });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userLat, userLon, networkLoad, packetLoss, bandwidth]);

  const s = {
    app:       { display:"flex", flexDirection:"column", minHeight:"100vh",
                 background:"#0d1520", color:"#e0eaf4",
                 fontFamily:"'DM Sans','Segoe UI',sans-serif" },
    topbar:    { background:"#0f1e30", borderBottom:"1px solid #1a2d42",
                 padding:"12px 28px", display:"flex", alignItems:"center",
                 justifyContent:"space-between" },
    logo:      { fontSize:15, fontWeight:600, color:"#e0eaf4" },
    logoSpan:  { color:"#4a9ee8" },
    navLink:   { color:"#6ea8d8", fontSize:13, cursor:"pointer", marginLeft:24 },
    body:      { display:"grid", gridTemplateColumns:"300px 1fr", flex:1 },
    sidebar:   { background:"#0f1e30", borderRight:"1px solid #1a2d42",
                 padding:"24px 20px", display:"flex", flexDirection:"column", gap:20 },
    main:      { padding:24, display:"flex", flexDirection:"column",
                 gap:14, overflowY:"auto" },
    sTitle:    { fontSize:14, fontWeight:600, color:"#e0eaf4", marginBottom:2 },
    sSub:      { fontSize:12, color:"#4a6880", marginBottom:10 },
    inputRow:  { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
    inputWrap: { display:"flex", flexDirection:"column", gap:4 },
    inputLbl:  { fontSize:11, color:"#6ea8d8" },
    input:     { background:"#0d1a27", border:"1px solid #1e3048", borderRadius:8,
                 padding:"8px 10px", color:"#e0eaf4", fontSize:13,
                 fontFamily:"monospace", outline:"none", width:"100%",
                 boxSizing:"border-box" },
    btn:       { background:"transparent", border:"1.5px solid #e0eaf4",
                 borderRadius:10, padding:"12px 16px", color:"#e0eaf4",
                 fontSize:14, fontWeight:500, cursor:"pointer",
                 width:"100%", marginTop:"auto", transition:"all .2s" },
    errBox:    { background:"#2d1111", border:"1px solid #7f2020",
                 borderRadius:8, padding:"10px 14px", fontSize:12, color:"#f09595" },
    banner:    { background:"linear-gradient(135deg,#0d4a38,#0a3d30)",
                 border:"1px solid #1a6e52", borderRadius:12, padding:"18px 20px",
                 display:"flex", alignItems:"center", gap:16 },
    iconCircle:{ width:44, height:44, borderRadius:"50%", background:"#1D9E75",
                 display:"flex", alignItems:"center", justifyContent:"center",
                 flexShrink:0 },
    confPill:  { marginLeft:"auto", background:"#e8f5f0", color:"#0a3d30",
                 fontSize:13, fontWeight:600, padding:"8px 14px",
                 borderRadius:20, textAlign:"center", flexShrink:0 },
    metricsRow:{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 },
    metricCard:{ background:"#111c2b", borderRadius:10, padding:"12px 14px" },
    mLbl:      { fontSize:12, color:"#4a6880", marginBottom:4 },
    mVal:      { fontSize:22, fontWeight:600, color:"#e0eaf4" },
    mUnit:     { fontSize:12, color:"#4a6880", marginLeft:3 },
    altGrid:   { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 },
    altCard:   { background:"#111c2b", border:"1px solid #1a2d42",
                 borderRadius:10, padding:"12px 14px" },
    altLabel:  { fontSize:11, fontWeight:500, letterSpacing:".06em",
                 color:"#4a6880", textTransform:"uppercase", marginBottom:10 },
    placeholder:{ background:"#111c2b", borderRadius:12, padding:28,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:"#2e4a66", fontSize:13 },
  };

  const ordinal = n => ["1st","2nd","3rd","4th","5th"][n - 1] || `${n}th`;

  return (
    <div style={s.app}>
      {/* Topbar */}
      <div style={s.topbar}>
        <div style={s.logo}>
          DC<span style={s.logoSpan}>Router</span> — cloud infrastructure advisor
        </div>
        <div>
          {["Dashboard","History","Docs"].map(n => (
            <span key={n} style={s.navLink}>{n}</span>
          ))}
        </div>
      </div>

      <div style={s.body}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div>
            <div style={s.sTitle}>Your location</div>
            <div style={s.sSub}>Auto-detected from IP or enter manually</div>
            <div style={s.inputRow}>
              <div style={s.inputWrap}>
                <span style={s.inputLbl}>Latitude</span>
                <input style={s.input} type="number" step="0.0001"
                       value={userLat}
                       onChange={e => setUserLat(parseFloat(e.target.value))}/>
              </div>
              <div style={s.inputWrap}>
                <span style={s.inputLbl}>Longitude</span>
                <input style={s.input} type="number" step="0.0001"
                       value={userLon}
                       onChange={e => setUserLon(parseFloat(e.target.value))}/>
              </div>
            </div>
          </div>

          <div>
            <div style={s.sTitle}>Network conditions</div>
            <div style={s.sSub}>Adjust to match your current environment</div>
            <Slider label="Network load"
                    value={networkLoad} min={0} max={1} step={0.01}
                    onChange={setNetworkLoad} color="#4a9ee8"
                    format={v => v.toFixed(2)}/>
            <Slider label="Packet loss (%)"
                    value={packetLoss} min={0} max={10} step={0.1}
                    onChange={setPacketLoss} color="#e8a237"
                    format={v => v.toFixed(1) + "%"}/>
            <Slider label="Bandwidth (Mbps)"
                    value={bandwidth} min={100} max={1000} step={10}
                    onChange={setBandwidth} color="#2ecc71"
                    format={v => Math.round(v)}/>
          </div>

          {error && <div style={s.errBox}>API error: {error}</div>}

          <button style={s.btn}
                  onMouseEnter={e => { e.target.style.background="#e0eaf4"; e.target.style.color="#0d1520"; }}
                  onMouseLeave={e => { e.target.style.background="transparent"; e.target.style.color="#e0eaf4"; }}
                  onClick={handlePredict} disabled={loading}>
            {loading ? "Finding best data centre…" : "Find best data centre ↗"}
          </button>
        </div>

        {/* Main panel */}
        <div style={s.main}>

          {/* Recommendation banner */}
          {result ? (
            <div style={s.banner}>
              <div style={s.iconCircle}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="9" stroke="white" strokeWidth="1.5"/>
                  <path d="M7 11l3 3 5-5" stroke="white" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:500, color:"#5DCAA5",
                              textTransform:"uppercase", letterSpacing:".06em",
                              marginBottom:4 }}>
                  Recommended data centre
                </div>
                <div style={{ fontSize:24, fontWeight:700, color:"#e0eaf4",
                              lineHeight:1.2, marginBottom:4 }}>
                  {result.optimal_dc_name}
                </div>
                <div style={{ fontSize:13, color:"#5DCAA5" }}>
                  {result.location} — {result.distance_km.toLocaleString()} km away
                </div>
              </div>
              <div style={s.confPill}>
                {result.confidence}%<br/>
                <span style={{ fontSize:11, fontWeight:400 }}>confident</span>
              </div>
            </div>
          ) : (
            <div style={s.placeholder}>
              Enter your location and network conditions, then click
              "Find best data centre" to get a live prediction
            </div>
          )}

          {/* Metric cards */}
          {result && (
            <div style={s.metricsRow}>
              {[
                { label:"Est. latency", val:result.est_latency_ms,                unit:"ms" },
                { label:"Distance",     val:result.distance_km.toLocaleString(),   unit:"km" },
                { label:"Provider",     val:result.provider,                       unit:""   },
                { label:"DC region",    val:result.region,                         unit:""   },
              ].map(m => (
                <div key={m.label} style={s.metricCard}>
                  <div style={s.mLbl}>{m.label}</div>
                  <div style={s.mVal}>
                    {m.val}<span style={s.mUnit}>{m.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Map */}
          <MiniMap result={result} userLat={userLat} userLon={userLon}/>

          {/* Alternatives */}
          {result && result.all_ranked.length > 1 && (
            <div>
              <div style={s.altLabel}>Alternative data centres</div>
              <div style={s.altGrid}>
                {result.all_ranked.slice(1).map((dc, i) => (
                  <div key={dc.name} style={s.altCard}>
                    <div style={{ fontSize:11, color:"#4a6880", marginBottom:4 }}>
                      {ordinal(i + 2)} choice
                    </div>
                    <div style={{ fontSize:13, fontWeight:600,
                                  color:"#e0eaf4", marginBottom:2 }}>
                      {dc.name}
                    </div>
                    <div style={{ fontSize:11, color:"#4a6880", marginBottom:8 }}>
                      {dc.provider} · {dc.location.split(",")[0]}
                    </div>
                    <div style={{ fontSize:12, color:"#4a9ee8", fontFamily:"monospace" }}>
                      score {dc.score.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}