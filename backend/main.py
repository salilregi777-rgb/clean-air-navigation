"""
Clean Air Navigation — FastAPI Backend
Computes fastest, cleanest, and balanced routes through a mock urban graph of Bangalore.
Features real-time AQI simulation and health impact analysis.
"""

import heapq
import math
import random
import time
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="Clean Air Navigation API",
    description="Pollution-aware routing for urban commuters — AWS Hackathon 2026",
    version="2.0.0",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev-server to talk to us
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Graph: 10 Nodes (Bangalore neighbourhoods with realistic coords)
# ---------------------------------------------------------------------------
NODES: dict[str, dict] = {
    "Koramangala": {
        "lat": 12.9352, "lng": 77.6245, "aqi": 85,
        "description": "Residential & startup hub",
        "pm25": 32.5, "pm10": 68.0,
    },
    "Indiranagar": {
        "lat": 12.9716, "lng": 77.6412, "aqi": 110,
        "description": "Commercial & nightlife district",
        "pm25": 48.2, "pm10": 92.0,
    },
    "HSR Layout": {
        "lat": 12.9116, "lng": 77.6389, "aqi": 45,
        "description": "Planned residential layout",
        "pm25": 18.5, "pm10": 38.0,
    },
    "BTM Layout": {
        "lat": 12.9166, "lng": 77.6101, "aqi": 95,
        "description": "Dense residential area",
        "pm25": 38.0, "pm10": 78.0,
    },
    "Whitefield": {
        "lat": 12.9698, "lng": 77.7500, "aqi": 55,
        "description": "IT corridor & tech parks",
        "pm25": 22.0, "pm10": 45.0,
    },
    "Marathahalli": {
        "lat": 12.9591, "lng": 77.7019, "aqi": 180,
        "description": "Heavy traffic junction",
        "pm25": 85.0, "pm10": 165.0,
    },
    "Bellandur": {
        "lat": 12.9254, "lng": 77.6763, "aqi": 40,
        "description": "Lake area, improving air quality",
        "pm25": 16.0, "pm10": 32.0,
    },
    "Electronic City": {
        "lat": 12.8456, "lng": 77.6603, "aqi": 65,
        "description": "Major IT hub, moderate traffic",
        "pm25": 26.0, "pm10": 52.0,
    },
    "Jayanagar": {
        "lat": 12.9299, "lng": 77.5838, "aqi": 75,
        "description": "Residential, tree-lined streets",
        "pm25": 28.0, "pm10": 58.0,
    },
    "MG Road": {
        "lat": 12.9756, "lng": 77.6065, "aqi": 135,
        "description": "Central business district, heavy traffic",
        "pm25": 62.0, "pm10": 120.0,
    },
}

# ---------------------------------------------------------------------------
# Graph: Edges (bidirectional)
#   Each edge carries: distance_km, avg_aqi, pm25, pm10
# ---------------------------------------------------------------------------
EDGES: list[tuple[str, str, float, int, float, float]] = [
    #  (node_a,           node_b,          dist, aqi, pm25,  pm10)
    # --- Polluted corridor (short but dirty) ---
    ("Koramangala",     "Marathahalli",    8.5,  210, 95.0,  180.0),
    ("Marathahalli",    "Whitefield",      5.0,  195, 88.0,  170.0),

    # --- Clean detour (longer but breathable) ---
    ("Koramangala",     "HSR Layout",      3.2,   50, 20.0,  40.0),
    ("HSR Layout",      "Bellandur",       4.8,   42, 17.0,  34.0),
    ("Bellandur",       "Whitefield",      8.5,   55, 22.0,  44.0),

    # --- Cross-links ---
    ("Koramangala",     "BTM Layout",      2.5,  100, 40.0,  82.0),
    ("BTM Layout",      "HSR Layout",      2.0,   65, 26.0,  52.0),
    ("Koramangala",     "Indiranagar",     4.0,  130, 58.0,  112.0),
    ("Indiranagar",     "Marathahalli",    6.5,  175, 78.0,  152.0),
    ("Indiranagar",     "Whitefield",     12.0,  160, 72.0,  140.0),
    ("Bellandur",       "Marathahalli",    3.5,  150, 68.0,  130.0),

    # --- New edges for expanded graph ---
    ("HSR Layout",      "Electronic City", 6.0,   58, 23.0,  46.0),
    ("BTM Layout",      "Jayanagar",       3.5,   70, 27.0,  56.0),
    ("Koramangala",     "Jayanagar",       4.2,   80, 30.0,  62.0),
    ("Jayanagar",       "MG Road",         5.0,  120, 54.0,  105.0),
    ("MG Road",         "Indiranagar",     3.0,  140, 63.0,  122.0),
    ("Electronic City", "Bellandur",       5.5,   48, 19.0,  38.0),
    ("Electronic City", "BTM Layout",      7.0,   72, 28.0,  58.0),
    ("MG Road",         "Koramangala",     5.5,  115, 50.0,  98.0),
]

# Build adjacency list
ADJ: dict[str, list[tuple[str, float, int, float, float]]] = {n: [] for n in NODES}
for a, b, dist, aqi, pm25, pm10 in EDGES:
    ADJ[a].append((b, dist, aqi, pm25, pm10))
    ADJ[b].append((a, dist, aqi, pm25, pm10))


# ---------------------------------------------------------------------------
# Health Impact Calculator
# ---------------------------------------------------------------------------
def calculate_health_impact(
    distance_km: float,
    avg_aqi: int,
    avg_pm25: float,
    estimated_time_min: int,
) -> dict:
    """
    Calculate health impact metrics for a given route.
    Based on WHO air quality guidelines and epidemiological studies.
    """
    # Breathing rate: ~15 L/min at rest, ~40 L/min light exercise (cycling/walking)
    # Average commuter: ~20 L/min
    breathing_rate_l_per_min = 20.0
    total_air_inhaled_liters = breathing_rate_l_per_min * estimated_time_min
    total_air_inhaled_m3 = total_air_inhaled_liters / 1000

    # PM2.5 dose (µg inhaled)
    pm25_dose_ug = avg_pm25 * total_air_inhaled_m3

    # WHO guideline: 15 µg/m³ annual, 45 µg/m³ 24-hour (2021 guidelines)
    who_24h_guideline = 45.0
    pm25_vs_who = round((avg_pm25 / who_24h_guideline) * 100, 1)

    # Equivalent cigarettes: ~22 µg/m³ PM2.5 for 24h ≈ 1 cigarette
    # For commute duration proportionally
    cigarette_equivalent = round((avg_pm25 * estimated_time_min) / (22 * 24 * 60), 3)

    # Respiratory risk score (0-100)
    if avg_aqi <= 50:
        risk_level = "Low"
        risk_score = int(avg_aqi * 0.4)
        risk_color = "#0f9d58"
    elif avg_aqi <= 100:
        risk_level = "Moderate"
        risk_score = int(20 + (avg_aqi - 50) * 0.6)
        risk_color = "#f9ab00"
    elif avg_aqi <= 150:
        risk_level = "High"
        risk_score = int(50 + (avg_aqi - 100) * 0.6)
        risk_color = "#e8710a"
    elif avg_aqi <= 200:
        risk_level = "Very High"
        risk_score = int(80 + (avg_aqi - 150) * 0.4)
        risk_color = "#d93025"
    else:
        risk_level = "Hazardous"
        risk_score = min(100, int(90 + (avg_aqi - 200) * 0.2))
        risk_color = "#a50e0e"

    # Estimated health cost (INR) based on WHO DALY model simplified
    # Rough: 1 µg PM2.5 exposure per m³ ≈ ₹0.50 health cost per trip
    health_cost_inr = round(avg_pm25 * total_air_inhaled_m3 * 0.5, 2)

    return {
        "pm25_dose_ug": round(pm25_dose_ug, 2),
        "total_air_inhaled_liters": round(total_air_inhaled_liters, 1),
        "pm25_vs_who_percent": pm25_vs_who,
        "cigarette_equivalent": cigarette_equivalent,
        "risk_level": risk_level,
        "risk_score": min(risk_score, 100),
        "risk_color": risk_color,
        "health_cost_inr": health_cost_inr,
        "who_guideline_exceeded": avg_pm25 > who_24h_guideline,
    }


# ---------------------------------------------------------------------------
# Dijkstra (generic weight)
# ---------------------------------------------------------------------------
def dijkstra(
    start: str,
    end: str,
    weight: str = "distance",
) -> dict | None:
    """
    Run Dijkstra from *start* to *end*.
    `weight` is 'distance', 'aqi', or 'balanced'.
    Returns {path, total_distance_km, avg_aqi, avg_pm25, estimated_time_min, coordinates, health_impact}.
    """
    if start not in NODES or end not in NODES:
        return None

    dist_map: dict[str, float] = {n: float("inf") for n in NODES}
    dist_map[start] = 0
    prev: dict[str, str | None] = {n: None for n in NODES}
    path_distance: dict[str, float] = {n: 0.0 for n in NODES}
    path_aqi_sum: dict[str, float] = {n: 0.0 for n in NODES}
    path_pm25_sum: dict[str, float] = {n: 0.0 for n in NODES}
    path_pm10_sum: dict[str, float] = {n: 0.0 for n in NODES}
    edge_count: dict[str, int] = {n: 0 for n in NODES}

    pq: list[tuple[float, str]] = [(0, start)]

    while pq:
        cost, u = heapq.heappop(pq)
        if cost > dist_map[u]:
            continue
        if u == end:
            break
        for v, d, a, p25, p10 in ADJ[u]:
            if weight == "distance":
                w = d
            elif weight == "aqi":
                w = a
            else:  # balanced
                w = d * 0.4 + a * 0.6  # favor cleaner air, but consider distance
            new_cost = dist_map[u] + w
            if new_cost < dist_map[v]:
                dist_map[v] = new_cost
                prev[v] = u
                path_distance[v] = path_distance[u] + d
                path_aqi_sum[v] = path_aqi_sum[u] + a
                path_pm25_sum[v] = path_pm25_sum[u] + p25
                path_pm10_sum[v] = path_pm10_sum[u] + p10
                edge_count[v] = edge_count[u] + 1
                heapq.heappush(pq, (new_cost, v))

    if dist_map[end] == float("inf"):
        return None

    path: list[str] = []
    node: str | None = end
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()

    total_dist = round(path_distance[end], 1)
    edges = edge_count[end] or 1
    avg_aqi = round(path_aqi_sum[end] / edges)
    avg_pm25 = round(path_pm25_sum[end] / edges, 1)
    avg_pm10 = round(path_pm10_sum[end] / edges, 1)
    est_time = round(total_dist / 30 * 60)

    coordinates = [[NODES[n]["lat"], NODES[n]["lng"]] for n in path]

    health = calculate_health_impact(total_dist, avg_aqi, avg_pm25, est_time)

    return {
        "path": path,
        "coordinates": coordinates,
        "total_distance_km": total_dist,
        "avg_aqi": avg_aqi,
        "avg_pm25": avg_pm25,
        "avg_pm10": avg_pm10,
        "estimated_time_min": est_time,
        "health_impact": health,
    }


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/route")
def get_route(
    start: str = Query("Koramangala", description="Start node"),
    end: str = Query("Whitefield", description="End node"),
):
    """Return the fastest, cleanest, and balanced routes between two nodes."""
    fastest = dijkstra(start, end, weight="distance")
    clean = dijkstra(start, end, weight="aqi")
    balanced = dijkstra(start, end, weight="balanced")

    if fastest is None or clean is None:
        return {"error": f"No route found between '{start}' and '{end}'."}

    # Calculate health savings
    health_savings = None
    if fastest and clean:
        pm25_saved = round(
            fastest["health_impact"]["pm25_dose_ug"] - clean["health_impact"]["pm25_dose_ug"], 2
        )
        cost_saved = round(
            fastest["health_impact"]["health_cost_inr"] - clean["health_impact"]["health_cost_inr"], 2
        )
        cig_saved = round(
            fastest["health_impact"]["cigarette_equivalent"] - clean["health_impact"]["cigarette_equivalent"], 4
        )
        health_savings = {
            "pm25_dose_saved_ug": max(0, pm25_saved),
            "health_cost_saved_inr": max(0, cost_saved),
            "cigarette_equivalent_saved": max(0, cig_saved),
            "aqi_reduction_percent": round(
                ((fastest["avg_aqi"] - clean["avg_aqi"]) / fastest["avg_aqi"]) * 100
            ) if fastest["avg_aqi"] > 0 else 0,
        }

    return {
        "fastest_route": fastest,
        "clean_route": clean,
        "balanced_route": balanced,
        "health_savings": health_savings,
        "nodes": NODES,
    }


@app.get("/api/v1/nodes")
def get_nodes():
    """Return all available graph nodes."""
    return {"nodes": NODES, "node_names": list(NODES.keys())}


@app.get("/api/v1/aqi/live")
def get_live_aqi():
    """
    Simulate real-time AQI readings with small random fluctuations.
    In production, this would pull from AWS IoT sensors via Lambda.
    """
    ist = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist)
    live_data = {}
    for name, info in NODES.items():
        # Add realistic fluctuation (±10% of base AQI)
        base = info["aqi"]
        fluctuation = random.uniform(-0.10, 0.10)
        live_aqi = max(5, round(base * (1 + fluctuation)))
        live_pm25 = max(1, round(info["pm25"] * (1 + fluctuation), 1))

        live_data[name] = {
            "aqi": live_aqi,
            "pm25": live_pm25,
            "timestamp": now.isoformat(),
            "trend": random.choice(["rising", "falling", "stable"]),
        }
    return {"live_aqi": live_data, "updated_at": now.isoformat()}


@app.get("/api/v1/health/annual-savings")
def get_annual_savings(
    start: str = Query("Koramangala"),
    end: str = Query("Whitefield"),
    trips_per_week: int = Query(5, ge=1, le=14),
):
    """
    Calculate annual health savings if user consistently chooses the clean route.
    """
    fastest = dijkstra(start, end, weight="distance")
    clean = dijkstra(start, end, weight="aqi")

    if not fastest or not clean:
        return {"error": "No route found"}

    trips_per_year = trips_per_week * 52

    # Per-trip savings
    pm25_per_trip = fastest["health_impact"]["pm25_dose_ug"] - clean["health_impact"]["pm25_dose_ug"]
    cost_per_trip = fastest["health_impact"]["health_cost_inr"] - clean["health_impact"]["health_cost_inr"]
    cig_per_trip = fastest["health_impact"]["cigarette_equivalent"] - clean["health_impact"]["cigarette_equivalent"]

    # Extra distance and time
    extra_km = clean["total_distance_km"] - fastest["total_distance_km"]
    extra_min = clean["estimated_time_min"] - fastest["estimated_time_min"]

    return {
        "trips_per_year": trips_per_year,
        "annual_pm25_saved_ug": round(max(0, pm25_per_trip * trips_per_year), 1),
        "annual_health_cost_saved_inr": round(max(0, cost_per_trip * trips_per_year), 0),
        "annual_cigarettes_avoided": round(max(0, cig_per_trip * trips_per_year), 2),
        "annual_extra_km": round(extra_km * trips_per_year, 1),
        "annual_extra_hours": round((extra_min * trips_per_year) / 60, 1),
        "verdict": "The clean route adds minimal travel time but significantly reduces your annual pollution exposure.",
    }
