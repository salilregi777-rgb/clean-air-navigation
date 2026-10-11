"""
Clean Air Navigation — FastAPI Backend
Computes fastest, cleanest, and balanced routes through a mock urban graph of Bangalore.
Features real-time AQI simulation and health impact analysis.
"""

import heapq
import random
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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
    allow_origins=[origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Lightweight health endpoint for AWS service checks."""
    return {"status": "ok", "service": "clean-air-navigation-api"}

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


# Exposure estimates use a fixed speed and breathing rate for the demonstration.
SPEED_KMH = 30.0
BREATHING_M3_MIN = 0.020


def validate_trip(start: str, end: str):
    if start not in NODES or end not in NODES:
        raise HTTPException(status_code=404, detail="Choose a neighborhood from the available locations.")
    if start == end:
        raise HTTPException(status_code=400, detail="Choose two different neighborhoods.")


def dijkstra(start: str, end: str, weight: str = "distance") -> dict | None:
    """Minimize distance, PM2.5 × distance, or a normalized combination.

    With fixed speed and breathing rate, minimizing PM2.5 × distance also
    minimizes estimated inhaled dose. All averages are distance weighted.
    Lines on the map connect sample graph nodes; they are not road geometry.
    """
    if start not in NODES or end not in NODES or start == end:
        return None
    costs = {name: float("inf") for name in NODES}
    costs[start] = 0
    previous = {}
    queue = [(0, start)]
    while queue:
        cost, node = heapq.heappop(queue)
        if cost > costs[node]:
            continue
        if node == end:
            break
        for neighbor, distance, aqi, pm25, pm10 in ADJ[node]:
            edge_cost = distance
            if weight == "aqi":
                edge_cost = distance * pm25
            elif weight == "balanced":
                edge_cost = distance * (0.5 + 0.5 * pm25 / 35.0)
            new_cost = cost + edge_cost
            if new_cost < costs[neighbor]:
                costs[neighbor] = new_cost
                previous[neighbor] = (node, distance, aqi, pm25, pm10)
                heapq.heappush(queue, (new_cost, neighbor))
    if end not in previous:
        return None
    path = [end]
    distance = aqi_sum = pm25_sum = pm10_sum = 0.0
    current = end
    while current != start:
        parent, length, aqi, pm25, pm10 = previous[current]
        distance += length
        aqi_sum += aqi * length
        pm25_sum += pm25 * length
        pm10_sum += pm10 * length
        path.append(parent)
        current = parent
    path.reverse()
    duration = distance / SPEED_KMH * 60
    # Do not round the time or concentrations before calculating exposure.
    dose = pm25_sum / SPEED_KMH * 60 * BREATHING_M3_MIN
    return {
        "path": path,
        "coordinates": [[NODES[name]["lat"], NODES[name]["lng"]] for name in path],
        "total_distance_km": round(distance, 1),
        "avg_aqi": round(aqi_sum / distance),
        "avg_pm25": round(pm25_sum / distance, 1),
        "avg_pm10": round(pm10_sum / distance, 1),
        "estimated_time_min": max(1, round(duration)),
        "health_impact": {
            "pm25_dose_ug": round(dose, 2),
            "total_air_inhaled_liters": round(duration * BREATHING_M3_MIN * 1000, 1),
        },
    }


@app.get("/api/v1/route")
def get_route(start: str = Query("Koramangala"), end: str = Query("Whitefield")):
    validate_trip(start, end)
    fastest = dijkstra(start, end)
    clean = dijkstra(start, end, "aqi")
    balanced = dijkstra(start, end, "balanced")
    if not fastest or not clean or not balanced:
        raise HTTPException(status_code=404, detail="No route connects these neighborhoods.")
    fastest_dose = fastest["health_impact"]["pm25_dose_ug"]
    clean_dose = clean["health_impact"]["pm25_dose_ug"]
    return {
        "fastest_route": fastest,
        "clean_route": clean,
        "balanced_route": balanced,
        "health_savings": {
            "pm25_dose_saved_ug": round(max(0, fastest_dose - clean_dose), 2),
            "exposure_reduction_percent": round(100 * (1 - clean_dose / fastest_dose)) if fastest_dose else 0,
        },
        "nodes": NODES,
        "data_source": "simulated",
        "assumptions": {"speed_kmh": SPEED_KMH, "breathing_l_min": BREATHING_M3_MIN * 1000},
    }


@app.get("/api/v1/nodes")
def get_nodes():
    return {"nodes": NODES, "node_names": list(NODES)}


@app.get("/api/v1/aqi/live")
def get_live_aqi():
    """Independent simulated readings, not a live input to the routing graph."""
    now = datetime.now(timezone.utc)
    # Every caller sees the same demo snapshot within a 30-second interval.
    rng = random.Random(int(now.timestamp()) // 30)
    readings = {}
    for name, node in NODES.items():
        fluctuation = rng.uniform(-0.10, 0.10)
        readings[name] = {
            "aqi": max(5, round(node["aqi"] * (1 + fluctuation))),
            "pm25": round(node["pm25"] * (1 + fluctuation), 1),
            "timestamp": now.isoformat(),
        }
    return {"live_aqi": readings, "updated_at": now.isoformat(), "data_source": "simulated"}


@app.get("/api/v1/health/annual-savings")
def get_annual_savings(start: str = Query("Koramangala"), end: str = Query("Whitefield"), trips_per_week: int = Query(10, ge=1, le=14)):
    routes = get_route(start, end)
    count = trips_per_week * 52
    return {
        "trips_per_year": count,
        "annual_pm25_saved_ug": round(routes["health_savings"]["pm25_dose_saved_ug"] * count, 1),
        "annual_extra_hours": round((routes["clean_route"]["estimated_time_min"] - routes["fastest_route"]["estimated_time_min"]) * count / 60, 1),
        "data_source": "simulated",
        "assumptions": routes["assumptions"],
    }
