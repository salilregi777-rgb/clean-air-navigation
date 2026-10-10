import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  Circle,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import {
  Wind,
  Navigation,
  Clock,
  Route,
  Leaf,
  AlertTriangle,
  ChevronUp,
  MapPin,
} from 'lucide-react'
import './index.css'

/* ------------------------------------------------------------------ */
/* Custom map markers                                                 */
/* ------------------------------------------------------------------ */
function createIcon(color, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2.5px solid #fff;
      border-radius:50%;
      box-shadow:0 0 10px ${color}88;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const startIcon = createIcon('#38bdf8', 18)
const endIcon   = createIcon('#a78bfa', 18)
const nodeIcon  = createIcon('#64748b', 10)

/* ------------------------------------------------------------------ */
/* Auto-fit map bounds                                                */
/* ------------------------------------------------------------------ */
function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords && coords.length > 1) {
      const bounds = L.latLngBounds(coords)
      map.fitBounds(bounds, { padding: [80, 80] })
    }
  }, [coords, map])
  return null
}

/* ------------------------------------------------------------------ */
/* Shimmer Placeholder                                                */
/* ------------------------------------------------------------------ */
function ShimmerCard() {
  return (
    <div className="route-card space-y-3">
      <div className="shimmer h-4 w-32 rounded" />
      <div className="shimmer h-3 w-48 rounded" />
      <div className="shimmer h-3 w-40 rounded" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main App                                                           */
/* ------------------------------------------------------------------ */
export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const center = [12.9452, 77.6900] // Bangalore center

  useEffect(() => {
    fetch('/api/v1/route?start=Koramangala&end=Whitefield')
      .then((res) => {
        if (!res.ok) throw new Error('Backend unreachable')
        return res.json()
      })
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const fastest = data?.fastest_route
  const clean   = data?.clean_route
  const nodes   = data?.nodes

  // Collect all coords for bounding
  const allCoords = [
    ...(fastest?.coordinates || []),
    ...(clean?.coordinates || []),
  ]

  // Dark-mode tiles
  const tileUrl =
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  const tileAttr =
    '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'

  return (
    <>
      {/* ────────── Map ────────── */}
      <MapContainer center={center} zoom={13} zoomControl={false}>
        <TileLayer url={tileUrl} attribution={tileAttr} />
        <FitBounds coords={allCoords} />

        {/* Fastest route — red dashed */}
        {fastest && (
          <Polyline
            positions={fastest.coordinates}
            pathOptions={{
              color: '#ef4444',
              weight: 4,
              dashArray: '10, 10',
              opacity: 0.85,
            }}
          />
        )}

        {/* Clean route — thick green solid */}
        {clean && (
          <Polyline
            positions={clean.coordinates}
            pathOptions={{
              color: '#22c55e',
              weight: 6,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Node markers */}
        {nodes &&
          Object.entries(nodes).map(([name, info]) => {
            const isStart = name === fastest?.path?.[0]
            const isEnd   = name === fastest?.path?.[fastest.path.length - 1]
            const icon    = isStart ? startIcon : isEnd ? endIcon : nodeIcon

            return (
              <Marker key={name} position={[info.lat, info.lng]} icon={icon}>
                <Popup>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.5 }}>
                    <strong>{name}</strong>
                    <br />
                    AQI: {info.aqi}
                  </div>
                </Popup>
              </Marker>
            )
          })}

        {/* AQI halo around each node */}
        {nodes &&
          Object.entries(nodes).map(([name, info]) => (
            <Circle
              key={`halo-${name}`}
              center={[info.lat, info.lng]}
              radius={info.aqi * 3}
              pathOptions={{
                color: info.aqi > 100 ? '#ef4444' : '#22c55e',
                fillColor: info.aqi > 100 ? '#ef444433' : '#22c55e22',
                fillOpacity: 0.25,
                weight: 1,
                opacity: 0.4,
              }}
            />
          ))}
      </MapContainer>

      {/* ────────── Top Bar ────────── */}
      <div className="top-bar">
        <div className="glass flex items-center gap-3 px-5 py-3 max-w-lg mx-auto">
          <Leaf className="text-green-400 shrink-0" size={22} />
          <div>
            <h1 className="text-sm font-bold tracking-tight">
              Clean Air Navigation
            </h1>
            <p className="text-xs text-slate-400">
              Breathe easier. Route smarter.
            </p>
          </div>
          <span className="ml-auto aqi-badge aqi-good text-xs">
            <Wind size={12} />
            Live
          </span>
        </div>
      </div>

      {/* ────────── Bottom Sheet ────────── */}
      <div className={`bottom-sheet glass ${collapsed ? 'collapsed' : ''}`}>
        {/* Drag handle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full mb-3 cursor-pointer bg-transparent border-none"
          aria-label="Toggle route details"
        >
          <ChevronUp
            size={20}
            className={`text-slate-400 transition-transform duration-300 ${
              collapsed ? 'rotate-180' : ''
            }`}
          />
        </button>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
            <ShimmerCard />
            <ShimmerCard />
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <AlertTriangle className="text-amber-400 mx-auto mb-2" size={28} />
            <p className="text-sm text-slate-300">{error}</p>
            <p className="text-xs text-slate-500 mt-1">
              Is the backend running on port 8000?
            </p>
          </div>
        ) : (
          <>
            {/* Route origin/destination */}
            <div className="flex items-center gap-2 mb-3 max-w-2xl mx-auto px-1">
              <MapPin size={14} className="text-sky-400" />
              <span className="text-xs font-medium text-slate-300">
                {fastest?.path?.[0]}
              </span>
              <span className="text-slate-600 text-xs">→</span>
              <MapPin size={14} className="text-violet-400" />
              <span className="text-xs font-medium text-slate-300">
                {fastest?.path?.[fastest.path.length - 1]}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
              {/* Fastest Route Card */}
              <div className="route-card">
                <div className="flex items-center gap-2 mb-2">
                  <div className="pulse-dot bg-red-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Fastest Route
                  </span>
                </div>
                <p className="text-sm text-slate-200 font-medium mb-3">
                  {fastest?.path?.join(' → ')}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Route size={13} />
                    {fastest?.total_distance_km} km
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} />
                    {fastest?.estimated_time_min} min
                  </span>
                  <span className="aqi-badge aqi-bad">
                    <Wind size={11} />
                    AQI {fastest?.avg_aqi}
                  </span>
                </div>
              </div>

              {/* Clean Route Card */}
              <div className="route-card recommended">
                <div className="flex items-center gap-2 mb-2">
                  <div className="pulse-dot bg-green-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-green-400">
                    ✨ Recommended — Clean Route
                  </span>
                </div>
                <p className="text-sm text-slate-200 font-medium mb-3">
                  {clean?.path?.join(' → ')}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Route size={13} />
                    {clean?.total_distance_km} km
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} />
                    {clean?.estimated_time_min} min
                  </span>
                  <span className="aqi-badge aqi-good">
                    <Leaf size={11} />
                    AQI {clean?.avg_aqi}
                  </span>
                </div>
                <p className="text-[11px] text-green-400/60 mt-2 italic">
                  Breathe {Math.round(((fastest?.avg_aqi - clean?.avg_aqi) / fastest?.avg_aqi) * 100)}% cleaner air on this route
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
