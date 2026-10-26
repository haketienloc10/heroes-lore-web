#!/usr/bin/env python3
"""Audit extracted transfer triggers that target maps without event resources."""

from __future__ import annotations

import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1] / "web/public/assets/generated"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def marker_cells(grid: list[list[int]]) -> dict[int, list[tuple[int, int]]]:
    cells: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for y, row in enumerate(grid):
        for x, value in enumerate(row):
            if value not in (0, -128) and abs(value) <= 127:
                cells[value].append((x, y))
    return cells


def signed_byte(value: int) -> int:
    return value if value < 128 else value - 256


def possible_collision_cells(
    events: dict[str, Any],
    grid: list[list[int]],
    additional_writes: list[tuple[int, int, int]] | None = None,
) -> dict[int, list[tuple[int, int]]]:
    """Over-approximate marker values that can occur in a map's collision grid.

    Include the base grid, every startup opcode-101 write, every decoded
    opcode-42/43 pair, and explicit source-map callback writes. Writes are
    unioned without predicates or order so reachability is more permissive
    than gameplay.
    """
    cells: dict[int, set[tuple[int, int]]] = defaultdict(set)
    for value, positions in marker_cells(grid).items():
        cells[value].update(positions)

    height = len(grid)
    width = len(grid[0]) if height else 0

    def record(x: int, y: int, value: int) -> None:
        if 0 <= x < width and 0 <= y < height:
            cells[signed_byte(value)].add((x, y))

    for block in events.get("actionBlocks", []):
        for action in block.get("actions", []):
            if action.get("opcode") == 101:
                x, y, value = action["arguments"]
                record(x, y, value)

    for commands in events.get("scripts", []):
        pending_cell: tuple[int, int] | None = None
        for command in commands:
            if command[0] == 42:
                pending_cell = (command[1], command[2])
            elif command[0] == 43 and pending_cell is not None:
                record(*pending_cell, command[1])
                pending_cell = None

    for x, y, value in additional_writes or []:
        record(x, y, value)

    return {value: sorted(positions) for value, positions in cells.items()}


def known_source_collision_writes(
    source_map: int,
    grid: list[list[int]],
) -> list[tuple[int, int, int]]:
    """Known map-loader actor callbacks that mutate collision beyond event scripts."""
    if source_map != 15:
        return []
    # The modeled map-15 `cf.l()` callback writes marker 1 over x=6..9 and
    # its spawn row y=7 through y=9 after the death delay.
    return [
        (x, y, 1)
        for y in range(7, 10)
        for x in range(6, 10)
        if y < len(grid) and x < len(grid[y])
    ]


def known_source_direct_marker_callbacks(source_map: int) -> set[int]:
    """Marker groups dispatched directly when modeled source actors are removed."""
    return {1} if source_map in {11, 13, 82} else set()


def transfer_rows(
    source_map: int,
    events: dict[str, Any],
    grid: list[list[int]],
    possible_cells: dict[int, list[tuple[int, int]]] | None = None,
    direct_callback_markers: set[int] | None = None,
) -> list[dict[str, Any]]:
    cells_by_value = marker_cells(grid)
    possible_cells_by_value = possible_cells or {
        value: positions for value, positions in cells_by_value.items()
    }
    output: list[dict[str, Any]] = []
    for marker_id, group in enumerate(events["triggerGroups"], start=1):
        for row in group:
            trigger_type = (row[0] >> 6) & 3
            script_index = row[6]
            if script_index >= len(events["scripts"]):
                continue
            commands = events["scripts"][script_index]
            transfer = next((command for command in commands if command[0] == 7), None)
            arrival = next((command for command in commands if command[0] == 8), None)
            if transfer is None:
                continue
            # Type 0 reads the signed current-cell marker directly; types 1–3
            # compare the absolute marker value in their selected cell.
            matching_cells = (
                cells_by_value.get(marker_id, [])
                if trigger_type == 0
                else cells_by_value.get(marker_id, []) + cells_by_value.get(-marker_id, [])
            )
            possible_matching_cells = (
                possible_cells_by_value.get(marker_id, [])
                if trigger_type == 0
                else possible_cells_by_value.get(marker_id, []) +
                    possible_cells_by_value.get(-marker_id, [])
            )
            output.append({
                "sourceMap": source_map,
                "markerGroup": marker_id,
                "triggerType": trigger_type,
                "scriptIndex": script_index,
                "destinationMap": transfer[1],
                "entryDirectionIndex": transfer[2],
                "arrivalTile": [arrival[1], arrival[2]] if arrival is not None else None,
                "rawTriggerRow": row,
                "matchingCollisionCells": matching_cells,
                "possibleMatchingCollisionCells": possible_matching_cells,
                "sourceActorDirectCallbackPossible": marker_id in (direct_callback_markers or set()),
            })
    return output


def reachable_maps_overapprox(
    rows: list[dict[str, Any]],
    start_maps: set[int],
    blocked_edges: set[tuple[int, int, int]],
) -> tuple[set[int], int]:
    """Map-level closure over selectable markers and direct source callbacks.

    Trigger predicates, inventory, actor occupancy, and paths to marker cells
    are ignored. Direct callback rows can be selected without a collision cell.
    The sole path-specific exception is supplied by the separate map-3 BFS,
    which rules out its map-43 exit from every known entry.
    """
    outgoing: dict[int, list[dict[str, Any]]] = defaultdict(list)
    edge_count = 0
    for row in rows:
        edge = (row["sourceMap"], row["markerGroup"], row["scriptIndex"])
        if not row["possibleMatchingCollisionCells"] and \
                not row.get("sourceActorDirectCallbackPossible", False):
            continue
        if edge in blocked_edges:
            continue
        outgoing[row["sourceMap"]].append(row)
        edge_count += 1

    reachable = set(start_maps)
    queue = deque(sorted(start_maps))
    while queue:
        source_map = queue.popleft()
        for row in outgoing.get(source_map, []):
            destination = row["destinationMap"]
            if destination in reachable:
                continue
            reachable.add(destination)
            queue.append(destination)
    return reachable, edge_count


def possible_passability_grid(
    events: dict[str, Any],
    grid: list[list[int]],
) -> list[list[int]]:
    """Return a permissive grid where any cell that could be passable is open."""
    height = len(grid)
    width = len(grid[0]) if height else 0
    possible = [[0 if value >= 0 else -1 for value in row] for row in grid]

    def record(x: int, y: int, value: int) -> None:
        if 0 <= x < width and 0 <= y < height and signed_byte(value) >= 0:
            possible[y][x] = 0

    for block in events.get("actionBlocks", []):
        for action in block.get("actions", []):
            if action.get("opcode") == 101:
                record(*action["arguments"])

    for commands in events.get("scripts", []):
        pending_cell: tuple[int, int] | None = None
        for command in commands:
            if command[0] == 42:
                pending_cell = (command[1], command[2])
            elif command[0] == 43 and pending_cell is not None:
                record(*pending_cell, command[1])
                pending_cell = None

    return possible


def distance_to_cells(
    grid: list[list[int]],
    start: tuple[int, int],
    targets: set[tuple[int, int]],
) -> int | None:
    height = len(grid)
    width = len(grid[0]) if height else 0
    sx, sy = start
    if not (0 <= sx < width and 0 <= sy < height) or grid[sy][sx] < 0:
        return None
    queue = deque([(sx, sy, 0)])
    seen = {(sx, sy)}
    while queue:
        x, y, distance = queue.popleft()
        if (x, y) in targets:
            return distance
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (0 <= nx < width and 0 <= ny < height and
                    grid[ny][nx] >= 0 and (nx, ny) not in seen):
                seen.add((nx, ny))
                queue.append((nx, ny, distance + 1))
    return None


def audit_map_3(incoming: list[dict[str, Any]]) -> dict[str, Any]:
    events = read_json(ROOT / "event-operations/6/03.json")
    grid = read_json(ROOT / "collision/6/03.json")["values"]
    possible_cells = possible_collision_cells(events, grid)
    marker_targets = set(possible_cells.get(3, []))
    possible_grid = possible_passability_grid(events, grid)
    route_entries = [row for row in incoming if row["destinationMap"] == 3]
    path_checks: list[dict[str, Any]] = []
    for entry in route_entries:
        if entry["arrivalTile"] is None:
            continue
        x, y = entry["arrivalTile"]
        if 0 <= y < len(possible_grid) and 0 <= x < len(possible_grid[y]):
            # Transfers can place the player on their scripted arrival tile.
            possible_grid[y][x] = 0
    for entry in route_entries:
        if entry["arrivalTile"] is None:
            continue
        start = tuple(entry["arrivalTile"])
        path_checks.append({
            "fromMap": entry["sourceMap"],
            "arrivalTile": list(start),
            "triggerCellAvailableAtSource": bool(entry["possibleMatchingCollisionCells"]),
            "collisionState": "base and all decoded startup/script collision writes unioned",
            "stepsToMarker3": distance_to_cells(possible_grid, start, marker_targets),
        })

    # Script 5 runs from marker 6 and writes collision value 1 to both marker-6
    # cells. The union grid also admits every other decoded passability write.
    marker6_cells = set(marker_cells(grid).get(6, []))
    marker6_checks = [
        {"start": list(start), "stepsToMarker3": distance_to_cells(possible_grid, start, marker_targets)}
        for start in sorted(marker6_cells)
    ]
    return {
        "baseMarker3Cells": sorted([list(cell) for cell in marker_cells(grid).get(3, [])]),
        "marker3Cells": sorted([list(cell) for cell in marker_targets]),
        "incomingTransfers": route_entries,
        "pathChecks": path_checks,
        "afterMarker6Script5": marker6_checks,
    }


def build_report() -> dict[str, Any]:
    map_ids = {int(path.stem) for path in (ROOT / "maps").glob("*.json")}
    event_ids = {int(path.stem) for path in (ROOT / "event-operations/6").glob("*.json")}
    missing_event_map_ids = sorted(map_ids - event_ids)
    rows: list[dict[str, Any]] = []
    for path in sorted((ROOT / "event-operations/6").glob("*.json")):
        source_map = int(path.stem)
        collision_path = ROOT / "collision/6" / path.name
        if not collision_path.exists():
            continue
        events = read_json(path)
        grid = read_json(collision_path)["values"]
        source_callback_writes = known_source_collision_writes(source_map, grid)
        source_rows = transfer_rows(
            source_map,
            events,
            grid,
            possible_collision_cells(events, grid, source_callback_writes),
            known_source_direct_marker_callbacks(source_map),
        )
        rows.extend(source_rows)

    incoming_to_map3 = [row for row in rows if row["destinationMap"] == 3]
    map3_analysis = audit_map_3(incoming_to_map3)
    map3_marker3_reachable = any(
        check["triggerCellAvailableAtSource"] and check["stepsToMarker3"] is not None
        for check in map3_analysis["pathChecks"]
    ) or any(check["stepsToMarker3"] is not None
             for check in map3_analysis["afterMarker6Script5"])
    blocked_edges: set[tuple[int, int, int]] = set()
    if not map3_marker3_reachable:
        blocked_edges.add((3, 3, 3))
    reachable_map_ids, transfer_edge_count = reachable_maps_overapprox(
        rows,
        {0},
        blocked_edges,
    )
    reachable_missing_maps = sorted(set(missing_event_map_ids) & reachable_map_ids)
    if reachable_missing_maps:
        raise RuntimeError(
            f"Extracted New Game route graph can enter maps without event resources: {reachable_missing_maps}"
        )
    unreachable_event_maps = sorted(event_ids - reachable_map_ids)

    target_routes = [row for row in rows if row["destinationMap"] in missing_event_map_ids]
    return {
        "missingEventMapIds": missing_event_map_ids,
        "routesIntoMissingEventMaps": target_routes,
        "routesIntoMap50ForMap28Context": [
            row for row in rows if row["destinationMap"] == 50
        ],
        "modeledSourceCallbackTransfers": [
            row for row in rows
            if row["sourceActorDirectCallbackPossible"] or row["sourceMap"] == 15
        ],
        "map3To43Reachability": map3_analysis,
        "newGameOverapproximateTransferGraph": {
            "startMapIds": [0],
            "reachableMapIds": sorted(reachable_map_ids),
            "unreachableEventMapIds": unreachable_event_maps,
            "reachableMissingEventMapIds": reachable_missing_maps,
            "transferEdgeCount": transfer_edge_count,
            "map3Marker3EdgeBlockedByPermissivePathCheck": not map3_marker3_reachable,
            "scope": "Over-approximation: ignores flags, inventory, actor occupancy, and paths to matching marker cells; unions decoded startup/script writes plus the modeled map-15 cf death callback, and admits direct marker callbacks from modeled actors on maps 11, 13, and 82. The map-3 to map-43 edge is withheld only because the separate BFS finds no marker-3 path from any known selectable map-3 arrival or after script 5.",
        },
        "method": "class-6 generated event/collision JSON; trigger type from top two bits of row byte 0; four-way BFS uses source collision passability value >= 0",
        "limits": "Static extracted-data audit only; it does not model actor occupancy, unextracted event files, external callbacks not represented in checked-in source-map models, or J2ME runtime behavior.",
    }


def main() -> None:
    report = build_report()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
