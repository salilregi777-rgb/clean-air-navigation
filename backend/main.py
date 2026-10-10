"""
Clean Air Navigation — FastAPI Backend
Computes fastest and cleanest routes through a mock urban graph of Bangalore.
"""

import heapq
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Clean Air Navigation API",
    description="Pollution-aware routing for urban commuters",
    version="1.0.0",
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
# Graph: Nodes (Bangalore neighbourhoods)
# ---------------------------------------------------------------------------
NODES: dict[str, dict] = {
    "Koramangala":  {"lat": 12.9352, "lng": 77.6245, "aqi": 85},
    "Indiranagar":  {"lat": 12.9716, "lng": 77.6412, "aqi": 110},
    "HSR Layout":   {"lat": 12.9116, "lng": 77.6389, "aqi": 45},
    "BTM Layout":   {"lat": 12.9166, "lng": 77.6101, "aqi": 95},
    "Whitefield":   {"lat": 12.9698, "lng": 77.7500, "aqi": 55},
    "Marathahalli": {"lat": 12.9591, "lng": 77.7019, "aqi": 180},
    "Bellandur":    {"lat": 12.9254, "lng": 77.6763, "aqi": 40},
}

# ---------------------------------------------------------------------------
# Graph: Edges  (bidirectional)
#   Each edge carries two weights:
#     • distance_km  — physical distance
#     • aqi          — average AQI along the stretch
# ---------------------------------------------------------------------------
EDGES: list[tuple[str, str, float, int]] = [
    #  (node_a,        node_b,        dist_km, aqi)
    # --- Polluted corridor (short but dirty) ---
    ("Koramangala",  "Marathahalli",  8.5,  210),
    ("Marathahalli", "Whitefield",    5.0,  195),

    # --- Clean detour (longer but breathable) ---
    ("Koramangala",  "HSR Layout",    3.2,   50),
    ("HSR Layout",   "Bellandur",     4.8,   42),
    ("Bellandur",    "Whitefield",    8.5,   55),

    # --- Cross-links ---
    ("Koramangala",  "BTM Layout",    2.5,  100),
    ("BTM Layout",   "HSR Layout",    2.0,   65),
    ("Koramangala",  "Indiranagar",   4.0,  130),
    ("Indiranagar",  "Marathahalli",  6.5,  175),
    ("Indiranagar",  "Whitefield",   12.0,  160),
    ("Bellandur",    "Marathahalli",  3.5,  150),
]

# Build adjacency list
ADJ: dict[str, list[tuple[str, float, int]]] = {n: [] for n in NODES}
for a, b, dist, aqi in EDGES:
    ADJ[a].append((b, dist, aqi))
    ADJ[b].append((a, dist, aqi))


# ---------------------------------------------------------------------------
# Dijkstra
# ---------------------------------------------------------------------------
def dijkstra(
    start: str,
    end: str,
    weight: str = "distance",
) -> dict | None:
    """
    Run Dijkstra from *start* to *end*.
    `weight` is either 'distance' or 'aqi'.
    Returns {path, total_distance_km, avg_aqi, estimated_time_min, coordinates}.
    """
    if start not in NODES or end not in NODES:
        return None

    # weight index: 0 → distance, 1 → aqi
    w_idx = 0 if weight == "distance" else 1

    dist_map: dict[str, float] = {n: float("inf") for n in NODES}
    dist_map[start] = 0
    prev: dict[str, str | None] = {n: None for n in NODES}
    # Also track the actual distance and aqi sums along the best path
    path_distance: dict[str, float] = {n: 0.0 for n in NODES}
    path_aqi_sum: dict[str, float] = {n: 0.0 for n in NODES}
    edge_count: dict[str, int] = {n: 0 for n in NODES}

    pq: list[tuple[float, str]] = [(0, start)]

    while pq:
        cost, u = heapq.heappop(pq)
        if cost > dist_map[u]:
            continue
        if u == end:
            break
        for v, d, a in ADJ[u]:
            w = d if w_idx == 0 else a
            new_cost = dist_map[u] + w
            if new_cost < dist_map[v]:
                dist_map[v] = new_cost
                prev[v] = u
                path_distance[v] = path_distance[u] + d
                path_aqi_sum[v] = path_aqi_sum[u] + a
                edge_count[v] = edge_count[u] + 1
                heapq.heappush(pq, (new_cost, v))

    # Reconstruct path
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
    # Estimate time: avg 30 km/h in Bangalore traffic
    est_time = round(total_dist / 30 * 60)

    coordinates = [[NODES[n]["lat"], NODES[n]["lng"]] for n in path]

    return {
        "path": path,
        "coordinates": coordinates,
        "total_distance_km": total_dist,
        "avg_aqi": avg_aqi,
        "estimated_time_min": est_time,
    }


# ---------------------------------------------------------------------------
# API Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/v1/route")
def get_route(
    start: str = Query("Koramangala", description="Start node"),
    end: str = Query("Whitefield", description="End node"),
):
    """Return both the fastest and cleanest route between two nodes."""
    fastest = dijkstra(start, end, weight="distance")
    clean = dijkstra(start, end, weight="aqi")

    if fastest is None or clean is None:
        return {"error": "No route found between the given nodes."}

    return {
        "fastest_route": fastest,
        "clean_route": clean,
        "nodes": NODES,
    }


@app.get("/api/v1/nodes")
def get_nodes():
    """Return all available graph nodes."""
    return {"nodes": NODES}
