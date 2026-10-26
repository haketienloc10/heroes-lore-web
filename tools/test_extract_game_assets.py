import importlib.util
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("extract_game_assets.py")
SPEC = importlib.util.spec_from_file_location("extract_game_assets", MODULE_PATH)
assets = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(assets)


def png_chunk(name: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(name + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", crc)


class AssetDecoderTests(unittest.TestCase):
    def test_standard_midi_resource_validation_checks_chunk_bounds(self):
        track = b"\x00\xff\x2f\x00"
        midi = b"MThd" + struct.pack(">IHHH", 6, 0, 1, 96) + b"MTrk" + struct.pack(">I", len(track)) + track
        assets.validate_midi_resource(midi, "snd/25.mid")

        with self.assertRaises(assets.AssetFormatError):
            assets.validate_midi_resource(midi[:-1], "snd/25.mid")
        with self.assertRaises(assets.AssetFormatError):
            assets.validate_midi_resource(b"not midi", "snd/25.mid")

    def test_equipment_data_decoder_extracts_signed_roll_ranges_without_text(self):
        body = (
            bytes([6, 1, 65, 0])
            + struct.pack("<i", -23)
            + bytes([12, 0xFE, 1, 2, 0xFE, 2, 1, 1, 0, 0, 0, 1])
        )
        decoded = assets.decode_equipment_data(bytes([len(body)]) + body, 6)

        self.assertEqual(decoded["format"], "heroes-lore-equipment-data-v1")
        self.assertEqual(decoded["sourceResource"], "itm/06")
        self.assertEqual(decoded["recordCount"], 1)
        self.assertEqual(decoded["records"][0], {
            "itemId": 0,
            "recordTypeCode": 6,
            "sourceValue": -23,
            "equipmentByte": 12,
            "equipmentType": -2,
            "characteristicFlag": True,
            "bonusRollCount": 2,
            "bonusRanges": [[-2, 2], [1, 1], [0, 0], [0, 1]],
            "subtypeBytes": [],
        })

    def test_equipment_data_decoder_checks_subtype_and_bonus_layout(self):
        def record(category: int, ranges: bytes, count: int, subtype: bytes = b"") -> bytes:
            body = bytes([category, 0, 0]) + struct.pack("<i", 0) + bytes([0, 0, 0, count]) + ranges + subtype
            return bytes([len(body)]) + body

        parsed = assets.decode_equipment_data(record(2, bytes([0, 2] * 4), 2, b"\x01\x02\x03"), 2)
        self.assertEqual(parsed["records"][0]["subtypeBytes"], [1, 2, 3])
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_equipment_data(record(6, bytes([3, 1] + [0] * 6), 1), 6)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_equipment_data(record(6, bytes([1, 1] + [0] * 6), 2), 6)

    def test_commerce_decoder_reads_localized_names_prices_shop_tabs_and_recipes(self):
        resources = []
        for category in range(24):
            body = bytes([category, 1, 48, 1, 49]) + struct.pack("<i", category * 10)
            resources.append(bytes([len(body)]) + body)

        decoded = assets.decode_item_commerce_catalog(
            resources,
            bytes([2, 7, 0]),
            bytes([2, 7, 0, 7, 1, 8, 0]),
        )

        self.assertEqual(decoded["format"], "heroes-lore-commerce-catalog-v1")
        self.assertEqual(decoded["categories"][7]["records"][0], {
            "category": 7,
            "itemId": 0,
            "recordTypeCode": 7,
            "nameStringId": 0,
            "descriptionStringId": 1,
            "sourceValue": 70,
        })
        self.assertEqual(decoded["shopStock"][0], [{"category": 7, "itemId": 0}])
        self.assertEqual(decoded["recipes"], [{
            "ingredients": [{"category": 7, "itemId": 0}, {"category": 7, "itemId": 1}],
            "result": {"category": 8, "itemId": 0},
        }])

    def test_enemy_data_decoder_reads_indexed_attributes_and_drop_triples(self):
        token = b"556"
        body = (
            b"\x00"  # skipped source byte
            + bytes([len(token)]) + token
            + bytes([0b01_10_01_00, 0b0100_1010, 37])
            + struct.pack(">HHHH", 1830, 130, 48, 42)
            + bytes([5, 11, 8])
            + struct.pack(">H", 320)
            + bytes([2, 8, 0, 5, 17, 1, 2])
        )
        data = bytes([0]) + struct.pack(">H", len(body)) + body

        decoded = assets.decode_enemy_data(data, 2)

        self.assertEqual(decoded["format"], "heroes-lore-enemy-data-v1")
        self.assertEqual(decoded["sourceResource"], "enm/data2")
        self.assertEqual(decoded["recordCount"], 1)
        self.assertEqual(decoded["records"][0], {
            "index": 0,
            "sourceOffset": 1,
            "recordLength": len(body),
            "labelToken": "556",
            "packedAttributes": {
                "classCode": 1,
                "shapeCode": 2,
                "elementCode": 1,
                "variantCode": 0,
            },
            "statusFlags": {
                "raw": 0b0100_1010,
                "bit3": True,
                "bit2": False,
                "bit1": True,
                "bit0": False,
                "conditionalCode": 1,
            },
            "baseCode": 37,
            "maxHp": 1830,
            "attack": 130,
            "defense": 48,
            "evasion": 42,
            "behaviorCodes": [5, 11, 8],
            "respawnDelay": 320,
            "dropCandidates": [[8, 0, 5], [17, 1, 2]],
        })

    def test_enemy_data_decoder_reads_consecutive_indexed_records(self):
        def record(token: bytes, hp: int) -> bytes:
            body = (
                b"\x00" + bytes([len(token)]) + token
                + bytes([0, 0, 0])
                + struct.pack(">HHHH", hp, 2, 3, 4)
                + bytes([5, 6, 7]) + struct.pack(">H", 8) + bytes([0])
            )
            return struct.pack(">H", len(body)) + body

        decoded = assets.decode_enemy_data(
            bytes([0]) + record(b"556", 100) + record(b"557", 200),
            1,
        )

        self.assertEqual(decoded["recordCount"], 2)
        self.assertEqual([entry["maxHp"] for entry in decoded["records"]], [100, 200])
        self.assertEqual([entry["index"] for entry in decoded["records"]], [0, 1])

    def test_enemy_data_decoder_rejects_incomplete_records(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_data(b"\x00\x00\x08\x00\x03abc", 0)

        body = b"\x00\x00"
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_data(bytes([0]) + struct.pack(">H", len(body)) + body, 0)

    def test_enemy_sprite_animation_decoder_preserves_frame_components(self):
        tracks = []
        for state in range(3):
            for direction in range(4):
                if state == 0 and direction == 1:
                    payload = bytes([
                        2,  # frame count
                        1, 0xF9, 0xF4, 0, 3,  # one sprite at (-7,-12), image 3
                        1, 5, 0xFE, 1, 0,  # mirrored image 0 at (5,-2)
                    ])
                elif state == 0:
                    payload = bytes([2, 0, 0])
                else:
                    payload = bytes([1, 0])  # one empty frame
                tracks.append(bytes([state, direction, len(payload)]) + payload)

        decoded = assets.decode_enemy_sprite_animations(b"".join(reversed(tracks)), 24)

        self.assertEqual(decoded["format"], "heroes-lore-enemy-animation-v1")
        self.assertEqual(decoded["sourceResource"], "enm/spr/24")
        self.assertEqual(decoded["trackCount"], 12)
        track = decoded["tracks"][1]
        self.assertEqual((track["stateIndex"], track["directionIndex"]), (0, 1))
        self.assertEqual(track["frameCount"], 2)
        self.assertEqual(track["frames"], [
            [{"offsetX": -7, "offsetY": -12, "mirrored": False, "imageIndex": 3}],
            [{"offsetX": 5, "offsetY": -2, "mirrored": True, "imageIndex": 0}],
        ])

    def test_enemy_sprite_animation_decoder_rejects_missing_duplicate_and_truncated_tracks(self):
        empty_track = bytes([1, 0])
        header = lambda state, direction, payload: bytes([state, direction, len(payload)]) + payload
        tracks = [header(state, direction, empty_track) for state in range(3) for direction in range(4)]
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_sprite_animations(b"".join(tracks[:-1]), 24)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_sprite_animations(b"".join(tracks) + tracks[0], 24)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_sprite_animations(b"\x00\x00\x05\x01\x01", 24)

        inconsistent = list(tracks)
        inconsistent[1] = header(0, 1, bytes([2, 0, 0]))
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_sprite_animations(b"".join(inconsistent), 24)

    def test_boss_sprite_animation_decoder_preserves_source_attack_tracks(self):
        tracks = []
        for state in (0, 1, 3, 4, 5):
            for direction in range(4):
                if state == 4 and direction == 2:
                    payload = bytes([1, 1, 0xF9, 0xF4, 1, 7])
                else:
                    payload = bytes([1, 0])
                tracks.append(bytes([state, direction, len(payload)]) + payload)

        decoded = assets.decode_boss_sprite_animations(b"".join(reversed(tracks)), 1, 32)

        self.assertEqual(decoded["format"], "heroes-lore-boss-animation-v1")
        self.assertEqual(decoded["sourceResource"], "boss/spr/1_32")
        self.assertEqual(decoded["trackCount"], 20)
        attack_two = next(
            track for track in decoded["tracks"]
            if track["stateIndex"] == 4 and track["directionIndex"] == 2
        )
        self.assertEqual(attack_two["frames"], [[{
            "offsetX": -7,
            "offsetY": -12,
            "mirrored": True,
            "imageIndex": 7,
        }]])

    def test_boss_sprite_animation_decoder_preserves_sparse_sets_and_rejects_bad_records(self):
        header = lambda state, direction, payload: bytes([state, direction, len(payload)]) + payload
        states = (0, 1, 3, 4, 5)
        tracks = [header(state, direction, bytes([1, 0])) for state in states for direction in range(4)]
        sparse = assets.decode_boss_sprite_animations(tracks[0], 3, 40)
        self.assertEqual(sparse["trackCount"], 1)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_boss_sprite_animations(b"".join(tracks) + tracks[0], 1, 32)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_boss_sprite_animations(b"\x06\x00\x02\x01\x01", 1, 32)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_boss_sprite_animations(b"\x00\x00\x05\x01\x01", 1, 32)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_boss_sprite_animations(b"\x00\x00\x01\x00", 1, 32)

    def test_npc_sprite_animation_decoder_preserves_standing_and_walking_components(self):
        tracks = []
        for state in range(2):
            for direction in range(4):
                if state == 1 and direction == 2:
                    payload = bytes([
                        2,  # frame count
                        1, 0xF9, 0xF4, 0, 3,  # image 3 at (-7,-12)
                        1, 5, 0xFE, 1, 255,  # empty mirrored image at (5,-2)
                    ])
                elif state == 1:
                    payload = bytes([2, 0, 0])  # two empty walking frames
                else:
                    payload = bytes([1, 0])  # one empty frame
                tracks.append(bytes([state, direction, len(payload)]) + payload)

        decoded = assets.decode_npc_sprite_animations(b"".join(reversed(tracks)), 16)

        self.assertEqual(decoded["format"], "heroes-lore-npc-animation-v1")
        self.assertEqual(decoded["sourceResource"], "npc/spr/16")
        self.assertEqual(decoded["trackCount"], 8)
        track = decoded["tracks"][6]
        self.assertEqual((track["stateIndex"], track["directionIndex"]), (1, 2))
        self.assertEqual(track["frameCount"], 2)
        self.assertEqual(track["frames"], [
            [{"offsetX": -7, "offsetY": -12, "mirrored": False, "imageIndex": 3}],
            [{"offsetX": 5, "offsetY": -2, "mirrored": True, "imageIndex": -1}],
        ])

    def test_npc_sprite_animation_decoder_rejects_invalid_track_sets(self):
        header = lambda state, direction, payload: bytes([state, direction, len(payload)]) + payload
        empty_track = bytes([1, 0])
        tracks = [header(state, direction, empty_track) for state in range(2) for direction in range(4)]
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_npc_sprite_animations(b"".join(tracks[:-1]), 16)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_npc_sprite_animations(b"".join(tracks) + tracks[0], 16)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_npc_sprite_animations(b"\x00\x00\x05\x01\x01", 16)

        inconsistent = list(tracks)
        inconsistent[1] = header(0, 1, bytes([2, 0, 0]))
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_npc_sprite_animations(b"".join(inconsistent), 16)

    def test_enemy_attack_effect_decoder_preserves_source_frames_and_components(self):
        data = bytes([
            2,  # frame count
            1, 0xF9, 0xF4, 1, 3,  # mirrored image 3 at (-7,-12)
            2, 5, 0xFE, 0, 0, 0, 0, 0, 255,  # image 0 and empty image at (0,0)
        ])

        decoded = assets.decode_enemy_attack_effect(data, 3)

        self.assertEqual(decoded, {
            "format": "heroes-lore-enemy-attack-effect-v1",
            "spriteId": 3,
            "sourceResource": "enm/atef/03",
            "frameCount": 2,
            "frames": [
                [{"offsetX": -7, "offsetY": -12, "mirrored": True, "imageIndex": 3}],
                [
                    {"offsetX": 5, "offsetY": -2, "mirrored": False, "imageIndex": 0},
                    {"offsetX": 0, "offsetY": 0, "mirrored": False, "imageIndex": -1},
                ],
            ],
        })

    def test_enemy_attack_effect_decoder_rejects_truncation_and_trailing_bytes(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_attack_effect(b"", 3)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_attack_effect(bytes([1, 1, 0, 0, 0]), 3)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_enemy_attack_effect(bytes([1, 0, 255]), 3)

    def test_boss_attack_effect_decoder_preserves_owner_and_resource(self):
        decoded = assets.decode_boss_attack_effect(bytes([1, 1, 0xFE, 0xF8, 1, 4]), 2, 36)

        self.assertEqual(decoded, {
            "format": "heroes-lore-boss-attack-effect-v1",
            "spriteId": 36,
            "sourceResource": "boss/atef/36",
            "frameCount": 1,
            "frames": [[{
                "offsetX": -2,
                "offsetY": -8,
                "mirrored": True,
                "imageIndex": 4,
            }]],
            "bossId": 2,
            "enemyId": 36,
        })
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_boss_attack_effect(bytes([1, 0]), 1, 36)

    def test_player_skill_effect_decoder_preserves_source_atlas_selection(self):
        data = bytes([
            2,  # frame count
            1, 0xF9, 0xF4, 0, 3,  # atlas 12 image 3 at (-7,-12)
            1, 5, 0xFE, 1, 7,  # suppressed alternate-atlas component
        ])

        decoded = assets.decode_player_skill_effect(data, 3, 1, "grd/spr/3_1.eif")

        self.assertEqual(decoded, {
            "format": "heroes-lore-player-skill-effect-v1",
            "skillId": 3,
            "levelSlot": 1,
            "sourceResource": "grd/spr/3_1.eif",
            "frameCount": 2,
            "frames": [
                [{"offsetX": -7, "offsetY": -12, "sourceAtlasFlag": 0, "imageIndex": 3}],
                [{"offsetX": 5, "offsetY": -2, "sourceAtlasFlag": 1, "imageIndex": 7}],
            ],
        })

    def test_player_skill_effect_decoder_rejects_invalid_streams(self):
        for data, skill_id, level_slot, resource in [
            (b"", 0, 0, "grd/spr/0_01.eif"),
            (bytes([1, 1, 0, 0, 0]), 0, 0, "grd/spr/0_01.eif"),
            (bytes([1, 0, 255]), 0, 0, "grd/spr/0_01.eif"),
        ]:
            with self.subTest(data=data):
                with self.assertRaises(assets.AssetFormatError):
                    assets.decode_player_skill_effect(data, skill_id, level_slot, resource)
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_player_skill_effect(bytes([1, 0]), 6, 0, "grd/spr/6_0.eif")

    def test_player_skill_special_effect_requires_source_type_two(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_player_skill_special_effect(bytes([1, 0]), 3, "grd/spr/0_02.eif")

    def test_player_level_up_effect_decoder_preserves_frames_offsets_and_suppressed_components(self):
        decoded = assets.decode_player_level_up_effect(bytes([
            2,
            2, 0xF9, 0xF4, 0, 3, 5, 0xFE, 1, 7,
            1, 4, 9, 0, 2,
        ]))

        self.assertEqual(decoded, {
            "format": "heroes-lore-player-level-up-effect-v1",
            "effectType": 4,
            "sourceResource": "char/lvup.eif",
            "sourceAtlas": "char/lvup",
            "sourceAtlasId": 13,
            "frameCount": 2,
            "frames": [
                [
                    {"offsetX": -7, "offsetY": -12, "sourceAtlasFlag": False, "sourceAtlasId": 13, "imageIndex": 3},
                    {"offsetX": 5, "offsetY": -2, "sourceAtlasFlag": True, "sourceAtlasId": -1, "imageIndex": 7},
                ],
                [{"offsetX": 4, "offsetY": 9, "sourceAtlasFlag": False, "sourceAtlasId": 13, "imageIndex": 2}],
            ],
        })

    def test_player_level_up_effect_decoder_rejects_invalid_streams(self):
        for data in (b"", bytes([0]), bytes([1, 1, 0, 0, 0]), bytes([1, 0, 255])):
            with self.subTest(data=data):
                with self.assertRaises(assets.AssetFormatError):
                    assets.decode_player_level_up_effect(data)

    def test_player_level_up_refresh_updates_catalog_and_manifest_idempotently(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "generated"
            atlas_dir = output / "atlases" / "char" / "lvup"
            atlas_dir.mkdir(parents=True)
            for image_index in (2, 3):
                (atlas_dir / f"{image_index:03d}.png").write_bytes(b"png")
            manifest_path = output / "asset-manifest.json"
            manifest_path.write_text(json.dumps({
                "sourceJarSha256": assets.EXPECTED_JAR_SHA256,
                "generatedFileCount": 1,
                "files": [{"path": "existing.json", "sha256": "old", "bytes": 3}],
            }))
            resource = root / "lvup.eif"
            resource.write_bytes(bytes([
                2,
                2, 0xF9, 0xF4, 0, 3, 5, 0xFE, 1, 7,
                1, 4, 9, 0, 2,
            ]))

            result = assets.refresh_player_level_up_effect(resource, output)
            catalog_path = output / "player-level-up-effects" / "catalog.json"
            catalog = json.loads(catalog_path.read_text())
            manifest = json.loads(manifest_path.read_text())
            entry = next(item for item in manifest["files"]
                         if item["path"] == "player-level-up-effects/catalog.json")
            catalog_bytes = catalog_path.read_bytes()

            self.assertEqual(result["frameCount"], 2)
            self.assertEqual(result["componentCount"], 3)
            self.assertEqual(catalog["effects"][0]["frames"][0][1]["sourceAtlasId"], -1)
            self.assertEqual(manifest["generatedFileCount"], 2)
            self.assertEqual(len([item for item in manifest["files"]
                                  if item["path"] == "player-level-up-effects/catalog.json"]), 1)
            self.assertEqual(entry["sha256"], assets.sha256(catalog_bytes))
            self.assertEqual(entry["bytes"], len(catalog_bytes))

            assets.refresh_player_level_up_effect(resource, output)
            repeated_manifest = json.loads(manifest_path.read_text())
            self.assertEqual(repeated_manifest["generatedFileCount"], 2)
            self.assertEqual(len([item for item in repeated_manifest["files"]
                                  if item["path"] == "player-level-up-effects/catalog.json"]), 1)

    def test_player_level_up_refresh_rejects_wrong_asset_manifest_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "generated"
            output.mkdir()
            (output / "asset-manifest.json").write_text(json.dumps({
                "sourceJarSha256": "0" * 64,
                "files": [],
            }))
            resource = root / "lvup.eif"
            resource.write_bytes(bytes([1, 0]))

            with self.assertRaises(assets.AssetFormatError):
                assets.refresh_player_level_up_effect(resource, output)
            self.assertFalse((output / "player-level-up-effects" / "catalog.json").exists())

    def test_player_level_up_refresh_rejects_missing_atlas_page(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "generated"
            output.mkdir()
            (output / "asset-manifest.json").write_text(json.dumps({
                "sourceJarSha256": assets.EXPECTED_JAR_SHA256,
                "files": [],
            }))
            resource = root / "lvup.eif"
            resource.write_bytes(bytes([1, 1, 0, 0, 0, 3]))

            with self.assertRaisesRegex(assets.AssetFormatError, "missing level-up atlas image"):
                assets.refresh_player_level_up_effect(resource, output)
            self.assertFalse((output / "player-level-up-effects" / "catalog.json").exists())

    def test_text_table_decoder_reads_source_string_id_records(self):
        data = b"\x02\x00\x04 685\x00\x04 686"

        decoded = assets.decode_text_table(data, "sgui/help.tdf")

        self.assertEqual(decoded, {
            "format": "heroes-lore-text-table-v1",
            "resource": "sgui/help.tdf",
            "stringIds": [685, 686],
        })

    def test_text_table_decoder_rejects_truncated_and_non_numeric_records(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_text_table(b"\x01\x00\x03\x36\x38", "bad.tdf")
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_text_table(b"\x01\x00\x03abc", "bad.tdf")

    def test_language_decoder_reads_offset_indexed_modified_utf8(self):
        encoded = b"Hello" + b"\xc0\x80" + b"\xc3\xa9"
        payload = (
            struct.pack(">II", 4, 0)
            + b"\x00\x00"
            + struct.pack(">H", len(encoded))
            + encoded
        )
        resource = struct.pack(">I", len(payload)) + payload

        decoded = assets.decode_language_resource(resource, "en-GB")

        self.assertEqual(decoded["format"], "heroes-lore-language-v1")
        self.assertEqual(decoded["locale"], "en-GB")
        self.assertEqual(decoded["stringCount"], 1)
        self.assertEqual(decoded["strings"], [{"id": 0, "text": "Hello\0é"}])

    def test_language_decoder_rejects_invalid_lengths_and_modified_utf8(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_language_resource(b"\0\0\0\x02\0\0\0\x00", "en-GB")

        payload = struct.pack(">II", 4, 0) + b"\0\0\0\x01\xff"
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_language_resource(struct.pack(">I", len(payload)) + payload, "en-GB")

    def test_map_decoder_preserves_header_and_row_major_ids(self):
        decoded = assets.decode_map(bytes([15, 2, 2, 4, 7, 9, 12]))
        self.assertEqual(decoded["tilesetId"], 15)
        self.assertEqual(decoded["width"], 2)
        self.assertEqual(decoded["height"], 2)
        self.assertEqual(decoded["tileIds"], [[4, 7], [9, 12]])

    def test_map_decoder_rejects_grid_length_mismatch(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_map(bytes([15, 2, 2, 4, 7]))

    def test_base_collision_decoder_uses_signed_byte_values(self):
        decoded = assets.decode_base_collision(bytes([0, 127, 128, 255, 19]), 2, 2)
        self.assertEqual(decoded["values"], [[0, 127], [-128, -1]])

    def test_character_sprite_layout_preserves_offsets_flip_and_frame_order(self):
        decoded = assets.decode_character_sprite_layout(bytes([
            2, 3, 2, 2,  # component, animation slot, direction, frame count
            255, 128, 1, 7,
            4, 5, 0, 255,
        ]))
        self.assertEqual(decoded["records"][0], {
            "sourceOrder": 0,
            "sourceOffset": 0,
            "componentSlot": 2,
            "animationSlot": 3,
            "direction": 2,
            "frames": [
                [{"x": -1, "y": -128, "mirrored": True, "imageIndex": 7}],
                [{"x": 4, "y": 5, "mirrored": False, "imageIndex": 255}],
            ],
        })

    def test_nested_character_frames_keep_empty_frames_and_reject_truncation(self):
        data = bytes([7, 3, 2, 2, 0, 1, 255, 128, 1, 7])
        decoded = assets.decode_character_sprite_layout(data, nested_frames=True)
        self.assertEqual(decoded["records"][0]["frames"], [
            [],
            [{"x": -1, "y": -128, "mirrored": True, "imageIndex": 7}],
        ])
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_character_sprite_layout(data[:-1], nested_frames=True)

    def test_event_visual_decoder_preserves_records_and_signed_offsets(self):
        event = bytes([0] * 4 + [2, 3, 7, 1, 1, 1, 0xFF, 0x80, 7])
        decoded = assets.decode_event_visuals(event, 2, 2, 15)
        self.assertEqual(decoded["loadedImageIds"], [3, 7])
        self.assertEqual(decoded["objects"], [{
            "tileX": 1,
            "tileY": 1,
            "offsetX": -1,
            "offsetY": -128,
            "atlasIndex": 7,
            "sourceOrder": 0,
        }])

    def test_atlas_decoder_reassembles_palette_png(self):
        ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0))
        idat = png_chunk(b"IDAT", zlib.compress(b"\x00\x00"))
        mph = (
            struct.pack(">II", 1 << 27, 1)
            + struct.pack(">HIH", 0, 0, 0)
            + png_chunk(b"PLTE", b"\xff\x00\x00")
        )
        decoded = assets.decode_atlas(mph, {0: ihdr + idat})
        self.assertEqual(len(decoded), 1)
        assets._validate_png(decoded[0], 0)
        self.assertEqual([name for name, _, _ in assets.iter_png_chunks(decoded[0], 8)], ["IHDR", "PLTE", "IDAT", "IEND"])

    def test_hero_palette_variant_replaces_only_matching_rgb_entries(self):
        ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0))
        palette = png_chunk(b"PLTE", bytes.fromhex("0000ff 9fbfff 123456"))
        transparency = png_chunk(b"tRNS", b"\x00\xff\xff")
        image_data = png_chunk(b"IDAT", zlib.compress(b"\x00\x00"))
        source = assets.PNG_SIGNATURE + ihdr + palette + transparency + image_data + assets.PNG_IEND

        recolored = assets.replace_png_palette_colors(source, {0x0000FF: 0xFF7F3F})
        assets._validate_png(recolored, 0)
        chunks = {name: recolored[offset + 8 : offset + size - 4]
                  for name, offset, size in assets.iter_png_chunks(recolored, len(assets.PNG_SIGNATURE))}
        self.assertEqual(chunks["PLTE"], bytes.fromhex("ff7f3f 9fbfff 123456"))
        self.assertEqual(chunks["tRNS"], b"\x00\xff\xff")
        self.assertEqual(chunks["IDAT"], image_data[8:-4])

    def test_hero_palette_variant_selection_covers_all_source_class_atlases(self):
        for class_dir in ("c1", "c2", "c3"):
            self.assertEqual(
                assets._hero_palette_variants_for_atlas(f"{class_dir}/i/e"),
                assets.HERO_EFFECT_ELEMENT_PALETTES,
            )
            self.assertEqual(
                assets._hero_palette_variants_for_atlas(f"{class_dir}/i/w5"),
                assets.HERO_WEAPON_ELEMENT_PALETTES,
            )
            self.assertEqual(assets._hero_palette_variants_for_atlas(f"{class_dir}/i/a1"), {})
        self.assertEqual(assets._hero_palette_variants_for_atlas("sgui/mm/etc"), {})

    def test_hero_palette_variant_rejects_truecolor_png_and_invalid_rgb(self):
        ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        image_data = png_chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00"))
        truecolor = assets.PNG_SIGNATURE + ihdr + image_data + assets.PNG_IEND
        with self.assertRaisesRegex(assets.AssetFormatError, "PLTE"):
            assets.replace_png_palette_colors(truecolor, {0x0000FF: 0xFF7F3F})

        indexed = assets.PNG_SIGNATURE + png_chunk(
            b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0)
        ) + png_chunk(b"PLTE", b"\x00\x00\x00") + image_data + assets.PNG_IEND
        with self.assertRaisesRegex(assets.AssetFormatError, "24-bit"):
            assets.replace_png_palette_colors(indexed, {-1: 0xFFFFFF})

    def test_bitmap_font_decoder_extracts_ascii_offsets_and_embedded_png(self):
        ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0))
        palette = png_chunk(b"PLTE", b"\x00\x00\x00")
        idat = png_chunk(b"IDAT", zlib.compress(b"\x00\x00"))
        png = assets.PNG_SIGNATURE + ihdr + palette + idat + assets.PNG_IEND
        offsets = [0] * 95
        offsets[-1] = 1
        resource = (
            bytes(4) + bytes([8, 6, 3, 0])
            + b"".join(struct.pack(">H", offset) for offset in offsets)
            + struct.pack(">H", len(png)) + bytes(6) + png
        )

        decoded_png, layout = assets.decode_bitmap_font(resource)

        self.assertEqual(decoded_png, png)
        self.assertEqual(layout["height"], 8)
        self.assertEqual(layout["spaceAdvance"], 3)
        self.assertEqual(layout["glyphOffsets"][-2:], [0, 1])

    def test_bitmap_font_decoder_rejects_truncated_png(self):
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_bitmap_font(bytes(16))

    def test_extractor_rejects_unpinned_jar_before_writing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            jar = root / "wrong.jar"
            output = root / "generated"
            jar.write_bytes(b"not the pinned jar")
            with self.assertRaises(assets.AssetFormatError):
                assets.extract(jar, output)
            self.assertFalse(output.exists())


class EventOperationDecoderTests(unittest.TestCase):
    @staticmethod
    def sample_event():
        # One collision byte, empty decoration/NPC/enemy/face sections,
        # empty auxiliary tables, one descriptor and one four-byte action.
        return bytes([
            0,  # collision
            0, 0,  # decoration image count, decoration count
            0, 0,  # NPC image count, NPC placement count
            0, 0,  # enemy image count, enemy placement count
            0,  # face reference count
            0, 0, 0,  # auxiliary table counts
            1, 0, 7, 1,  # descriptor count, 10-bit cell index, marker
            1, 1, 200, 2, 3, 255,  # block/action counts, signed opcode, raw args
        ])

    def test_event_operations_preserve_headers_records_and_signed_opcode(self):
        parsed = assets.decode_event_operations(self.sample_event(), 1, 1)
        self.assertEqual(parsed["descriptorTableOffset"], 11)
        self.assertEqual(parsed["descriptors"], [
            {"sourceOrder": 0, "cellIndex": 7, "rawMarkerByte": 1, "sourceOffset": 12},
        ])
        self.assertEqual(parsed["actionBlocks"][0]["actions"], [
            {
                "sourceOrder": 0,
                "opcode": -56,
                "rawOpcode": 200,
                "arguments": [2, 3, 255],
                "sourceOffset": 17,
            },
        ])
        self.assertTrue(parsed["descriptorActionBlockCountMatch"])
        self.assertFalse(parsed["opcodeEffectsVerified"])

    def test_event_operations_reject_truncated_action_records(self):
        truncated = self.sample_event()[:-1]
        with self.assertRaises(assets.AssetFormatError):
            assets.decode_event_operations(truncated, 1, 1)

    def test_event_operations_preserve_trigger_groups_and_script_commands(self):
        event = bytes([
            0, 0, 0,  # collision and empty decorations
            0, 0,  # empty NPC references and placements
            0, 0,  # empty enemy references and placements
            0,  # empty face references
            1, 1, 192, 0, 0, 255, 0, 0, 0,  # one type-3 trigger row
            1, 3, 7, 0, 1, 8, 26, 24, 99, 0, 0,  # map transition script
            0,  # no strings
            0, 0,  # no descriptors or action blocks
        ])
        parsed = assets.decode_event_operations(event, 1, 1)
        self.assertEqual(parsed["triggerGroups"], [[[192, 0, 0, 255, 0, 0, 0]]])
        self.assertEqual(parsed["scripts"], [[[7, 0, 1], [8, 26, 24], [99, 0, 0]]])

    def test_event_operations_preserve_npc_sprite_references_and_placements(self):
        event = bytes([
            0, 0, 0,  # collision and empty decorations
            1, 20, 1, 22, 3, 20,  # one NPC image reference and placement
            0, 0,  # empty enemy references and placements
            0,  # empty face references
            0, 0, 0,  # empty trigger, script and string tables
            0, 0,  # no descriptors or action blocks
        ])
        parsed = assets.decode_event_operations(event, 1, 1)
        self.assertEqual(parsed["npcImageIds"], [20])
        self.assertEqual(parsed["npcPlacements"], [
            {"tileX": 22, "tileY": 3, "imageId": 20, "sourceOrder": 0},
        ])

    def test_event_operations_preserve_enemy_definition_ids_and_placements(self):
        event = bytes([
            0, 0, 0,  # collision and empty decorations
            0, 0,  # empty NPC references and placements
            2, 35, 36, 2, 4, 5, 35, 8, 9, 36,  # enemy refs and placements
            0,  # empty face references
            0, 0, 0,  # empty trigger, script and string tables
            0, 0,  # no descriptors or action blocks
        ])

        parsed = assets.decode_event_operations(event, 1, 1)

        self.assertEqual(parsed["enemyIds"], [35, 36])
        self.assertEqual(parsed["enemyPlacements"], [
            {"tileX": 4, "tileY": 5, "enemyId": 35, "sourceOrder": 0},
            {"tileX": 8, "tileY": 9, "enemyId": 36, "sourceOrder": 1},
        ])


if __name__ == "__main__":
    unittest.main()
