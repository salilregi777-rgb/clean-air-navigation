import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Leaf, Wind, ArrowRight, ArrowUpDown, Navigation, Clock, MapPin, LocateFixed, Layers, Zap, Scale, Check, Activity, TrendingDown, Info, RefreshCw, AlertCircle } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './index.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const INITIAL_TRIP = { start: 'Koramangala', end: 'Whitefield' }
const OPTIONS = [
  { key: 'clean', title: 'Cleaner air', subtitle: 'Lower estimated particle exposure', color: '#287555', icon: Leaf },
  { key: 'fastest', title: 'Shortest trip', subtitle: 'The most direct connection', color: '#597cbc', icon: Zap },
  { key: 'balanced', title: 'Balanced', subtitle: 'A mix of distance and air quality', color: '#ba853b', icon: Scale },
]
const DEFAULT_CENTER = [12.945, 77.665]
function aqiInfo(aqi) {
  if (aqi <= 50) return { label: 'Good', color: '#287555' }
  if (aqi <= 100) return { label: 'Moderate', color: '#9c7526' }
  if (aqi <= 150) return { label: 'Sensitive groups', color: '#bb682d' }
  if (aqi <= 200) return { label: 'Unhealthy', color: '#bb514d' }
  if (aqi <= 300) return { label: 'Very unhealthy', color: '#925587' }
  return { label: 'Hazardous', color: '#893d51' }
}
async function request(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, { signal })
  if (!response.ok) {
    let message = `The service returned ${response.status}. Please try again.`
    try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail } catch { /* use fallback */ }
    throw new Error(message)
  }
  const body = await response.json()
  if (body.error) throw new Error(body.error)
  return body
}
function pin(label, color) {
  return L.divIcon({ className: 'route-pin', html: `<span style="background:${color}">${label}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] })
}
const startPin = pin('A', '#287555')
const endPin = pin('B', '#c98445')
const areaPin = L.divIcon({ className: 'area-pin', html: '<span></span>', iconSize: [12, 12], iconAnchor: [6, 6] })

function MapTools({ coordinates, showAir, onToggleAir }) {
  const map = useMap()
  const fit = useCallback(() => {
    if (coordinates.length > 1) map.fitBounds(coordinates, { paddingTopLeft: [50, 100], paddingBottomRight: [50, 150], maxZoom: 14, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches })
  }, [coordinates, map])
  useEffect(() => { fit() }, [fit])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return <div className="map-tools">
    <button title="Fit routes to map" aria-label="Fit routes to map" onClick={fit}><LocateFixed size={18} /></button>
    <button title="Toggle air quality layer" aria-label="Toggle air quality layer" aria-pressed={showAir} onClick={onToggleAir}><Layers size={18} /></button>
  </div>
}

export default function App() {
  const [draft, setDraft] = useState(INITIAL_TRIP)
  const [trip, setTrip] = useState(INITIAL_TRIP)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selection, setSelection] = useState('clean')
  const [tab, setTab] = useState('routes')
  const [showAir, setShowAir] = useState(true)
  const [feed, setFeed] = useState(null)
  const [feedError, setFeedError] = useState(false)
  const [tripsPerWeek, setTripsPerWeek] = useState(10)
  const [catalog, setCatalog] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    request('/api/v1/nodes', controller.signal).then(result => setCatalog(result.nodes)).catch(() => {})
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('timeout'), 15000)
    const params = new URLSearchParams(trip)
    request(`/api/v1/route?${params}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setCatalog(result.nodes) } })
      .catch(reason => { if (!controller.signal.aborted || controller.signal.reason === 'timeout') setError(controller.signal.reason === 'timeout' ? 'The route request timed out. Please try again.' : reason.message) })
      .finally(() => { clearTimeout(timeout); if (!controller.signal.aborted || controller.signal.reason === 'timeout') setLoading(false) })
    return () => { clearTimeout(timeout); controller.abort() }
  }, [trip, retry])

  useEffect(() => {
    let stopped = false
    let timer
    let controller
    const poll = async () => {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const result = await request('/api/v1/aqi/live', controller.signal)
        if (!stopped) { setFeed(result); setFeedError(false) }
      } catch { if (!stopped) setFeedError(true) }
      finally { clearTimeout(timeout); if (!stopped) timer = setTimeout(poll, 30000) }
    }
    poll()
    return () => { stopped = true; clearTimeout(timer); controller?.abort() }
  }, [retry])

  // Stable coordinates prevent sensor updates and tab changes from resetting a user's map view.
  const coordinates = useMemo(() => OPTIONS.flatMap(option => data?.[`${option.key}_route`]?.coordinates || []), [data])
  const selected = data?.[`${selection}_route`]
  const selectedOption = OPTIONS.find(option => option.key === selection)
  const samePlace = draft.start === draft.end
  const staleRoutes = loading || Boolean(error)
  const nodes = catalog || {}
  const names = Object.keys(nodes).length ? Object.keys(nodes) : [INITIAL_TRIP.start, INITIAL_TRIP.end]
  const fastDose = data?.fastest_route.health_impact.pm25_dose_ug || 0
  const cleanDose = data?.clean_route.health_impact.pm25_dose_ug || 0
  const reduction = fastDose ? Math.max(0, Math.round((1 - cleanDose / fastDose) * 100)) : 0
  const extraMinutes = data ? data.clean_route.estimated_time_min - data.fastest_route.estimated_time_min : 0
  const refresh = () => { setLoading(true); setError(null); setRetry(value => value + 1) }
  const submit = event => { event.preventDefault(); if (samePlace) return; setLoading(true); setError(null); setTrip({ ...draft }); setSelection('clean'); setTab('routes') }

  return <div className="app-shell">
    <header className="topbar">
      <a href="#main" className="brand" aria-label="Clean Air Navigation home"><span className="brand-mark"><Leaf size={23} /></span><span>cleanair<span className="brand-small">NAVIGATION</span></span></a>
      <div className="event-tag"><span>aws</span><i /> Environmental Hacks <b>PART 02</b></div>
      <span className="city-label"><MapPin size={14} /> Bengaluru, India</span>
    </header>
    <main id="main" className="workspace">
      <aside className="planner" aria-label="Route planner">
        <div className="planner-intro"><span className="eyebrow"><span className="tiny-dot" /> SMALL CHOICES. CLEANER JOURNEYS.</span><h1>A better way<br />to get there<span>.</span></h1><p>Find a little more fresh air on your daily commute.</p><Leaf className="intro-leaf" size={90} strokeWidth={.7} aria-hidden="true" /></div>
        <form className="trip-form" onSubmit={submit}>
          <div className="location-field"><span className="point origin">A</span><label htmlFor="origin">STARTING POINT<select id="origin" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })}>{names.map(name => <option key={name}>{name}</option>)}</select></label></div>
          <button className="swap-button" type="button" aria-label="Swap starting point and destination" title="Swap locations" onClick={() => setDraft({ start: draft.end, end: draft.start })}><ArrowUpDown size={16} /></button>
          <div className="location-field"><span className="point destination">B</span><label htmlFor="destination">DESTINATION<select id="destination" value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })}>{names.map(name => <option key={name}>{name}</option>)}</select></label></div>
          {samePlace && <p className="field-error" role="alert">Choose two different neighborhoods.</p>}
          <button className="primary-button" disabled={samePlace || loading}>{loading ? <><RefreshCw size={16} className="spin" /> Finding your routes</> : <>Compare routes <ArrowRight size={16} /></>}</button>
        </form>
        <nav className="tab-bar" aria-label="Route information">{[['routes', Navigation, 'Routes'], ['impact', TrendingDown, 'Exposure'], ['air', Activity, 'Air quality']].map(([key, Icon, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}</nav>
        <div className="panel-content" aria-busy={loading && tab !== 'air'}>
          {tab === 'air' ? <AirQuality feed={feed} failed={feedError} nodes={nodes} onRetry={refresh} /> : error ? <div className="error-state" role="alert"><AlertCircle size={28} /><h2>Let’s try that again</h2><p>{error}</p><button className="secondary-button" onClick={refresh}><RefreshCw size={15} /> Retry connection</button></div> : loading ? <div className="loading-cards" role="status" aria-label="Calculating routes">{[1,2,3].map(key => <div className="skeleton" key={key} />)}</div> : data && (tab === 'routes' ? <>
            <div className="section-heading"><h2>Your route options</h2><span>3 ways to go</span></div>
            <div className="route-list">{OPTIONS.map(option => {
              const route = data[`${option.key}_route`]
              const Icon = option.icon
              return <button className={`route-card ${selection === option.key ? 'selected' : ''}`} style={{ '--route-color': option.color }} key={option.key} aria-pressed={selection === option.key} onClick={() => setSelection(option.key)}>
                <div className="route-heading"><span className="route-icon"><Icon size={18} /></span><strong>{option.title}</strong>{option.key === 'clean' && <span className="recommend-tag">LOW EXPOSURE</span>}<span className="radio-dot">{selection === option.key && <Check size={10} />}</span></div>
                <div className="route-numbers"><b>{route.estimated_time_min}<small> min</small></b><span>{route.total_distance_km} km</span><span className="aqi-pill" style={{ color: aqiInfo(route.avg_aqi).color }}>AQI {route.avg_aqi}</span></div>
                <p className="route-via">{route.path.length > 2 ? `via ${route.path.slice(1,-1).join(' · ')}` : 'Direct connection'}</p>
              </button>
            })}</div>
            <div className="impact-callout"><span className="impact-icon"><Leaf size={22} /></span><div><strong>{reduction > 0 ? `${reduction}% less estimated PM2.5 exposure` : 'These routes have similar exposure'}</strong><p>{extraMinutes > 0 ? `For ${extraMinutes} extra minutes on the cleaner route.` : 'Compare the routes to find your best fit.'}</p></div></div>
          </> : <Exposure data={data} trips={tripsPerWeek} onTripsChange={setTripsPerWeek} />)}
        </div>
        <footer className="planner-footer"><Info size={13} /><span>Hackathon prototype · simulated air quality</span></footer>
      </aside>
      <section className="map-panel" aria-label="Bengaluru route map">
        <MapContainer center={DEFAULT_CENTER} zoom={12} zoomControl={false}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          <ZoomControl position="bottomright" />
          {showAir && Object.entries(nodes).map(([name, info]) => { const aqi = feed?.live_aqi[name]?.aqi ?? info.aqi; const color = aqiInfo(aqi).color; return <Circle key={name} center={[info.lat, info.lng]} radius={450} pathOptions={{ color, fillColor: color, fillOpacity: .12, opacity: .25, weight: 1 }} /> })}
          {!staleRoutes && OPTIONS.filter(option => option.key !== selection).map(option => data?.[`${option.key}_route`] && <Polyline key={option.key} positions={data[`${option.key}_route`].coordinates} pathOptions={{ color: option.color, opacity: .4, weight: 4, dashArray: '6 8' }} />)}
          {!staleRoutes && selected && <><Polyline positions={selected.coordinates} pathOptions={{ color: '#ffffff', weight: 10, opacity: .85 }} /><Polyline positions={selected.coordinates} pathOptions={{ color: selectedOption.color, weight: 5, opacity: 1 }} /></>}
          {Object.entries(nodes).map(([name, info]) => { const aqi = feed?.live_aqi[name]?.aqi ?? info.aqi; return <Marker key={name} title={name} alt={`Air quality at ${name}`} position={[info.lat, info.lng]} icon={!staleRoutes && name === trip.start ? startPin : !staleRoutes && name === trip.end ? endPin : areaPin}><Popup><strong>{name}</strong><p>{info.description}</p><b style={{ color: aqiInfo(aqi).color }}>AQI {aqi} · {aqiInfo(aqi).label}</b><p>Simulated neighborhood reading{feedError ? ' · last available' : ''}</p></Popup></Marker> })}
          <MapTools coordinates={coordinates} showAir={showAir} onToggleAir={() => setShowAir(value => !value)} />
        </MapContainer>
        <div className="map-heading"><div><span className="eyebrow">EXPLORE YOUR CITY</span><h2>Bengaluru<span> / </span><small>A breath of possibility</small></h2></div><span className={`feed-badge ${feedError ? 'offline' : ''}`}><span className="tiny-dot" />{feedError ? 'Feed unavailable' : 'Demo sensor feed'}</span></div>
        <div className="map-footer">
          {selected && !staleRoutes && <div className="selected-summary"><div className="summary-icon" style={{ color: selectedOption.color }}><selectedOption.icon size={22} /></div><div><span className="eyebrow">YOUR SELECTED ROUTE</span><strong>{selectedOption.title}<span>{selected.estimated_time_min} min <i>·</i> {selected.total_distance_km} km</span></strong></div><span className="summary-check"><Check size={18} /></span></div>}
          <div className="map-caption"><span>Illustrative connections · not turn-by-turn directions</span><span className="map-legend"><i style={{background:'#287555'}} />Good <i style={{background:'#9c7526'}} />Moderate <i style={{background:'#bb514d'}} />Unhealthy</span></div>
        </div>
      </section>
    </main>
  </div>
}

function Exposure({ data, trips, onTripsChange }) {
  const fastest = data.fastest_route
  const clean = data.clean_route
  const doseSaved = Math.max(0, fastest.health_impact.pm25_dose_ug - clean.health_impact.pm25_dose_ug)
  const maxDose = Math.max(fastest.health_impact.pm25_dose_ug, clean.health_impact.pm25_dose_ug, 1)
  return <div className="exposure-panel"><div className="section-heading"><h2>Make the cleaner choice</h2><Leaf size={16} /></div><p className="section-description">Estimated PM2.5 inhaled on one trip, using the sample route data.</p>
    <div className="dose-chart">{[['Shortest trip', fastest, '#597cbc'], ['Cleaner air', clean, '#287555']].map(([label, route, color]) => <div className="dose-row" key={label}><div><span>{label}</span><strong>{route.health_impact.pm25_dose_ug.toFixed(1)} µg</strong></div><div className="bar-track"><div style={{ width: `${route.health_impact.pm25_dose_ug / maxDose * 100}%`, background: color }} /></div></div>)}</div>
    <div className="annual-card"><span className="eyebrow">SMALL CHANGES ADD UP</span><strong>{(doseSaved * trips * 52 / 1000).toFixed(1)}<small> mg / year</small></strong><p>Less estimated PM2.5 inhaled if you take the cleaner route.</p><label htmlFor="trips">One-way trips per week <b>{trips}</b></label><input id="trips" type="range" min="1" max="14" value={trips} onChange={event => onTripsChange(Number(event.target.value))} /><div className="range-labels"><span>1 trip</span><span>14 trips</span></div></div>
    <div className="model-note"><Info size={16} /><p>Model assumptions: 30 km/h travel speed, 20 L/min breathing rate, and unchanged sample concentrations across 52 weeks. This is an exposure illustration, not a medical prediction.</p></div>
  </div>
}
function AirQuality({ feed, failed, nodes, onRetry }) {
  if (!feed) return <div className="error-state" role="status"><Wind size={30} /><h2>{failed ? 'Sensor feed unavailable' : 'Loading sample readings'}</h2><p>{failed ? 'We couldn’t reach the API.' : 'Fetching the neighborhood demo feed.'}</p>{failed && <button className="secondary-button" onClick={onRetry}>Try again</button>}</div>
  return <div className="air-panel"><div className="section-heading"><h2>Neighborhood air</h2><span>{Object.keys(feed.live_aqi).length} locations</span></div><p className="section-description">Simulated readings refresh every 30 seconds. Route comparisons use fixed sample concentrations.</p>{failed && <p className="field-error" role="status">Connection lost. Showing the last available readings. <button onClick={onRetry}>Retry</button></p>}<div className="sensor-list">{Object.entries(feed.live_aqi).sort((a,b) => a[1].aqi - b[1].aqi).map(([name, reading]) => <div className="sensor-row" key={name}><span className="sensor-dot" style={{background:aqiInfo(reading.aqi).color}} /><div><strong>{name}</strong><small>{nodes[name]?.description}</small></div><div className="sensor-value"><b style={{color:aqiInfo(reading.aqi).color}}>{reading.aqi}</b><small>{aqiInfo(reading.aqi).label}</small></div></div>)}</div><p className="last-updated"><Clock size={12} /> Last received {new Date(feed.updated_at).toLocaleTimeString('en-IN', {timeZone:'Asia/Kolkata', hour:'2-digit',minute:'2-digit',second:'2-digit'})} IST</p></div>
}
