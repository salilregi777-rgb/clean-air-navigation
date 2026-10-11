import { useEffect, useState, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  Tooltip,
  Circle,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Wind,
  Clock,
  Leaf,
  AlertTriangle,
  ChevronDown,
  MapPin,
  Navigation,
  LocateFixed,
  ArrowRight,
  Shield,
  Zap,
  TrendingDown,
  Heart,
  Cigarette,
  Activity,
  DollarSign,
  RefreshCw,
  BarChart3,
  Gauge,
  Scale,
  ChevronRight,
} from 'lucide-react'
import './index.css'

/* ------------------------------------------------------------------ */
/* Google Maps–style markers                                          */
/* ------------------------------------------------------------------ */
function createPinIcon(color, letter = '') {
  return L.divIcon({
    className: '',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:32px;height:32px;
      background:${color};border:3px solid #fff;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
    "><span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:13px;font-family:Inter,sans-serif;">${letter}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}
function createDotIcon(color, size = 10) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const startIcon = createPinIcon('#1a73e8', 'A')
const endIcon   = createPinIcon('#d93025', 'B')
const nodeIcon  = createDotIcon('#5f6368', 10)

/* ------------------------------------------------------------------ */
/* Map helpers                                                        */
/* ------------------------------------------------------------------ */
function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords?.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [60, 60], maxZoom: 14 })
    }
  }, [coords, map])
  return null
}

function LocateButton() {
  const map = useMap()
  return (
    <button className="map-control-btn" style={{ position: 'absolute', bottom: 100, right: 10, zIndex: 1000 }}
      onClick={() => map.setView([12.94, 77.68], 13)} title="Re-center">
      <LocateFixed size={18} />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* AQI helpers                                                        */
/* ------------------------------------------------------------------ */
function getAqiInfo(aqi) {
  if (aqi <= 50) return { label: 'Good', color: '#0f9d58', bg: '#e6f4ea' }
  if (aqi <= 100) return { label: 'Moderate', color: '#f9ab00', bg: '#fef7e0' }
  if (aqi <= 150) return { label: 'Unhealthy (SG)', color: '#e8710a', bg: '#fef0e1' }
  if (aqi <= 200) return { label: 'Unhealthy', color: '#d93025', bg: '#fce8e6' }
  return { label: 'Hazardous', color: '#a50e0e', bg: '#f8d7da' }
}

/* ------------------------------------------------------------------ */
/* Shimmer                                                            */
/* ------------------------------------------------------------------ */
function ShimmerBlock({ w = '100%', h = 14 }) {
  return <div className="shimmer" style={{ width: w, height: h, marginBottom: 6 }} />
}

/* ------------------------------------------------------------------ */
/* MAIN APP                                                           */
/* ------------------------------------------------------------------ */
export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedRoute, setSelectedRoute] = useState('clean')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [liveAqi, setLiveAqi] = useState(null)
  const [startNode, setStartNode] = useState('Koramangala')
  const [endNode, setEndNode] = useState('Whitefield')
  const [nodeList, setNodeList] = useState([])
  const [activeTab, setActiveTab] = useState('routes') // routes | health | live

  // Fetch node list on mount
  useEffect(() => {
    fetch('/api/v1/nodes')
      .then(r => r.json())
      .then(d => setNodeList(d.node_names || []))
      .catch(() => {})
  }, [])

  // Fetch route data
  const fetchRoutes = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/v1/route?start=${encodeURIComponent(startNode)}&end=${encodeURIComponent(endNode)}`)
      .then(r => { if (!r.ok) throw new Error('Backend unreachable'); return r.json() })
      .then(json => { if (json.error) throw new Error(json.error); setData(json); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [startNode, endNode])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  // Live AQI polling every 10s
  useEffect(() => {
    const poll = () => fetch('/api/v1/aqi/live').then(r => r.json()).then(d => setLiveAqi(d)).catch(() => {})
    poll()
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [])

  const fastest  = data?.fastest_route
  const clean    = data?.clean_route
  const balanced = data?.balanced_route
  const nodes    = data?.nodes
  const savings  = data?.health_savings

  const allCoords = [...(fastest?.coordinates || []), ...(clean?.coordinates || []), ...(balanced?.coordinates || [])]

  const selected = selectedRoute === 'clean' ? clean : selectedRoute === 'fastest' ? fastest : balanced
  const aqiDrop  = fastest?.avg_aqi && clean?.avg_aqi ? Math.round(((fastest.avg_aqi - clean.avg_aqi) / fastest.avg_aqi) * 100) : 0

  // Free OSM tiles — no API key
  const tileUrl  = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  return (
    <div className="app-container">
      {/* ═══════ SIDEBAR ═══════ */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="logo-row">
            <div className="logo-icon"><Leaf size={20} color="#fff" /></div>
            <div>
              <h1 className="logo-title">Clean Air Navigation</h1>
              <p className="logo-subtitle">Pollution-aware routing · AWS Hackathon</p>
            </div>
          </div>
        </div>

        {/* Origin / Destination selects */}
        <div className="direction-inputs">
          <div className="input-row">
            <div className="input-dot start" />
            <select className="input-select" value={startNode} onChange={e => setStartNode(e.target.value)}>
              {nodeList.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="input-connector" />
          <div className="input-row">
            <div className="input-dot end" />
            <select className="input-select" value={endNode} onChange={e => setEndNode(e.target.value)}>
              {nodeList.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="tab-bar">
          <button className={`tab ${activeTab === 'routes' ? 'active' : ''}`} onClick={() => setActiveTab('routes')}>
            <Navigation size={14} /> Routes
          </button>
          <button className={`tab ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
            <Heart size={14} /> Health
          </button>
          <button className={`tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
            <Activity size={14} /> Live AQI
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {loading ? (
            <div style={{ padding: 16 }}>
              <ShimmerBlock w="60%" h={16} /><ShimmerBlock w="90%" /><ShimmerBlock w="75%" />
              <ShimmerBlock w="60%" h={16} /><ShimmerBlock w="90%" /><ShimmerBlock w="75%" />
            </div>
          ) : error ? (
            <div className="error-state">
              <AlertTriangle size={32} color="#f9ab00" />
              <p className="error-title">Can't load routes</p>
              <p className="error-desc">{error}</p>
              <button className="retry-btn" onClick={fetchRoutes}><RefreshCw size={14} /> Retry</button>
            </div>
          ) : activeTab === 'routes' ? (
            <RoutesTab fastest={fastest} clean={clean} balanced={balanced}
              selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute}
              savings={savings} aqiDrop={aqiDrop} />
          ) : activeTab === 'health' ? (
            <HealthTab fastest={fastest} clean={clean} savings={savings} />
          ) : (
            <LiveAqiTab liveAqi={liveAqi} nodes={nodes} />
          )}
        </div>

        <div className="sidebar-footer">
          <span>Built for AWS Hackathon 2026</span>
          <span className="footer-dot">·</span>
          <span>OpenStreetMap</span>
        </div>
      </div>

      {/* Sidebar toggle */}
      <button className="sidebar-toggle" style={{ left: sidebarOpen ? 396 : 8 }}
        onClick={() => setSidebarOpen(!sidebarOpen)}>
        <ChevronDown size={16} style={{ transform: sidebarOpen ? 'rotate(90deg)' : 'rotate(-90deg)' }} />
      </button>

      {/* ═══════ MAP ═══════ */}
      <div className="map-wrapper">
        <MapContainer center={[12.94, 77.68]} zoom={13} zoomControl={true}>
          <TileLayer url={tileUrl} attribution={tileAttr} />
          <FitBounds coords={allCoords} />

          {/* Unselected routes (gray) */}
          {[
            { key: 'fastest', d: fastest },
            { key: 'clean', d: clean },
            { key: 'balanced', d: balanced },
          ].filter(r => r.d && r.key !== selectedRoute).map(r => (
            <Polyline key={r.key} positions={r.d.coordinates}
              pathOptions={{ color: '#9aa0a6', weight: 4, opacity: 0.4, dashArray: '6,10', lineCap: 'round' }} />
          ))}

          {/* Selected route */}
          {selected && (
            <>
              <Polyline positions={selected.coordinates}
                pathOptions={{ color: '#fff', weight: 9, opacity: 0.4, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline positions={selected.coordinates}
                pathOptions={{
                  color: selectedRoute === 'clean' ? '#0f9d58' : selectedRoute === 'fastest' ? '#4285f4' : '#f9ab00',
                  weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round',
                }} />
            </>
          )}

          {/* Markers */}
          {nodes && Object.entries(nodes).map(([name, info]) => {
            const isStart = name === startNode
            const isEnd   = name === endNode
            const icon    = isStart ? startIcon : isEnd ? endIcon : nodeIcon
            const ai      = getAqiInfo(liveAqi?.live_aqi?.[name]?.aqi ?? info.aqi)
            return (
              <Marker key={name} position={[info.lat, info.lng]} icon={icon}>
                <Popup className="gmap-popup">
                  <div className="popup-content">
                    <strong className="popup-name">{name}</strong>
                    <p className="popup-desc">{info.description}</p>
                    <div className="popup-aqi" style={{ color: ai.color, background: ai.bg }}>
                      AQI {liveAqi?.live_aqi?.[name]?.aqi ?? info.aqi} — {ai.label}
                    </div>
                    <div className="popup-pm">PM2.5: {info.pm25} µg/m³ · PM10: {info.pm10} µg/m³</div>
                  </div>
                </Popup>
                {!isStart && !isEnd && (
                  <Tooltip direction="top" offset={[0, -8]} className="gmap-tooltip">{name}</Tooltip>
                )}
              </Marker>
            )
          })}

          {/* AQI halos */}
          {nodes && Object.entries(nodes).map(([name, info]) => {
            const ai = getAqiInfo(info.aqi)
            return (
              <Circle key={`h-${name}`} center={[info.lat, info.lng]} radius={info.aqi * 2.5}
                pathOptions={{ color: ai.color, fillColor: ai.color, fillOpacity: 0.07, weight: 1, opacity: 0.2 }} />
            )
          })}

          <LocateButton />
        </MapContainer>
      </div>
    </div>
  )
}

/* ================================================================== */
/* ROUTES TAB                                                         */
/* ================================================================== */
function RoutesTab({ fastest, clean, balanced, selectedRoute, setSelectedRoute, savings, aqiDrop }) {
  const routes = [
    { key: 'clean', data: clean, icon: Shield, iconColor: 'green', label: 'Clean Air Route', tag: 'Recommended', tagClass: 'green' },
    { key: 'fastest', data: fastest, icon: Zap, iconColor: 'blue', label: 'Fastest Route', tag: null },
    { key: 'balanced', data: balanced, icon: Scale, iconColor: 'yellow', label: 'Balanced Route', tag: null },
  ]

  return (
    <div className="routes-tab">
      {routes.map(r => (
        <button key={r.key}
          className={`route-option ${selectedRoute === r.key ? `selected ${r.iconColor}` : ''}`}
          onClick={() => setSelectedRoute(r.key)}>
          <div className="route-option-header">
            <r.icon size={16} className={`route-icon ${r.iconColor}`} />
            <span className="route-label">{r.label}</span>
            {r.tag && <span className={`route-tag ${r.tagClass}`}>{r.tag}</span>}
          </div>
          <div className="route-path">
            {r.data?.path?.map((p, i) => (
              <span key={i}>{i > 0 && <ArrowRight size={11} className="path-arrow" />}{p}</span>
            ))}
          </div>
          <div className="route-stats">
            <div className="stat"><Navigation size={13} /><span>{r.data?.total_distance_km} km</span></div>
            <div className="stat"><Clock size={13} /><span>{r.data?.estimated_time_min} min</span></div>
            <div className={`stat aqi-chip ${r.data?.avg_aqi <= 100 ? 'good' : 'bad'}`}>
              <Wind size={12} /><span>AQI {r.data?.avg_aqi}</span>
            </div>
          </div>
          {r.key === 'clean' && aqiDrop > 0 && (
            <div className="route-benefit"><TrendingDown size={13} /><span>{aqiDrop}% less pollution exposure</span></div>
          )}
          {r.key === 'fastest' && r.data?.avg_aqi > 150 && (
            <div className="route-warning"><AlertTriangle size={13} /><span>High pollution along this route</span></div>
          )}
        </button>
      ))}

      {/* Comparison */}
      {savings && (
        <div className="comparison-bar">
          <div className="comparison-title">
            <BarChart3 size={14} /> By choosing the clean route you save:
          </div>
          <div className="savings-grid">
            <div className="saving-item">
              <span className="saving-val green">{savings.aqi_reduction_percent}%</span>
              <span className="saving-label">Less AQI</span>
            </div>
            <div className="saving-item">
              <span className="saving-val green">{savings.pm25_dose_saved_ug.toFixed(1)} µg</span>
              <span className="saving-label">PM2.5 saved</span>
            </div>
            <div className="saving-item">
              <span className="saving-val green">₹{savings.health_cost_saved_inr.toFixed(0)}</span>
              <span className="saving-label">Health cost</span>
            </div>
            <div className="saving-item">
              <span className="saving-val green">{savings.cigarette_equivalent_saved.toFixed(3)}</span>
              <span className="saving-label">Cigarettes</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* HEALTH TAB                                                         */
/* ================================================================== */
function HealthTab({ fastest, clean, savings }) {
  if (!fastest || !clean) return null
  const fh = fastest.health_impact
  const ch = clean.health_impact

  return (
    <div className="health-tab">
      <div className="health-section-title">
        <Heart size={15} className="text-red" /> Health Impact Comparison
      </div>

      {/* Risk Score Visual */}
      <div className="risk-compare">
        <RiskGauge label="Fastest Route" score={fh.risk_score} level={fh.risk_level} color={fh.risk_color} />
        <div className="risk-vs">VS</div>
        <RiskGauge label="Clean Route" score={ch.risk_score} level={ch.risk_level} color={ch.risk_color} />
      </div>

      {/* Detail Rows */}
      <div className="health-details">
        <HealthRow icon={<Wind size={15} />} label="PM2.5 Inhaled" fast={`${fh.pm25_dose_ug.toFixed(1)} µg`} clean={`${ch.pm25_dose_ug.toFixed(1)} µg`} />
        <HealthRow icon={<Cigarette size={15} />} label="Cigarette Equivalent" fast={fh.cigarette_equivalent.toFixed(3)} clean={ch.cigarette_equivalent.toFixed(3)} />
        <HealthRow icon={<Gauge size={15} />} label="WHO Guideline" fast={`${fh.pm25_vs_who_percent}%`} clean={`${ch.pm25_vs_who_percent}%`} isBadAbove={100} fastVal={fh.pm25_vs_who_percent} cleanVal={ch.pm25_vs_who_percent} />
        <HealthRow icon={<DollarSign size={15} />} label="Health Cost" fast={`₹${fh.health_cost_inr.toFixed(2)}`} clean={`₹${ch.health_cost_inr.toFixed(2)}`} />
        <HealthRow icon={<Wind size={15} />} label="Air Inhaled" fast={`${fh.total_air_inhaled_liters} L`} clean={`${ch.total_air_inhaled_liters} L`} neutral />
      </div>

      {/* Annual Projection */}
      {savings && (
        <div className="annual-box">
          <div className="annual-title">📊 Annual Impact (5 trips/week)</div>
          <div className="annual-grid">
            <div className="annual-item"><span className="annual-val">{savings.annual_cigarettes_avoided.toFixed(1)}</span><span className="annual-lbl">Cigarettes avoided</span></div>
            <div className="annual-item"><span className="annual-val">₹{savings.annual_health_cost_saved_inr}</span><span className="annual-lbl">Health cost saved</span></div>
            <div className="annual-item"><span className="annual-val">{(savings.annual_pm25_saved_ug / 1000).toFixed(1)} mg</span><span className="annual-lbl">PM2.5 not inhaled</span></div>
            <div className="annual-item"><span className="annual-val">+{savings.annual_extra_hours} hrs</span><span className="annual-lbl">Extra travel time</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

function RiskGauge({ label, score, level, color }) {
  return (
    <div className="risk-gauge">
      <div className="gauge-ring" style={{ '--score': score, '--color': color }}>
        <svg viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="#e8eaed" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${score}, 100`}
            strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        </svg>
        <span className="gauge-number" style={{ color }}>{score}</span>
      </div>
      <span className="gauge-level" style={{ color }}>{level}</span>
      <span className="gauge-label">{label}</span>
    </div>
  )
}

function HealthRow({ icon, label, fast, clean, neutral, isBadAbove, fastVal, cleanVal }) {
  return (
    <div className="health-row">
      <div className="health-row-label">{icon}<span>{label}</span></div>
      <div className={`health-row-val ${neutral ? '' : 'bad'}`}>{fast}</div>
      <div className="health-row-arrow"><ChevronRight size={12} /></div>
      <div className={`health-row-val ${neutral ? '' : 'good'}`}>{clean}</div>
    </div>
  )
}

/* ================================================================== */
/* LIVE AQI TAB                                                       */
/* ================================================================== */
function LiveAqiTab({ liveAqi, nodes }) {
  if (!liveAqi || !nodes) return <div style={{ padding: 16, color: '#5f6368' }}>Loading live data…</div>

  const sorted = Object.entries(liveAqi.live_aqi).sort((a, b) => a[1].aqi - b[1].aqi)

  return (
    <div className="live-tab">
      <div className="live-header">
        <Activity size={14} className="live-pulse" />
        <span>Real-time Air Quality</span>
        <span className="live-ts">{new Date(liveAqi.updated_at).toLocaleTimeString()}</span>
      </div>
      <div className="live-list">
        {sorted.map(([name, d]) => {
          const ai = getAqiInfo(d.aqi)
          const trend = d.trend === 'rising' ? '↑' : d.trend === 'falling' ? '↓' : '→'
          const trendColor = d.trend === 'rising' ? '#d93025' : d.trend === 'falling' ? '#0f9d58' : '#9aa0a6'
          return (
            <div key={name} className="live-item">
              <div className="live-item-left">
                <div className="live-dot" style={{ background: ai.color }} />
                <div>
                  <div className="live-name">{name}</div>
                  <div className="live-desc">{nodes[name]?.description}</div>
                </div>
              </div>
              <div className="live-item-right">
                <span className="live-aqi-val" style={{ color: ai.color }}>{d.aqi}</span>
                <span className="live-aqi-label" style={{ color: ai.color, background: ai.bg }}>{ai.label}</span>
                <span className="live-trend" style={{ color: trendColor }}>{trend}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="live-legend">
        <span><span className="legend-dot" style={{ background: '#0f9d58' }} /> Good (0–50)</span>
        <span><span className="legend-dot" style={{ background: '#f9ab00' }} /> Moderate (51–100)</span>
        <span><span className="legend-dot" style={{ background: '#d93025' }} /> Unhealthy (151+)</span>
      </div>
    </div>
  )
}
