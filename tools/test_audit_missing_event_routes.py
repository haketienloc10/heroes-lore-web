#!/usr/bin/env python3
"""Tests for the class-6 missing-event route reachability audit."""

import unittest

import audit_missing_event_routes as routes


class MissingEventRouteAuditTests(unittest.TestCase):
    def test_possible_collision_cells_union_signed_startup_and_script_writes(self):
        events = {
            "actionBlocks": [{
                "actions": [{"opcode": 101, "arguments": [1, 0, 2]}],
            }],
            "scripts": [[[42, 2, 0], [43, 255, 0]]],
        }
        possible = routes.possible_collision_cells(events, [[0, 0, 0, 0]])

        self.assertEqual(possible[2], [(1, 0)])
        self.assertEqual(possible[-1], [(2, 0)])

    def test_possible_passability_grid_unions_startup_and_script_writes(self):
        events = {
            "actionBlocks": [{
                "actions": [{"opcode": 101, "arguments": [1, 0, 0]}],
            }],
            "scripts": [[[42, 2, 0], [43, 3, 0], [42, 3, 0], [43, 255, 0]]],
        }
        possible = routes.possible_passability_grid(events, [[0, -1, -1, -1]])

        self.assertEqual(
            routes.distance_to_cells(possible, (0, 0), {(2, 0)}),
            2,
        )
        self.assertEqual(possible[0][3], -1)

    def test_known_map15_callback_writes_dynamic_exit_markers(self):
        writes = routes.known_source_collision_writes(
            15,
            [[-1] * 12 for _ in range(12)],
        )

        self.assertEqual(len(writes), 12)
        self.assertEqual(set(writes), {
            (x, y, 1) for x in range(6, 10) for y in range(7, 10)
        })
        self.assertEqual(routes.known_source_collision_writes(14, [[-1] * 12]), [])

    def test_overapproximate_graph_requires_a_selectable_marker_and_respects_blocked_edge(self):
        rows = [
            {
                "sourceMap": 0,
                "markerGroup": 1,
                "scriptIndex": 0,
                "destinationMap": 1,
                "possibleMatchingCollisionCells": [(0, 0)],
            },
            {
                "sourceMap": 1,
                "markerGroup": 2,
                "scriptIndex": 1,
                "destinationMap": 2,
                "possibleMatchingCollisionCells": [],
            },
            {
                "sourceMap": 1,
                "markerGroup": 3,
                "scriptIndex": 2,
                "destinationMap": 3,
                "possibleMatchingCollisionCells": [(1, 0)],
            },
            {
                "sourceMap": 1,
                "markerGroup": 4,
                "scriptIndex": 3,
                "destinationMap": 4,
                "possibleMatchingCollisionCells": [],
                "sourceActorDirectCallbackPossible": True,
            },
        ]

        reachable, edge_count = routes.reachable_maps_overapprox(
            rows,
            {0},
            {(1, 3, 2)},
        )

        self.assertEqual(reachable, {0, 1, 4})
        self.assertEqual(edge_count, 2)

    def test_generated_newgame_overapprox_does_not_enter_missing_event_maps(self):
        report = routes.build_report()
        graph = report["newGameOverapproximateTransferGraph"]

        self.assertEqual(report["missingEventMapIds"], [9, 28, 29, 30, 43, 44, 45, 46, 47])
        self.assertEqual(graph["startMapIds"], [0])
        self.assertEqual(graph["transferEdgeCount"], 186)
        self.assertEqual(len(graph["reachableMapIds"]), 69)
        self.assertIn(82, graph["reachableMapIds"])
        self.assertEqual(graph["unreachableEventMapIds"], [50, 65, 68])
        self.assertEqual(graph["reachableMissingEventMapIds"], [])
        self.assertTrue(graph["map3Marker3EdgeBlockedByPermissivePathCheck"])

        map15_to_map82 = next(
            row for row in report["modeledSourceCallbackTransfers"]
            if row["sourceMap"] == 15 and row["destinationMap"] == 82
        )
        self.assertEqual(
            map15_to_map82["possibleMatchingCollisionCells"],
            sorted((x, y) for y in range(7, 10) for x in range(6, 10)),
        )

        direct_callback_maps = {
            row["sourceMap"] for row in report["modeledSourceCallbackTransfers"]
            if row["sourceActorDirectCallbackPossible"]
        }
        self.assertEqual(direct_callback_maps, {11, 13, 82})

        route_28_from_map_27 = next(
            row for row in report["routesIntoMissingEventMaps"]
            if row["sourceMap"] == 27 and row["destinationMap"] == 28
        )
        route_28_from_map_50 = next(
            row for row in report["routesIntoMissingEventMaps"]
            if row["sourceMap"] == 50 and row["destinationMap"] == 28
        )
        self.assertEqual(route_28_from_map_27["possibleMatchingCollisionCells"], [])
        self.assertTrue(route_28_from_map_50["possibleMatchingCollisionCells"])
        self.assertNotIn(50, graph["reachableMapIds"])
        for source_map, destination_map in ((73, 30), (75, 29)):
            row = next(
                candidate for candidate in report["routesIntoMissingEventMaps"]
                if candidate["sourceMap"] == source_map and
                candidate["destinationMap"] == destination_map
            )
            self.assertEqual(row["possibleMatchingCollisionCells"], [])


if __name__ == "__main__":
    unittest.main()
