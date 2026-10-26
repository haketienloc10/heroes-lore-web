#!/usr/bin/env python3
"""Extract local v2.1.2 images, maps, localized text and event data for the web port.

Generated game assets are copyrighted and must remain under ignored local
directories. This tool refuses JARs whose SHA-256 differs from the pinned
reference build.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import zipfile
import zlib
from pathlib import Path, PurePosixPath
from typing import Iterable


EXPECTED_JAR_SHA256 = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
DEFAULT_JAR = Path("original/heroes-lore-v2.1.2.jar")
DEFAULT_OUTPUT = Path("web/public/assets/generated")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_IEND = b"\x00\x00\x00\x00IEND\xaeB`\x82"
PNG_CHUNKS = (
    "IHDR", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "tEXt", "zTXt",
    "iTXt", "pHYs", "sPLT", "tIME", "PLTE", "tRNS", "hIST", "bKGD",
    "IDAT", "IEND",
)
HERO_WEAPON_ELEMENT_PALETTES = {
    1: {0x0000FF: 0xFF7F3F},
    2: {0x0000FF: 0x5F7FBF},
    3: {0x0000FF: 0x7FFF7F},
}
HERO_EFFECT_ELEMENT_PALETTES = {
    1: {0xBFDFFF: 0xFFFFC0, 0x9FBFFF: 0xFFBF7F, 0x5F7FBF: 0xFF7F3F},
    3: {0xBFDFFF: 0xDFFFBF, 0x9FBFFF: 0xBFDFBF, 0x5F7FBF: 0x9FBF7F},
}


class AssetFormatError(ValueError):
    """Raised when a JAR resource is truncated or has an unsupported layout."""


def _decode_modified_utf8(data: bytes) -> str:
    """Decode the UTF-8 variant used by Java DataInputStream.readUTF."""
    units: list[int] = []
    offset = 0
    while offset < len(data):
        first = data[offset]
        offset += 1
        if 0x01 <= first <= 0x7F:
            units.append(first)
        elif first & 0xE0 == 0xC0:
            if offset >= len(data) or data[offset] & 0xC0 != 0x80:
                raise AssetFormatError("invalid modified UTF-8 two-byte sequence")
            units.append(((first & 0x1F) << 6) | (data[offset] & 0x3F))
            offset += 1
        elif first & 0xF0 == 0xE0:
            if offset + 1 >= len(data) or data[offset] & 0xC0 != 0x80 or data[offset + 1] & 0xC0 != 0x80:
                raise AssetFormatError("invalid modified UTF-8 three-byte sequence")
            units.append(
                ((first & 0x0F) << 12)
                | ((data[offset] & 0x3F) << 6)
                | (data[offset + 1] & 0x3F)
            )
            offset += 2
        else:
            raise AssetFormatError("modified UTF-8 contains an unsupported leading byte")

    utf16 = b"".join(struct.pack(">H", unit) for unit in units)
    return utf16.decode("utf-16-be", errors="surrogatepass")


def decode_language_resource(data: bytes, locale: str) -> dict[str, object]:
    """Decode the game's offset-indexed DataInputStream language resource.

    `ci.a(int)` indexes four-byte relative offsets, skips a two-byte record
    header, then reads a Java modified-UTF string. The first offset gives the
    byte length of the offset table.
    """
    if len(data) < 9:
        raise AssetFormatError("language resource is shorter than its header")
    payload_size = _u32(data, 0)
    if payload_size != len(data) - 4:
        raise AssetFormatError("language resource length header does not match its payload")
    payload = data[4:]
    table_size = _u32(payload, 0)
    if table_size == 0 or table_size % 4 != 0 or table_size > len(payload):
        raise AssetFormatError("language offset table has an invalid byte length")

    strings: list[dict[str, object]] = []
    for index in range(table_size // 4):
        table_entry = index * 4
        relative_offset = _u32(payload, table_entry)
        header_offset = table_entry + 4 + relative_offset
        length_offset = header_offset + 2
        string_length = _u16(payload, length_offset)
        string_start = length_offset + 2
        string_end = string_start + string_length
        if string_end > len(payload):
            raise AssetFormatError(f"language string {index} extends past the resource")
        strings.append({
            "id": index,
            "text": _decode_modified_utf8(payload[string_start:string_end]),
        })

    return {
        "format": "heroes-lore-language-v1",
        "locale": locale,
        "stringCount": len(strings),
        "strings": strings,
    }


def decode_text_table(data: bytes, resource_name: str) -> dict[str, object]:
    """Decode one source `.tdf` table of localized string IDs.

    The source `y` loader reads a one-byte row count followed by that many
    two-byte big-endian byte lengths and decimal string IDs.
    """
    if not data:
        raise AssetFormatError("text table is empty")
    row_count = data[0]
    offset = 1
    string_ids: list[int] = []
    for row_index in range(row_count):
        record_length = _u16(data, offset)
        offset += 2
        end = offset + record_length
        if record_length == 0 or end > len(data):
            raise AssetFormatError(f"text table row {row_index} has an invalid length")
        try:
            record = data[offset:end].decode("ascii").strip()
        except UnicodeDecodeError as exc:
            raise AssetFormatError(f"text table row {row_index} is not ASCII") from exc
        if not record.isdecimal():
            raise AssetFormatError(f"text table row {row_index} is not a decimal string ID")
        string_ids.append(int(record))
        offset = end
    if offset != len(data):
        raise AssetFormatError(f"text table has {len(data) - offset} trailing bytes")
    return {
        "format": "heroes-lore-text-table-v1",
        "resource": resource_name,
        "stringIds": string_ids,
    }


def decode_enemy_data(data: bytes, variant: int) -> dict[str, object]:
    """Decode one indexed `/enm/dataN` table using the source `i.a` reader.

    Records start after a one-byte table marker. Each record has a two-byte
    length, one skipped byte, then a length-prefixed ASCII token and packed
    actor fields. Numeric attribute names below are limited to fields whose
    use is clear in the Java source; the other codes and three-byte drop
    candidates stay opaque.
    """
    if not data:
        raise AssetFormatError("enemy data table is empty")

    records: list[dict[str, object]] = []
    offset = 1
    while offset < len(data):
        source_offset = offset
        if offset + 2 > len(data):
            raise AssetFormatError(f"truncated enemy record length at offset {offset}")
        record_length = _u16(data, offset)
        record_end = offset + 2 + record_length
        cursor = offset + 2
        if record_end > len(data):
            raise AssetFormatError(f"enemy record {len(records)} extends past the table")
        if cursor >= record_end:
            raise AssetFormatError(f"enemy record {len(records)} has no skipped byte")

        cursor += 1  # `i.a` advances past one source byte before reading the token.
        if cursor >= record_end:
            raise AssetFormatError(f"enemy record {len(records)} has no token length")
        token_length = data[cursor]
        cursor += 1
        token_end = cursor + token_length
        if token_end > record_end:
            raise AssetFormatError(f"enemy record {len(records)} has a truncated token")
        try:
            label_token = data[cursor:token_end].decode("ascii")
        except UnicodeDecodeError as exc:
            raise AssetFormatError(f"enemy record {len(records)} token is not ASCII") from exc
        cursor = token_end

        fixed_size = 1 + 1 + 1 + 8 + 3 + 2 + 1
        if cursor + fixed_size > record_end:
            raise AssetFormatError(f"enemy record {len(records)} has truncated actor fields")
        packed_attributes = data[cursor]
        cursor += 1
        status_flags = data[cursor]
        cursor += 1
        base_code = data[cursor]
        cursor += 1
        max_hp, attack, defense, evasion = (
            _u16(data, cursor + field_offset * 2) for field_offset in range(4)
        )
        cursor += 8
        behavior_codes = list(data[cursor : cursor + 3])
        cursor += 3
        respawn_delay = _u16(data, cursor)
        cursor += 2
        drop_count = data[cursor]
        cursor += 1
        drop_end = cursor + drop_count * 3
        if drop_end != record_end:
            raise AssetFormatError(
                f"enemy record {len(records)} has inconsistent three-byte drop table length"
            )
        drop_candidates = [
            list(data[drop_offset : drop_offset + 3])
            for drop_offset in range(cursor, drop_end, 3)
        ]

        records.append({
            "index": len(records),
            "sourceOffset": source_offset,
            "recordLength": record_length,
            "labelToken": label_token,
            "packedAttributes": {
                "classCode": (packed_attributes >> 6) & 0x03,
                "shapeCode": (packed_attributes >> 4) & 0x03,
                "elementCode": (packed_attributes >> 2) & 0x03,
                "variantCode": packed_attributes & 0x03,
            },
            "statusFlags": {
                "raw": status_flags,
                "bit3": bool(status_flags & 0x08),
                "bit2": bool(status_flags & 0x04),
                "bit1": bool(status_flags & 0x02),
                "bit0": bool(status_flags & 0x01),
                "conditionalCode": (status_flags >> 6) & 0x03 if status_flags & 0x02 else None,
            },
            "baseCode": base_code,
            "maxHp": max_hp,
            "attack": attack,
            "defense": defense,
            "evasion": evasion,
            "behaviorCodes": behavior_codes,
            "respawnDelay": respawn_delay,
            "dropCandidates": drop_candidates,
        })
        offset = record_end

    return {
        "format": "heroes-lore-enemy-data-v1",
        "sourceResource": f"enm/data{variant}",
        "variant": variant,
        "tableMarker": data[0],
        "recordCount": len(records),
        "records": records,
    }


def decode_equipment_data(data: bytes, category: int) -> dict[str, object]:
    """Extract numeric `/itm/00`–`06` fields needed to construct source equipment.

    `cd.m69a(category, itemId)` seeks through one-byte length-prefixed records.
    `ac` skips the leading record byte and parses two length-prefixed strings,
    a little-endian source integer, then `d`'s 12-byte equipment block. Text is
    deliberately omitted; localized strings remain in the separate TDF tables.
    """
    if category < 0 or category > 6:
        raise AssetFormatError("equipment category must be from 0 through 6")
    if not data:
        raise AssetFormatError(f"equipment category {category} is empty")

    subtype_size = 3 if category <= 2 else 1 if category == 3 else 0
    records: list[dict[str, object]] = []
    offset = 0
    while offset < len(data):
        record_index = len(records)
        record_length = data[offset]
        record_start = offset + 1
        record_end = record_start + record_length
        if record_length == 0 or record_end > len(data):
            raise AssetFormatError(f"equipment item {category}:{record_index} has an invalid record length")
        record = data[record_start:record_end]
        if len(record) < 1:
            raise AssetFormatError(f"equipment item {category}:{record_index} has no type byte")

        cursor = 1  # `ac.a(..., 1)` skips the record's first byte.
        for label in ("name", "description"):
            if cursor >= len(record):
                raise AssetFormatError(f"equipment item {category}:{record_index} has no {label} length")
            string_length = record[cursor]
            cursor += 1
            if cursor + string_length > len(record):
                raise AssetFormatError(f"equipment item {category}:{record_index} has a truncated {label}")
            cursor += string_length
        if cursor + 4 + 12 + subtype_size != len(record):
            raise AssetFormatError(f"equipment item {category}:{record_index} has an unexpected record size")

        source_value = int.from_bytes(record[cursor:cursor + 4], "little", signed=True)
        cursor += 4
        equipment_byte = record[cursor]
        equipment_type = record[cursor + 1]
        if equipment_type >= 128:
            equipment_type -= 256
        characteristic_flag = record[cursor + 2] != 0
        bonus_roll_count = record[cursor + 3]
        if bonus_roll_count >= 128:
            bonus_roll_count -= 256
        ranges: list[list[int]] = []
        eligible_slots = 0
        for slot in range(4):
            minimum = record[cursor + 4 + slot * 2]
            maximum = record[cursor + 5 + slot * 2]
            if minimum >= 128:
                minimum -= 256
            if maximum >= 128:
                maximum -= 256
            if minimum > maximum:
                raise AssetFormatError(
                    f"equipment item {category}:{record_index} has a reversed bonus range"
                )
            eligible_slots += minimum != 0 or maximum != 0
            ranges.append([minimum, maximum])
        if bonus_roll_count < 0 or bonus_roll_count > eligible_slots:
            raise AssetFormatError(
                f"equipment item {category}:{record_index} has an impossible bonus-roll count"
            )
        cursor += 12
        subtype_bytes = list(record[cursor:cursor + subtype_size])
        if cursor + subtype_size != len(record):
            raise AssetFormatError(f"equipment item {category}:{record_index} has trailing bytes")

        records.append({
            "itemId": record_index,
            "recordTypeCode": record[0],
            "sourceValue": source_value,
            "equipmentByte": equipment_byte,
            "equipmentType": equipment_type,
            "characteristicFlag": characteristic_flag,
            "bonusRollCount": bonus_roll_count,
            "bonusRanges": ranges,
            "subtypeBytes": subtype_bytes,
        })
        offset = record_end

    return {
        "format": "heroes-lore-equipment-data-v1",
        "sourceResource": f"itm/{category:02}",
        "category": category,
        "recordCount": len(records),
        "records": records,
    }


def decode_item_commerce_record(data: bytes, category: int, item_id: int) -> dict[str, int]:
    """Read the localized name IDs and source price common to `/itm/N` records."""
    if len(data) < 9:
        raise AssetFormatError(f"item {category}:{item_id} has an invalid record size")
    record_type_code = data[0]
    if record_type_code > 23:
        raise AssetFormatError(f"item {category}:{item_id} has an invalid type code")
    cursor = 1  # Category data is indexed by record order; only shop rows store an item byte.
    string_ids: list[int] = []
    for label in ("name", "description"):
        if cursor >= len(data):
            raise AssetFormatError(f"item {category}:{item_id} has no {label} length")
        string_length = data[cursor]
        cursor += 1
        end = cursor + string_length
        if string_length == 0 or end > len(data):
            raise AssetFormatError(f"item {category}:{item_id} has an invalid {label} string")
        try:
            string_id = int(data[cursor:end].decode("ascii"))
        except (UnicodeDecodeError, ValueError) as error:
            raise AssetFormatError(f"item {category}:{item_id} has a non-numeric {label} ID") from error
        if string_id < 0:
            raise AssetFormatError(f"item {category}:{item_id} has a negative {label} ID")
        string_ids.append(string_id)
        cursor = end
    if cursor + 4 > len(data):
        raise AssetFormatError(f"item {category}:{item_id} has no complete source price")
    return {
        "category": category,
        "itemId": item_id,
        "recordTypeCode": record_type_code,
        "nameStringId": string_ids[0],
        "descriptionStringId": string_ids[1],
        "sourceValue": int.from_bytes(data[cursor:cursor + 4], "little", signed=True),
    }


def decode_item_commerce_catalog(
    item_resources: list[bytes],
    shop_data: bytes,
    mixture_data: bytes,
) -> dict[str, object]:
    """Decode item prices, `/itm/forshop` stock, and `/itm/mixtbl` recipes."""
    if len(item_resources) != 24:
        raise AssetFormatError("item commerce catalog must include categories 0 through 23")
    categories: list[dict[str, object]] = []
    for category, resource in enumerate(item_resources):
        records: list[dict[str, int]] = []
        offset = 0
        while offset < len(resource):
            record_length = resource[offset]
            start = offset + 1
            end = start + record_length
            if record_length == 0 or end > len(resource):
                raise AssetFormatError(f"item category {category} has an invalid record length")
            record = decode_item_commerce_record(resource[start:end], category, len(records))
            records.append(record)
            offset = end
        if not records:
            raise AssetFormatError(f"item category {category} is empty")
        categories.append({
            "category": category,
            "recordCount": len(records),
            "records": records,
        })

    tab_by_category = {0: 1, 1: 1, 2: 1, 3: 2, 4: 5, 5: 3, 6: 4, 7: 0, 9: 0, 10: 0}
    shop_stock: list[list[dict[str, int]]] = [[] for _ in range(6)]
    offset = 0
    while offset < len(shop_data):
        record_length = shop_data[offset]
        start = offset + 1
        end = start + record_length
        if record_length == 0 or end > len(shop_data):
            raise AssetFormatError("shop stock has an invalid record length")
        if record_length < 2:
            raise AssetFormatError("shop stock record has no item reference")
        category, item_id = shop_data[start], shop_data[start + 1]
        tab = tab_by_category.get(category)
        if tab is not None:
            if category >= len(categories) or item_id >= len(categories[category]["records"]):
                raise AssetFormatError(f"shop stock references missing item {category}:{item_id}")
            shop_stock[tab].append({"category": category, "itemId": item_id})
        offset = end

    recipes: list[dict[str, object]] = []
    offset = 0
    while offset < len(mixture_data):
        ingredient_count = mixture_data[offset]
        cursor = offset + 1
        if ingredient_count < 2 or ingredient_count > 3 or cursor + ingredient_count * 2 + 2 > len(mixture_data):
            raise AssetFormatError("mixture table has an invalid recipe length")
        ingredients = [
            {"category": mixture_data[cursor + index * 2], "itemId": mixture_data[cursor + index * 2 + 1]}
            for index in range(ingredient_count)
        ]
        cursor += ingredient_count * 2
        result = {"category": mixture_data[cursor], "itemId": mixture_data[cursor + 1]}
        recipes.append({"ingredients": ingredients, "result": result})
        offset = cursor + 2

    return {
        "format": "heroes-lore-commerce-catalog-v1",
        "categoryCount": len(categories),
        "categories": categories,
        "shopStock": shop_stock,
        "recipeCount": len(recipes),
        "recipes": recipes,
    }


def decode_enemy_sprite_animations(data: bytes, sprite_id: int) -> dict[str, object]:
    """Decode `/enm/spr/N` frame records used by `cd.a` and `ar.b`.

    Each record is a state byte, a zero-based facing byte, a payload byte
    length, then a frame count followed by per-frame draw lists. Draw-list
    entries are signed x/y offsets, a horizontal-mirror flag, and an image
    index into `/enm/N`. The source bytecode confirms that `ar.b` walks each
    frame as a component count followed by four-byte draw entries.
    """
    if not 0 <= sprite_id <= 255:
        raise AssetFormatError("enemy sprite ID must fit in an unsigned byte")
    if not data:
        raise AssetFormatError("enemy sprite animation resource is empty")

    tracks: list[dict[str, object]] = []
    seen: set[tuple[int, int]] = set()
    offset = 0
    while offset < len(data):
        if offset + 3 > len(data):
            raise AssetFormatError(f"truncated enemy animation header at offset {offset}")
        state_index, direction_index, payload_length = data[offset : offset + 3]
        source_offset = offset
        offset += 3
        payload_end = offset + payload_length
        if payload_end > len(data):
            raise AssetFormatError(f"enemy animation payload at offset {source_offset} is truncated")
        if state_index > 2 or direction_index > 3:
            raise AssetFormatError(f"enemy animation at offset {source_offset} has an invalid state or direction")
        track_key = (state_index, direction_index)
        if track_key in seen:
            raise AssetFormatError(f"duplicate enemy animation state/direction {track_key}")
        seen.add(track_key)
        if payload_length < 1:
            raise AssetFormatError(f"enemy animation at offset {source_offset} has no frame count")

        frame_count = data[offset]
        if frame_count < 1:
            raise AssetFormatError(f"enemy animation at offset {source_offset} has no frames")
        cursor = offset + 1
        frames: list[list[dict[str, object]]] = []
        for frame_index in range(frame_count):
            if cursor >= payload_end:
                raise AssetFormatError(f"enemy animation frame {frame_index} has no component count")
            component_count = data[cursor]
            cursor += 1
            frame_end = cursor + component_count * 4
            if frame_end > payload_end:
                raise AssetFormatError(f"enemy animation frame {frame_index} has truncated draw entries")
            components: list[dict[str, object]] = []
            for component_offset in range(cursor, frame_end, 4):
                image_index = data[component_offset + 3]
                components.append({
                    "offsetX": data[component_offset] - 256 if data[component_offset] >= 128 else data[component_offset],
                    "offsetY": data[component_offset + 1] - 256 if data[component_offset + 1] >= 128 else data[component_offset + 1],
                    "mirrored": data[component_offset + 2] != 0,
                    "imageIndex": -1 if image_index == 255 else image_index,
                })
            cursor = frame_end
            frames.append(components)
        if cursor != payload_end:
            raise AssetFormatError(
                f"enemy animation at offset {source_offset} has {payload_end - cursor} trailing payload bytes"
            )
        tracks.append({
            "stateIndex": state_index,
            "directionIndex": direction_index,
            "sourceOffset": source_offset,
            "frameCount": frame_count,
            "frames": frames,
        })
        offset = payload_end

    expected_tracks = {(state, direction) for state in range(3) for direction in range(4)}
    if seen != expected_tracks:
        missing = sorted(expected_tracks - seen)
        raise AssetFormatError(f"enemy sprite {sprite_id} is missing animation tracks {missing}")
    frame_counts_by_state = {
        state: {int(track["frameCount"]) for track in tracks if track["stateIndex"] == state}
        for state in range(3)
    }

    if any(len(frame_counts) != 1 for frame_counts in frame_counts_by_state.values()):
        raise AssetFormatError(f"enemy sprite {sprite_id} has inconsistent facing frame counts")
    tracks.sort(key=lambda track: (int(track["stateIndex"]), int(track["directionIndex"])))
    return {
        "format": "heroes-lore-enemy-animation-v1",
        "spriteId": sprite_id,
        "sourceResource": f"enm/spr/{sprite_id:02d}",
        "trackCount": len(tracks),
        "tracks": tracks,
    }


def decode_boss_sprite_animations(data: bytes, boss_id: int, enemy_id: int) -> dict[str, object]:
    """Decode `/boss/spr/BOSS_ENEMY` tracks used by the source boss subclass.

    Boss tracks preserve source states 0/1/3/4/5: idle, walking, and the
    three attack patterns. In this map-11 resource `cb.d(byte)` selects one
    of states 3/4/5 for its current attack; state 2 is absent.
    """
    if not 1 <= boss_id <= 4 or not 0 <= enemy_id <= 255:
        raise AssetFormatError("boss and enemy IDs must fit their source resource range")
    if not data:
        raise AssetFormatError("boss sprite animation resource is empty")

    source_states = range(6)
    tracks: list[dict[str, object]] = []
    seen: set[tuple[int, int]] = set()
    offset = 0
    while offset < len(data):
        if offset + 3 > len(data):
            raise AssetFormatError(f"truncated boss animation header at offset {offset}")
        state_index, direction_index, payload_length = data[offset : offset + 3]
        source_offset = offset
        offset += 3
        payload_end = offset + payload_length
        if payload_end > len(data):
            raise AssetFormatError(f"boss animation payload at offset {source_offset} is truncated")
        if state_index not in source_states or direction_index > 3:
            raise AssetFormatError(f"boss animation at offset {source_offset} has an invalid state or direction")
        track_key = (state_index, direction_index)
        if track_key in seen:
            raise AssetFormatError(f"duplicate boss animation state/direction {track_key}")
        seen.add(track_key)
        if payload_length < 1:
            raise AssetFormatError(f"boss animation at offset {source_offset} has no frame count")

        frame_count = data[offset]
        if frame_count < 1:
            raise AssetFormatError(f"boss animation at offset {source_offset} has no frames")
        cursor = offset + 1
        frames: list[list[dict[str, object]]] = []
        for frame_index in range(frame_count):
            if cursor >= payload_end:
                raise AssetFormatError(f"boss animation frame {frame_index} has no component count")
            component_count = data[cursor]
            cursor += 1
            frame_end = cursor + component_count * 4
            if frame_end > payload_end:
                raise AssetFormatError(f"boss animation frame {frame_index} has truncated draw entries")
            components: list[dict[str, object]] = []
            for component_offset in range(cursor, frame_end, 4):
                image_index = data[component_offset + 3]
                components.append({
                    "offsetX": data[component_offset] - 256 if data[component_offset] >= 128 else data[component_offset],
                    "offsetY": data[component_offset + 1] - 256 if data[component_offset + 1] >= 128 else data[component_offset + 1],
                    "mirrored": data[component_offset + 2] != 0,
                    "imageIndex": -1 if image_index == 255 else image_index,
                })
            cursor = frame_end
            frames.append(components)
        if cursor != payload_end:
            raise AssetFormatError(
                f"boss animation at offset {source_offset} has {payload_end - cursor} trailing payload bytes"
            )
        tracks.append({
            "stateIndex": state_index,
            "directionIndex": direction_index,
            "sourceOffset": source_offset,
            "frameCount": frame_count,
            "frames": frames,
        })
        offset = payload_end

    if not tracks:
        raise AssetFormatError(f"boss sprite {boss_id}/{enemy_id} has no animation tracks")
    tracks.sort(key=lambda track: (int(track["stateIndex"]), int(track["directionIndex"])))
    return {
        "format": "heroes-lore-boss-animation-v1",
        "bossId": boss_id,
        "enemyId": enemy_id,
        "sourceResource": f"boss/spr/{boss_id}_{enemy_id}",
        "trackCount": len(tracks),
        "tracks": tracks,
    }


def decode_npc_sprite_animations(data: bytes, npc_id: int) -> dict[str, object]:
    """Decode the two-state `/npc/spr/N` tracks used by `ab.a` and `ar.b`."""
    if not 0 <= npc_id <= 255:
        raise AssetFormatError("NPC sprite ID must fit in an unsigned byte")
    if not data:
        raise AssetFormatError("NPC sprite animation resource is empty")

    tracks: list[dict[str, object]] = []
    seen: set[tuple[int, int]] = set()
    offset = 0
    while offset < len(data):
        if offset + 3 > len(data):
            raise AssetFormatError(f"truncated NPC animation header at offset {offset}")
        state_index, direction_index, payload_length = data[offset : offset + 3]
        source_offset = offset
        offset += 3
        payload_end = offset + payload_length
        if payload_end > len(data):
            raise AssetFormatError(f"NPC animation payload at offset {source_offset} is truncated")
        if state_index > 1 or direction_index > 3:
            raise AssetFormatError(f"NPC animation at offset {source_offset} has an invalid state or direction")
        track_key = (state_index, direction_index)
        if track_key in seen:
            raise AssetFormatError(f"duplicate NPC animation state/direction {track_key}")
        seen.add(track_key)
        if payload_length < 1:
            raise AssetFormatError(f"NPC animation at offset {source_offset} has no frame count")

        frame_count = data[offset]
        if frame_count < 1:
            raise AssetFormatError(f"NPC animation at offset {source_offset} has no frames")
        cursor = offset + 1
        frames: list[list[dict[str, object]]] = []
        for frame_index in range(frame_count):
            if cursor >= payload_end:
                raise AssetFormatError(f"NPC animation frame {frame_index} has no component count")
            component_count = data[cursor]
            cursor += 1
            frame_end = cursor + component_count * 4
            if frame_end > payload_end:
                raise AssetFormatError(f"NPC animation frame {frame_index} has truncated draw entries")
            components: list[dict[str, object]] = []
            for component_offset in range(cursor, frame_end, 4):
                image_index = data[component_offset + 3]
                components.append({
                    "offsetX": data[component_offset] - 256 if data[component_offset] >= 128 else data[component_offset],
                    "offsetY": data[component_offset + 1] - 256 if data[component_offset + 1] >= 128 else data[component_offset + 1],
                    "mirrored": data[component_offset + 2] != 0,
                    "imageIndex": -1 if image_index == 255 else image_index,
                })
            cursor = frame_end
            frames.append(components)
        if cursor != payload_end:
            raise AssetFormatError(
                f"NPC animation at offset {source_offset} has {payload_end - cursor} trailing payload bytes"
            )
        tracks.append({
            "stateIndex": state_index,
            "directionIndex": direction_index,
            "sourceOffset": source_offset,
            "frameCount": frame_count,
            "frames": frames,
        })
        offset = payload_end

    expected_tracks = {(state, direction) for state in range(2) for direction in range(4)}
    if seen != expected_tracks:
        missing = sorted(expected_tracks - seen)
        raise AssetFormatError(f"NPC sprite {npc_id} is missing animation tracks {missing}")
    for state_index in range(2):
        frame_counts = {int(track["frameCount"]) for track in tracks if track["stateIndex"] == state_index}
        if len(frame_counts) != 1:
            raise AssetFormatError(f"NPC sprite {npc_id} has inconsistent state-{state_index} frame counts")
    tracks.sort(key=lambda track: (int(track["stateIndex"]), int(track["directionIndex"])))
    return {
        "format": "heroes-lore-npc-animation-v1",
        "npcId": npc_id,
        "sourceResource": f"npc/spr/{npc_id:02d}",
        "trackCount": len(tracks),
        "tracks": tracks,
    }



def decode_enemy_attack_effect(data: bytes, sprite_id: int) -> dict[str, object]:
    """Decode the frame/component stream used by `/enm/atef/N`.

    The source loader passes this byte stream through `cd.a` and `ar.b`: one
    frame count, followed by a component count and four-byte draw entries for
    each frame. Components reference images in the matching `/enm/N` atlas.
    """
    if not 0 <= sprite_id <= 255:
        raise AssetFormatError("enemy effect sprite ID must fit in an unsigned byte")
    if not data:
        raise AssetFormatError("enemy attack effect resource is empty")
    frame_count = data[0]
    if frame_count < 1:
        raise AssetFormatError("enemy attack effect has no animation frames")
    cursor = 1
    frames: list[list[dict[str, object]]] = []
    for frame_index in range(frame_count):
        if cursor >= len(data):
            raise AssetFormatError(f"enemy attack effect frame {frame_index} has no component count")
        component_count = data[cursor]
        cursor += 1
        frame_end = cursor + component_count * 4
        if frame_end > len(data):
            raise AssetFormatError(f"enemy attack effect frame {frame_index} has truncated draw entries")
        components: list[dict[str, object]] = []
        for component_offset in range(cursor, frame_end, 4):
            image_index = data[component_offset + 3]
            components.append({
                "offsetX": data[component_offset] - 256 if data[component_offset] >= 128 else data[component_offset],
                "offsetY": data[component_offset + 1] - 256 if data[component_offset + 1] >= 128 else data[component_offset + 1],
                "mirrored": data[component_offset + 2] != 0,
                "imageIndex": -1 if image_index == 255 else image_index,
            })
        cursor = frame_end
        frames.append(components)
    if cursor != len(data):
        raise AssetFormatError(f"enemy attack effect has {len(data) - cursor} trailing bytes")
    return {
        "format": "heroes-lore-enemy-attack-effect-v1",
        "spriteId": sprite_id,
        "sourceResource": f"enm/atef/{sprite_id:02d}",
        "frameCount": frame_count,
        "frames": frames,
    }


def decode_boss_attack_effect(data: bytes, boss_id: int, enemy_id: int) -> dict[str, object]:
    """Decode the frame/component stream used by `/boss/atef/ENEMY_ID`."""
    boss_enemies = {
        1: {32},
        2: {35, 36, 37, 38},
        3: {39, 40, 41},
        4: {42},
    }
    if boss_id not in boss_enemies or enemy_id not in boss_enemies[boss_id]:
        raise AssetFormatError(f"boss attack effect {boss_id}/{enemy_id} has an unknown source owner")
    decoded = decode_enemy_attack_effect(data, enemy_id)
    return {
        **decoded,
        "format": "heroes-lore-boss-attack-effect-v1",
        "bossId": boss_id,
        "enemyId": enemy_id,
        "sourceResource": f"boss/atef/{enemy_id}",
    }


def decode_player_skill_effect(
    data: bytes,
    skill_id: int,
    level_slot: int,
    source_resource: str,
) -> dict[str, object]:
    """Decode one `/grd/spr` stream used by `x` while drawing player skills.

    The stream has the same frame/component shape as enemy effects, but each
    component's third byte selects whether the source renderer uses atlas 12
    or suppresses that component. Its fourth byte is the image index in the
    skill's element atlas (`fi`, `wa`, or `gr`).
    """
    if not 0 <= skill_id <= 5:
        raise AssetFormatError("player skill ID must be from 0 through 5")
    if level_slot not in (0, 1, 2):
        raise AssetFormatError("player skill level slot must be from 0 through 2")
    if skill_id == 0:
        expected_resource = "grd/spr/0_01.eif" if level_slot == 0 else "grd/spr/0_1.eif"
    elif skill_id == 1:
        expected_resource = f"grd/spr/1_{level_slot}.eif" if level_slot <= 1 else None
    else:
        expected_resource = f"grd/spr/{skill_id}_{level_slot}.eif"
    if not source_resource.startswith("grd/spr/") or not source_resource.endswith(".eif"):
        raise AssetFormatError("player skill effect resource must be a grd/spr EIF")
    special_type_two_resource = (
        skill_id == 0 and level_slot == 0 and source_resource == "grd/spr/0_02.eif"
    )
    if source_resource != expected_resource and not special_type_two_resource:
        raise AssetFormatError("player skill effect resource does not match its skill level")
    if not data:
        raise AssetFormatError("player skill effect resource is empty")
    frame_count = data[0]
    if frame_count < 1:
        raise AssetFormatError("player skill effect has no animation frames")

    cursor = 1
    frames: list[list[dict[str, object]]] = []
    for frame_index in range(frame_count):
        if cursor >= len(data):
            raise AssetFormatError(f"player skill effect frame {frame_index} has no component count")
        component_count = data[cursor]
        cursor += 1
        frame_end = cursor + component_count * 4
        if frame_end > len(data):
            raise AssetFormatError(f"player skill effect frame {frame_index} has truncated components")
        components: list[dict[str, object]] = []
        for component_offset in range(cursor, frame_end, 4):
            raw_x, raw_y, source_atlas_flag, image_index = data[component_offset : component_offset + 4]
            components.append({
                "offsetX": raw_x - 256 if raw_x >= 128 else raw_x,
                "offsetY": raw_y - 256 if raw_y >= 128 else raw_y,
                "sourceAtlasFlag": source_atlas_flag,
                "imageIndex": image_index,
            })
        cursor = frame_end
        frames.append(components)
    if cursor != len(data):
        raise AssetFormatError(f"player skill effect has {len(data) - cursor} trailing bytes")
    return {
        "format": "heroes-lore-player-skill-effect-v1",
        "skillId": skill_id,
        "levelSlot": level_slot,
        "sourceResource": source_resource,
        "frameCount": frame_count,
        "frames": frames,
    }


def decode_player_skill_special_effect(data: bytes, effect_type: int, source_resource: str) -> dict[str, object]:
    """Decode an effect stream used by a special `x` renderer branch."""
    if effect_type != 2:
        raise AssetFormatError("unknown special player skill effect type")
    if source_resource != "grd/spr/0_02.eif":
        raise AssetFormatError("effect type 2 must use the pinned 0_02 resource")
    decoded = decode_player_skill_effect(data, 0, 0, source_resource)
    return {
        **decoded,
        "format": "heroes-lore-player-skill-special-effect-v1",
        "effectType": effect_type,
    }


def decode_player_level_up_effect(data: bytes) -> dict[str, object]:
    """Decode `/char/lvup.eif`, whose components reference `/char/lvup`.

    `cd.a(true, ..., 13, -1, atlas)` reads one frame count followed by a
    component count and four-byte entries per frame. It rewrites the third
    byte to atlas 13 or -1 according to the source flag. Offsets are signed
    bytes and image indices are unsigned.
    """
    if not data:
        raise AssetFormatError("player level-up effect resource is empty")
    frame_count = data[0]
    if frame_count < 1:
        raise AssetFormatError("player level-up effect has no animation frames")

    cursor = 1
    frames: list[list[dict[str, object]]] = []
    for frame_index in range(frame_count):
        if cursor >= len(data):
            raise AssetFormatError(f"player level-up effect frame {frame_index} has no component count")
        component_count = data[cursor]
        cursor += 1
        frame_end = cursor + component_count * 4
        if frame_end > len(data):
            raise AssetFormatError(f"player level-up effect frame {frame_index} has truncated components")
        components: list[dict[str, object]] = []
        for component_offset in range(cursor, frame_end, 4):
            raw_x, raw_y, source_atlas_flag, image_index = data[component_offset : component_offset + 4]
            components.append({
                "offsetX": raw_x - 256 if raw_x >= 128 else raw_x,
                "offsetY": raw_y - 256 if raw_y >= 128 else raw_y,
                "sourceAtlasFlag": source_atlas_flag != 0,
                "sourceAtlasId": -1 if source_atlas_flag != 0 else 13,
                "imageIndex": image_index,
            })
        cursor = frame_end
        frames.append(components)
    if cursor != len(data):
        raise AssetFormatError(f"player level-up effect has {len(data) - cursor} trailing bytes")
    return {
        "format": "heroes-lore-player-level-up-effect-v1",
        "effectType": 4,
        "sourceResource": "char/lvup.eif",
        "sourceAtlas": "char/lvup",
        "sourceAtlasId": 13,
        "frameCount": frame_count,
        "frames": frames,
    }


def refresh_player_level_up_effect(resource_path: Path, output_dir: Path) -> dict[str, object]:
    """Regenerate the level-up catalog from an already-decompiled local resource.

    This partial refresh avoids reopening the source JAR when only this generated
    catalog is missing. The existing asset manifest must still identify the
    pinned build, and every referenced local atlas page must be present.
    """
    manifest_path = output_dir / "asset-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AssetFormatError(f"cannot read generated asset manifest: {exc}") from exc
    if not isinstance(manifest, dict) or manifest.get("sourceJarSha256") != EXPECTED_JAR_SHA256:
        raise AssetFormatError("generated asset manifest does not identify the pinned v2.1.2 build")
    if not isinstance(manifest.get("files"), list):
        raise AssetFormatError("generated asset manifest has no file list")

    effect = decode_player_level_up_effect(resource_path.read_bytes())
    required_images = {
        component["imageIndex"]
        for frame in effect["frames"]
        for component in frame
        if component["sourceAtlasId"] == 13
    }
    for image_index in sorted(required_images):
        image_path = output_dir / "atlases" / "char" / "lvup" / f"{image_index:03d}.png"
        if not image_path.is_file():
            raise AssetFormatError(f"missing level-up atlas image: {image_path}")

    encoded = (json.dumps({
        "format": "heroes-lore-player-level-up-effect-catalog-v1",
        "effectCount": 1,
        "effects": [effect],
    }, separators=(",", ":")) + "\n").encode()
    catalog_path = output_dir / "player-level-up-effects" / "catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_bytes(encoded)
    catalog_entry = {
        "path": catalog_path.relative_to(output_dir).as_posix(),
        "sha256": sha256(encoded),
        "bytes": len(encoded),
    }
    files = [
        entry for entry in manifest["files"]
        if not isinstance(entry, dict) or entry.get("path") != catalog_entry["path"]
    ]
    files.append(catalog_entry)
    manifest["files"] = files
    manifest["playerLevelUpEffectCount"] = 1
    manifest["generatedFileCount"] = len(files)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return {
        "frameCount": effect["frameCount"],
        "componentCount": sum(map(len, effect["frames"])),
        "catalogPath": catalog_path,
    }


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _u16(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 2 > len(data):
        raise AssetFormatError(f"u16 outside resource at offset {offset}")
    return struct.unpack_from(">H", data, offset)[0]


def _u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise AssetFormatError(f"u32 outside resource at offset {offset}")
    return struct.unpack_from(">I", data, offset)[0]


def iter_png_chunks(data: bytes, start: int = 0, end: int | None = None) -> Iterable[tuple[str, int, int]]:
    """Yield (type, offset, total-size) for complete PNG chunks in a byte span."""
    limit = len(data) if end is None else end
    offset = start
    while offset + 12 <= limit:
        length = _u32(data, offset)
        total = length + 12
        if offset + total > limit:
            raise AssetFormatError(f"truncated PNG chunk at offset {offset}")
        try:
            name = data[offset + 4 : offset + 8].decode("ascii")
        except UnicodeDecodeError as exc:
            raise AssetFormatError(f"invalid PNG chunk name at offset {offset}") from exc
        yield name, offset, total
        offset += total


def _find_chunk(data: bytes, name: str, start: int, span: int) -> tuple[int, int] | None:
    end = start + span
    for chunk_name, offset, total in iter_png_chunks(data, start, end):
        if chunk_name == name:
            return offset, total
    return None


def _copy_chunk(data: bytes, result: bytearray, found: tuple[int, int] | None, *, required: bool = False) -> None:
    if found is None:
        if required:
            raise AssetFormatError("required PNG chunk is missing")
        return
    offset, size = found
    result.extend(data[offset : offset + size])


def _validate_png(data: bytes, index: int) -> None:
    if not data.startswith(PNG_SIGNATURE) or data[-len(PNG_IEND) :] != PNG_IEND:
        raise AssetFormatError(f"decoded image {index} has invalid PNG boundaries")
    chunks = list(iter_png_chunks(data, len(PNG_SIGNATURE)))
    names = [name for name, _, _ in chunks]
    if not names or names[0] != "IHDR" or names[-1] != "IEND" or "IDAT" not in names:
        raise AssetFormatError(f"decoded image {index} is missing required PNG chunks")
    if chunks[-1][2] != len(PNG_IEND):
        raise AssetFormatError(f"decoded image {index} has bytes after IEND")
    for name, offset, size in chunks:
        length = _u32(data, offset)
        chunk_data = data[offset + 4 : offset + 8 + length]
        expected_crc = _u32(data, offset + 8 + length)
        if zlib.crc32(chunk_data) & 0xFFFFFFFF != expected_crc:
            raise AssetFormatError(f"decoded image {index} has invalid {name} CRC")
    width = _u32(data, chunks[0][1] + 8)
    height = _u32(data, chunks[0][1] + 12)
    if width == 0 or height == 0:
        raise AssetFormatError(f"decoded image {index} has empty dimensions")


def replace_png_palette_colors(data: bytes, replacements: dict[int, int]) -> bytes:
    """Replace exact RGB entries in an indexed PNG's PLTE chunk."""
    _validate_png(data, 0)
    for old, new in replacements.items():
        if (type(old) is not int or type(new) is not int or
                not (0 <= old <= 0xFFFFFF) or not (0 <= new <= 0xFFFFFF)):
            raise AssetFormatError("palette replacement colors must be 24-bit RGB integers")

    palette_chunk = next(
        ((offset, total) for name, offset, total in iter_png_chunks(data, len(PNG_SIGNATURE)) if name == "PLTE"),
        None,
    )
    if palette_chunk is None:
        raise AssetFormatError("indexed PNG is missing its PLTE palette")
    offset, total = palette_chunk
    palette_length = _u32(data, offset)
    palette = data[offset + 8 : offset + 8 + palette_length]
    if palette_length == 0 or palette_length % 3 != 0:
        raise AssetFormatError("PNG PLTE length must contain complete RGB entries")

    changed_palette = bytearray(palette)
    for palette_offset in range(0, len(palette), 3):
        color = int.from_bytes(palette[palette_offset : palette_offset + 3], "big")
        replacement = replacements.get(color)
        if replacement is not None:
            changed_palette[palette_offset : palette_offset + 3] = replacement.to_bytes(3, "big")

    chunk_body = b"PLTE" + bytes(changed_palette)
    rewritten_chunk = (
        struct.pack(">I", len(changed_palette))
        + chunk_body
        + struct.pack(">I", zlib.crc32(chunk_body) & 0xFFFFFFFF)
    )
    result = data[:offset] + rewritten_chunk + data[offset + total :]
    _validate_png(result, 0)
    return result


def decode_atlas(mph: bytes, mpd_files: dict[int, bytes]) -> list[bytes]:
    """Reassemble one proprietary MPH/MPD atlas as ordinary PNG images.

    The table and chunk handling follow the original game's `bq` image loader:
    MPH contains an image count, MPD index/offset/PNG-chunk mask per image, and
    shared PNG palette chunks. MPD files contain image-specific PNG chunks.
    """
    if len(mph) < 8:
        raise AssetFormatError("MPH header is shorter than 8 bytes")
    raw_flags = _u32(mph, 0)
    image_count = _u32(mph, 4)
    table_end = 8 + image_count * 8
    if image_count == 0 or table_end > len(mph):
        raise AssetFormatError("invalid MPH image table")

    records: list[tuple[int, int, int]] = []
    for index in range(image_count):
        offset = 8 + index * 8
        records.append((_u16(mph, offset), _u32(mph, offset + 2), _u16(mph, offset + 6)))

    shared: dict[str, tuple[int, int]] = {}
    for name, offset, size in iter_png_chunks(mph, table_end):
        shared.setdefault(name, (offset, size))

    transparent_atlas = ((raw_flags >> 27) & 1) == 1
    decoded: list[bytes] = []
    for index, (mpd_index, start, chunk_mask) in enumerate(records):
        try:
            mpd = mpd_files[mpd_index]
        except KeyError as exc:
            raise AssetFormatError(f"MPH image {index} references missing MPD file {mpd_index}") from exc
        next_start = len(mpd)
        for next_index in range(index + 1, image_count):
            next_mpd_index, next_offset, _ = records[next_index]
            if next_mpd_index == mpd_index:
                next_start = next_offset
                break
        if start > next_start or next_start > len(mpd):
            raise AssetFormatError(f"invalid MPD span for image {index}")
        span = next_start - start

        if not transparent_atlas:
            image = PNG_SIGNATURE + mpd[start:next_start] + PNG_IEND
            _validate_png(image, index)
            decoded.append(image)
            continue

        result = bytearray(PNG_SIGNATURE)
        _copy_chunk(mpd, result, _find_chunk(mpd, "IHDR", start, span), required=True)
        for chunk_index in (1, 2, 3, 4, 5, 9, 10):
            if chunk_mask & (1 << (chunk_index - 1)):
                name = PNG_CHUNKS[chunk_index]
                _copy_chunk(mpd, result, _find_chunk(mpd, name, start, span))
        _copy_chunk(mph, result, shared.get("PLTE"), required=True)
        _copy_chunk(mph, result, shared.get("tRNS"))
        for chunk_index in (14, 15):
            if chunk_mask & (1 << (chunk_index - 1)):
                name = PNG_CHUNKS[chunk_index]
                _copy_chunk(mpd, result, _find_chunk(mpd, name, start, span))
        _copy_chunk(mpd, result, _find_chunk(mpd, "IDAT", start, span), required=True)
        result.extend(PNG_IEND)
        image = bytes(result)
        _validate_png(image, index)
        decoded.append(image)
    return decoded


def decode_map(data: bytes) -> dict[str, object]:
    """Decode the verified base map header and tile-index grid."""
    if len(data) < 3:
        raise AssetFormatError("map resource is shorter than its 3-byte header")
    tileset_id, width, height = data[:3]
    expected = width * height
    tile_ids = data[3:]
    if width == 0 or height == 0 or len(tile_ids) != expected:
        raise AssetFormatError(
            f"map grid length mismatch: {width}x{height} requires {expected}, got {len(tile_ids)}"
        )
    rows = [list(tile_ids[y * width : (y + 1) * width]) for y in range(height)]
    return {
        "format": "heroes-lore-map-v1",
        "tilesetId": tileset_id,
        "width": width,
        "height": height,
        "tileSize": 16,
        "tileIds": rows,
    }


def decode_base_collision(data: bytes, width: int, height: int) -> dict[str, object]:
    """Decode the first map-sized signed-byte collision layer in an EVT file."""
    cell_count = width * height
    if width <= 0 or height <= 0 or len(data) < cell_count:
        raise AssetFormatError(
            f"event resource has no complete {width}x{height} base collision layer"
        )
    layer = [value if value < 128 else value - 256 for value in data[:cell_count]]
    return {
        "format": "heroes-lore-base-collision-v1",
        "width": width,
        "height": height,
        "tileSize": 16,
        "values": [layer[y * width : (y + 1) * width] for y in range(height)],
        "passabilityRule": "base value >= 0; runtime entities and later EVT operations are not applied",
    }


def decode_event_visuals(data: bytes, width: int, height: int, tileset_id: int) -> dict[str, object]:
    """Decode the first event section that places map decoration sprites."""
    offset = width * height
    if width <= 0 or height <= 0 or offset >= len(data):
        raise AssetFormatError("event resource has no decoration section after its collision grid")

    image_count = data[offset]
    image_ids_end = offset + 1 + image_count
    if image_ids_end >= len(data):
        raise AssetFormatError("event decoration image list is truncated")
    loaded_image_ids = list(data[offset + 1 : image_ids_end])
    object_count = data[image_ids_end]
    records_start = image_ids_end + 1
    records_end = records_start + object_count * 5
    if records_end > len(data):
        raise AssetFormatError("event decoration records are truncated")

    objects: list[dict[str, int]] = []
    for index in range(object_count):
        position = records_start + index * 5
        objects.append(
            {
                "tileX": data[position],
                "tileY": data[position + 1],
                "offsetX": data[position + 2] if data[position + 2] < 128 else data[position + 2] - 256,
                "offsetY": data[position + 3] if data[position + 3] < 128 else data[position + 3] - 256,
                "atlasIndex": data[position + 4],
                "sourceOrder": index,
            }
        )

    return {
        "format": "heroes-lore-map-decorations-v1",
        "tilesetId": tileset_id,
        "objectAtlas": f"m/t/o{tileset_id:02d}",
        "loadedImageIds": loaded_image_ids,
        "imageAnchor": "center-bottom",
        "sortKey": "tileY * 16 + offsetY, ascending; stable source order for ties",
        "objects": objects,
    }


def _read_u8(data: bytes, offset: int, label: str) -> int:
    if offset < 0 or offset >= len(data):
        raise AssetFormatError(f"truncated event resource while reading {label} at offset {offset}")
    return data[offset]


def _skip_event_records(data: bytes, offset: int, record_size: int, label: str) -> int:
    count = _read_u8(data, offset, f"{label} count")
    end = offset + 1 + count * record_size
    if end > len(data):
        raise AssetFormatError(f"truncated {label} records at offset {offset}")
    return end


def decode_event_operations(data: bytes, width: int, height: int) -> dict[str, object]:
    """Preserve the operation table after the event resource's earlier sections.

    Section boundaries and the four-byte operation record shape follow the
    original ad loader. Operation effects remain raw because they depend on
    game state and several opcodes have not been behaviorally verified.
    """
    if width <= 0 or height <= 0:
        raise AssetFormatError("event operation map dimensions must be positive")
    offset = width * height
    if offset > len(data):
        raise AssetFormatError("event resource has no complete collision grid")

    # Static decoration image references and five-byte placement records.
    image_count = _read_u8(data, offset, "decoration image count")
    offset += 1 + image_count
    decoration_count = _read_u8(data, offset, "decoration count")
    offset += 1 + decoration_count * 5
    if offset > len(data):
        raise AssetFormatError("truncated decoration section")

    # NPC image references and three-byte placements, then enemy references
    # and placements, followed by face portrait references.
    npc_image_count = _read_u8(data, offset, "NPC image reference count")
    offset += 1
    if offset + npc_image_count > len(data):
        raise AssetFormatError("truncated NPC image reference list")
    npc_image_ids = list(data[offset : offset + npc_image_count])
    offset += npc_image_count
    npc_placement_count = _read_u8(data, offset, "NPC placement count")
    offset += 1
    if offset + npc_placement_count * 3 > len(data):
        raise AssetFormatError("truncated NPC placement records")
    npc_placements = [
        {
            "tileX": data[offset + index * 3],
            "tileY": data[offset + index * 3 + 1],
            "imageId": data[offset + index * 3 + 2],
            "sourceOrder": index,
        }
        for index in range(npc_placement_count)
    ]
    offset += npc_placement_count * 3
    enemy_count = _read_u8(data, offset, "enemy definition reference count")
    offset += 1
    if offset + enemy_count > len(data):
        raise AssetFormatError("truncated enemy definition reference list")
    enemy_ids = list(data[offset : offset + enemy_count])
    offset += enemy_count
    enemy_placement_count = _read_u8(data, offset, "enemy placement count")
    offset += 1
    if offset + enemy_placement_count * 3 > len(data):
        raise AssetFormatError("truncated enemy placement records")
    enemy_placements = [
        {
            "tileX": data[offset + index * 3],
            "tileY": data[offset + index * 3 + 1],
            "enemyId": data[offset + index * 3 + 2],
            "sourceOrder": index,
        }
        for index in range(enemy_placement_count)
    ]
    offset += enemy_placement_count * 3
    offset = _skip_event_records(data, offset, 1, "face image reference")

    # The runtime stores trigger definitions (7-byte rows), script commands
    # (3-byte rows), then string IDs in these three tables.
    auxiliary_tables: list[list[list[int]]] = []
    for row_size, label in ((7, "auxiliary seven-byte"), (3, "auxiliary three-byte")):
        table_count = _read_u8(data, offset, f"{label} table count")
        offset += 1
        tables: list[list[list[int]]] = []
        for _ in range(table_count):
            row_count = _read_u8(data, offset, f"{label} row count")
            offset += 1
            end = offset + row_count * row_size
            if end > len(data):
                raise AssetFormatError(f"truncated {label} table")
            tables.append([
                list(data[row_offset : row_offset + row_size])
                for row_offset in range(offset, end, row_size)
            ])
            offset = end
        auxiliary_tables.append(tables)

    string_count = _read_u8(data, offset, "auxiliary string count")
    offset += 1
    auxiliary_strings: list[str] = []
    for _ in range(string_count):
        string_size = _read_u8(data, offset, "auxiliary string length")
        offset += 1
        end = offset + string_size
        if end > len(data):
            raise AssetFormatError("truncated auxiliary string table")
        auxiliary_strings.append(data[offset:end].decode("ascii", errors="replace"))
        offset = end

    descriptor_table_offset = offset
    descriptor_count = _read_u8(data, offset, "event descriptor count")
    offset += 1
    descriptors: list[dict[str, int]] = []
    for index in range(descriptor_count):
        if offset + 3 > len(data):
            raise AssetFormatError("truncated event descriptor")
        cell_index = ((data[offset] & 0x03) << 8) | data[offset + 1]
        descriptors.append(
            {
                "sourceOrder": index,
                "cellIndex": cell_index,
                "rawMarkerByte": data[offset + 2],
                "sourceOffset": offset,
            }
        )
        offset += 3

    action_block_count = _read_u8(data, offset, "action block count")
    offset += 1
    action_blocks: list[dict[str, object]] = []
    for block_index in range(action_block_count):
        action_count = _read_u8(data, offset, "action count")
        offset += 1
        actions: list[dict[str, object]] = []
        for action_index in range(action_count):
            if offset + 4 > len(data):
                raise AssetFormatError("truncated four-byte event operation")
            raw_opcode = data[offset]
            actions.append(
                {
                    "sourceOrder": action_index,
                    "opcode": raw_opcode if raw_opcode < 128 else raw_opcode - 256,
                    "rawOpcode": raw_opcode,
                    "arguments": list(data[offset + 1 : offset + 4]),
                    "sourceOffset": offset,
                }
            )
            offset += 4
        action_blocks.append({"sourceOrder": block_index, "actions": actions})

    if offset != len(data):
        raise AssetFormatError(f"event parser left {len(data) - offset} trailing bytes")
    return {
        "format": "heroes-lore-event-operations-raw-v1",
        "descriptorTableOffset": descriptor_table_offset,
        "npcImageIds": npc_image_ids,
        "npcPlacements": npc_placements,
        "enemyIds": enemy_ids,
        "enemyPlacements": enemy_placements,
        "triggerGroups": auxiliary_tables[0],
        "scripts": auxiliary_tables[1],
        "stringIds": auxiliary_strings,
        "descriptors": descriptors,
        "actionBlocks": action_blocks,
        "descriptorActionBlockCountMatch": len(descriptors) == len(action_blocks),
        "opcodeEffectsVerified": False,
    }


def decode_character_sprite_layout(data: bytes, *, nested_frames: bool = False) -> dict[str, object]:
    """Decode one `/cN/s/<part>` frame-layout resource without assigning game roles.

    Standard records contain a component slot, animation slot, direction, frame
    count, followed by four-byte image-part records. The `e` resource uses a
    nested part count for each frame. Image indices and flip flags are preserved
    as data; atlas selection depends on the corresponding image resource.
    """
    offset = 0
    records: list[dict[str, object]] = []
    while offset < len(data):
        if offset + 4 > len(data):
            raise AssetFormatError(f"truncated character sprite header at offset {offset}")
        source_offset = offset
        component_slot, animation_slot, direction, frame_count = data[offset : offset + 4]
        offset += 4
        frames: list[list[dict[str, object]]] = []
        for frame_index in range(frame_count):
            if nested_frames:
                if offset >= len(data):
                    raise AssetFormatError(f"truncated nested frame {frame_index} at offset {offset}")
                part_count = data[offset]
                offset += 1
            else:
                part_count = 1
            parts: list[dict[str, object]] = []
            for _ in range(part_count):
                if offset + 4 > len(data):
                    raise AssetFormatError(f"truncated sprite part at offset {offset}")
                raw_x, raw_y, mirrored, image_index = data[offset : offset + 4]
                offset += 4
                signed_x = raw_x if raw_x < 128 else raw_x - 256
                signed_y = raw_y if raw_y < 128 else raw_y - 256
                parts.append({
                    "x": signed_x,
                    "y": signed_y,
                    "mirrored": mirrored != 0,
                    "imageIndex": image_index,
                })
            frames.append(parts)
        records.append({
            "sourceOrder": len(records),
            "sourceOffset": source_offset,
            "componentSlot": component_slot,
            "animationSlot": animation_slot,
            "direction": direction,
            "frames": frames,
        })
    return {
        "format": "heroes-lore-character-sprite-layout-v1",
        "nestedFrames": nested_frames,
        "records": records,
    }


def decode_bitmap_font(data: bytes) -> tuple[bytes, dict[str, object]]:
    """Extract the pinned game's MF font atlas and its ASCII glyph positions."""
    if len(data) < 8:
        raise AssetFormatError("bitmap font header is truncated")
    encoded_height = data[4]
    accented = encoded_height > 100
    height = encoded_height - 100 if accented else encoded_height
    if height <= 0:
        raise AssetFormatError("bitmap font has an invalid glyph height")
    table_count = 95 + (9 if accented else 0)
    offsets_start = 8
    offsets_end = offsets_start + table_count * 2
    if offsets_end + 8 > len(data):
        raise AssetFormatError("bitmap font glyph table is truncated")
    offsets = [_u16(data, offsets_start + index * 2) for index in range(table_count)]

    png_size = _u16(data, offsets_end)
    png_start = offsets_end + 8
    png_end = png_start + png_size
    if png_end != len(data):
        raise AssetFormatError("bitmap font PNG length does not match its resource")
    png = data[png_start:png_end]
    _validate_png(png, 0)
    image_width = _u32(png, 16)
    if offsets[0] != 0 or offsets[94] > image_width:
        raise AssetFormatError("bitmap font glyph positions exceed the atlas")
    return png, {
        "format": "heroes-lore-bitmap-font-v1",
        "height": height,
        "spaceAdvance": data[6],
        "letterSpacing": data[7],
        "glyphOffsets": offsets[:95],
        "atlasWidth": image_width,
    }


def validate_midi_resource(data: bytes, resource_name: str) -> None:
    """Check the Standard MIDI chunk structure before preserving source music."""
    if len(data) < 14 or data[:4] != b"MThd":
        raise AssetFormatError(f"{resource_name} is not a Standard MIDI file")
    header_length = _u32(data, 4)
    if header_length != 6 or len(data) < 8 + header_length:
        raise AssetFormatError(f"{resource_name} has an invalid MIDI header length")
    track_count = _u16(data, 10)
    if track_count == 0 or _u16(data, 12) == 0:
        raise AssetFormatError(f"{resource_name} has no tracks or an invalid time division")

    offset = 8 + header_length
    for track_index in range(track_count):
        if offset + 8 > len(data) or data[offset:offset + 4] != b"MTrk":
            raise AssetFormatError(f"{resource_name} is missing MIDI track {track_index}")
        track_length = _u32(data, offset + 4)
        offset += 8 + track_length
        if offset > len(data):
            raise AssetFormatError(f"{resource_name} has a truncated MIDI track {track_index}")
    if offset != len(data):
        raise AssetFormatError(f"{resource_name} has trailing bytes after its MIDI tracks")


def _safe_output_path(base: Path, member_name: str) -> Path:
    path = PurePosixPath(member_name)
    if path.is_absolute() or ".." in path.parts:
        raise AssetFormatError(f"unsafe archive path: {member_name}")
    return base.joinpath(*path.parts)


def _hero_palette_variants_for_atlas(stem: str) -> dict[int, dict[int, int]]:
    """Return source element recolors for weapon/effect atlases in each hero class."""
    path = PurePosixPath(stem)
    if len(path.parts) != 3 or path.parts[0] not in {"c1", "c2", "c3"} or path.parts[1] != "i":
        return {}
    atlas_name = path.name
    if atlas_name == "e":
        return HERO_EFFECT_ELEMENT_PALETTES
    if atlas_name.startswith("w") and atlas_name[1:].isdigit() and 1 <= int(atlas_name[1:]) <= 5:
        return HERO_WEAPON_ELEMENT_PALETTES
    return {}


def extract(jar_path: Path, output_dir: Path) -> dict[str, object]:
    jar_bytes = jar_path.read_bytes()
    jar_hash = sha256(jar_bytes)
    if jar_hash != EXPECTED_JAR_SHA256:
        raise AssetFormatError(f"baseline JAR SHA-256 mismatch: {jar_hash}")

    with zipfile.ZipFile(jar_path) as jar:
        members = set(jar.namelist())
        image_manifests = sorted(name for name in members if name.endswith(".mph"))
        character_layout_names = sorted(
            name for name in members
            if len(PurePosixPath(name).parts) == 3
            and PurePosixPath(name).parts[0] in {"c1", "c2", "c3"}
            and PurePosixPath(name).parts[1] == "s"
        )
        generated: list[dict[str, object]] = []
        hero_element_palette_variant_count = 0

        for manifest_name in image_manifests:
            stem = manifest_name[:-4]
            mph = jar.read(manifest_name)
            if len(mph) < 8:
                raise AssetFormatError(f"truncated image manifest: {manifest_name}")
            count = _u32(mph, 4)
            indices = sorted({_u16(mph, 8 + image_index * 8) for image_index in range(count)})
            mpd_files: dict[int, bytes] = {}
            for index in indices:
                member = f"{stem}_{index}.mpd"
                if member not in members:
                    raise AssetFormatError(f"missing atlas member: {member}")
                mpd_files[index] = jar.read(member)

            images = decode_atlas(mph, mpd_files)
            atlas_dir = output_dir / "atlases" / stem
            atlas_name = PurePosixPath(stem).name
            palette_variants = _hero_palette_variants_for_atlas(stem)
            for image_index, image in enumerate(images):
                output_path = atlas_dir / f"{image_index:03d}.png"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(image)
                generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(image), "bytes": len(image)})
                for element, replacements in palette_variants.items():
                    variant = replace_png_palette_colors(image, replacements)
                    variant_dir = atlas_dir.parent / f"{atlas_name}-element-{element}"
                    variant_path = variant_dir / f"{image_index:03d}.png"
                    variant_dir.mkdir(parents=True, exist_ok=True)
                    variant_path.write_bytes(variant)
                    generated.append({
                        "path": variant_path.relative_to(output_dir).as_posix(),
                        "sha256": sha256(variant),
                        "bytes": len(variant),
                    })
                    hero_element_palette_variant_count += 1

        for member in character_layout_names:
            path = PurePosixPath(member)
            class_id = path.parts[0][1:]
            part_name = path.name
            parsed = decode_character_sprite_layout(jar.read(member), nested_frames=part_name == "e")
            output_path = _safe_output_path(
                output_dir / "character-layouts",
                f"{class_id}/{part_name}.json",
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            encoded = (json.dumps(parsed, separators=(",", ":")) + "\n").encode()
            output_path.write_bytes(encoded)
            generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(encoded), "bytes": len(encoded)})

        font_png, font_layout = decode_bitmap_font(jar.read("fonts/small.mf"))
        font_dir = output_dir / "fonts"
        font_dir.mkdir(parents=True, exist_ok=True)
        font_png_path = font_dir / "small.png"
        font_png_path.write_bytes(font_png)
        generated.append({"path": font_png_path.relative_to(output_dir).as_posix(), "sha256": sha256(font_png), "bytes": len(font_png)})
        font_layout_bytes = (json.dumps(font_layout, separators=(",", ":")) + "\n").encode()
        font_layout_path = font_dir / "small.json"
        font_layout_path.write_bytes(font_layout_bytes)
        generated.append({"path": font_layout_path.relative_to(output_dir).as_posix(), "sha256": sha256(font_layout_bytes), "bytes": len(font_layout_bytes)})

        language_member = "lang/language.en-GB"
        if language_member not in members:
            raise AssetFormatError(f"missing pinned language resource: {language_member}")
        language = decode_language_resource(jar.read(language_member), "en-GB")
        language_bytes = (json.dumps(language, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        language_path = output_dir / "language" / "en-GB.json"
        language_path.parent.mkdir(parents=True, exist_ok=True)
        language_path.write_bytes(language_bytes)
        generated.append({"path": language_path.relative_to(output_dir).as_posix(), "sha256": sha256(language_bytes), "bytes": len(language_bytes)})

        music_member = "snd/25.mid"
        if music_member not in members:
            raise AssetFormatError(f"missing pinned music resource: {music_member}")
        music_bytes = jar.read(music_member)
        validate_midi_resource(music_bytes, music_member)
        music_path = output_dir / "audio" / "25.mid"
        music_path.parent.mkdir(parents=True, exist_ok=True)
        music_path.write_bytes(music_bytes)
        generated.append({
            "path": music_path.relative_to(output_dir).as_posix(),
            "sourceResource": music_member,
            "sha256": sha256(music_bytes),
            "bytes": len(music_bytes),
        })

        enemy_data_names = sorted(
            name for name in members
            if name in {"enm/data0", "enm/data1", "enm/data2"}
        )
        enemy_definition_count = 0
        for member in enemy_data_names:
            variant = int(member[-1])
            parsed = decode_enemy_data(jar.read(member), variant)
            enemy_definition_count = int(parsed["recordCount"])
            output_path = output_dir / "enemy-data" / f"data{variant}.json"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            encoded = (json.dumps(parsed, separators=(",", ":")) + "\n").encode()
            output_path.write_bytes(encoded)
            generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(encoded), "bytes": len(encoded)})

        equipment_categories = [
            decode_equipment_data(jar.read(f"itm/{category:02}"), category)
            for category in range(7)
        ]
        equipment_catalog = {
            "format": "heroes-lore-equipment-catalog-v1",
            "categoryCount": len(equipment_categories),
            "categories": equipment_categories,
        }
        equipment_bytes = (json.dumps(equipment_catalog, separators=(",", ":")) + "\n").encode()
        equipment_path = output_dir / "equipment-data" / "catalog.json"
        equipment_path.parent.mkdir(parents=True, exist_ok=True)
        equipment_path.write_bytes(equipment_bytes)
        generated.append({
            "path": equipment_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(equipment_bytes),
            "bytes": len(equipment_bytes),
        })

        commerce_catalog = decode_item_commerce_catalog(
            [jar.read(f"itm/{category:02}") for category in range(24)],
            jar.read("itm/forshop"),
            jar.read("itm/mixtbl"),
        )
        commerce_bytes = (json.dumps(commerce_catalog, separators=(",", ":")) + "\n").encode()
        commerce_path = output_dir / "commerce-data" / "catalog.json"
        commerce_path.parent.mkdir(parents=True, exist_ok=True)
        commerce_path.write_bytes(commerce_bytes)
        generated.append({
            "path": commerce_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(commerce_bytes),
            "bytes": len(commerce_bytes),
        })

        enemy_sprite_resources = sorted(
            (name for name in members if name.startswith("enm/spr/") and name.rsplit("/", 1)[-1].isdigit()),
            key=lambda name: int(name.rsplit("/", 1)[-1]),
        )
        enemy_sprites = [
            decode_enemy_sprite_animations(jar.read(member), int(member.rsplit("/", 1)[-1]))
            for member in enemy_sprite_resources
        ]
        enemy_animation_catalog = {
            "format": "heroes-lore-enemy-animation-catalog-v1",
            "spriteCount": len(enemy_sprites),
            "sprites": enemy_sprites,
        }
        enemy_animation_bytes = (json.dumps(enemy_animation_catalog, separators=(",", ":")) + "\n").encode()
        enemy_animation_path = output_dir / "enemy-animations" / "catalog.json"
        enemy_animation_path.parent.mkdir(parents=True, exist_ok=True)
        enemy_animation_path.write_bytes(enemy_animation_bytes)
        generated.append({
            "path": enemy_animation_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(enemy_animation_bytes),
            "bytes": len(enemy_animation_bytes),
        })

        boss_sprite_resources = sorted(
            (name for name in members if name.startswith("boss/spr/") and "_" in name.rsplit("/", 1)[-1]),
            key=lambda name: tuple(int(value) for value in name.rsplit("/", 1)[-1].split("_")),
        )
        boss_sprites = []
        for member in boss_sprite_resources:
            boss_id, enemy_id = (int(value) for value in member.rsplit("/", 1)[-1].split("_"))
            boss_sprites.append(decode_boss_sprite_animations(jar.read(member), boss_id, enemy_id))
        boss_animation_catalog = {
            "format": "heroes-lore-boss-animation-catalog-v1",
            "spriteCount": len(boss_sprites),
            "sprites": boss_sprites,
        }
        boss_animation_bytes = (json.dumps(boss_animation_catalog, separators=(",", ":")) + "\n").encode()
        boss_animation_path = output_dir / "boss-animations" / "catalog.json"
        boss_animation_path.parent.mkdir(parents=True, exist_ok=True)
        boss_animation_path.write_bytes(boss_animation_bytes)
        generated.append({
            "path": boss_animation_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(boss_animation_bytes),
            "bytes": len(boss_animation_bytes),
        })

        boss_enemy_groups = {
            32: 1,
            35: 2,
            36: 2,
            37: 2,
            38: 2,
            39: 3,
            40: 3,
            41: 3,
            42: 4,
        }
        boss_attack_effect_resources = sorted(
            (name for name in members if name.startswith("boss/atef/") and name.rsplit("/", 1)[-1].isdigit()),
            key=lambda name: int(name.rsplit("/", 1)[-1]),
        )
        boss_attack_effects = [
            decode_boss_attack_effect(
                jar.read(member),
                boss_enemy_groups[int(member.rsplit("/", 1)[-1])],
                int(member.rsplit("/", 1)[-1]),
            )
            for member in boss_attack_effect_resources
        ]
        boss_attack_effect_catalog = {
            "format": "heroes-lore-boss-attack-effect-catalog-v1",
            "effectCount": len(boss_attack_effects),
            "effects": boss_attack_effects,
        }
        boss_attack_effect_bytes = (json.dumps(boss_attack_effect_catalog, separators=(",", ":")) + "\n").encode()
        boss_attack_effect_path = output_dir / "boss-attack-effects" / "catalog.json"
        boss_attack_effect_path.parent.mkdir(parents=True, exist_ok=True)
        boss_attack_effect_path.write_bytes(boss_attack_effect_bytes)
        generated.append({
            "path": boss_attack_effect_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(boss_attack_effect_bytes),
            "bytes": len(boss_attack_effect_bytes),
        })

        npc_sprite_resources = sorted(
            (name for name in members if name.startswith("npc/spr/") and name.rsplit("/", 1)[-1].isdigit()),
            key=lambda name: int(name.rsplit("/", 1)[-1]),
        )
        npc_sprites = [
            decode_npc_sprite_animations(jar.read(member), int(member.rsplit("/", 1)[-1]))
            for member in npc_sprite_resources
        ]
        npc_animation_catalog = {
            "format": "heroes-lore-npc-animation-catalog-v1",
            "spriteCount": len(npc_sprites),
            "sprites": npc_sprites,
        }
        npc_animation_bytes = (json.dumps(npc_animation_catalog, separators=(",", ":")) + "\n").encode()
        npc_animation_path = output_dir / "npc-animations" / "catalog.json"
        npc_animation_path.parent.mkdir(parents=True, exist_ok=True)
        npc_animation_path.write_bytes(npc_animation_bytes)
        generated.append({
            "path": npc_animation_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(npc_animation_bytes),
            "bytes": len(npc_animation_bytes),
        })

        enemy_attack_effect_resources = sorted(
            (name for name in members if name.startswith("enm/atef/") and name.rsplit("/", 1)[-1].isdigit()),
            key=lambda name: int(name.rsplit("/", 1)[-1]),
        )
        enemy_attack_effects = [
            decode_enemy_attack_effect(jar.read(member), int(member.rsplit("/", 1)[-1]))
            for member in enemy_attack_effect_resources
        ]
        enemy_attack_effect_catalog = {
            "format": "heroes-lore-enemy-attack-effect-catalog-v1",
            "effectCount": len(enemy_attack_effects),
            "effects": enemy_attack_effects,
        }
        enemy_attack_effect_bytes = (json.dumps(enemy_attack_effect_catalog, separators=(",", ":")) + "\n").encode()
        enemy_attack_effect_path = output_dir / "enemy-attack-effects" / "catalog.json"
        enemy_attack_effect_path.parent.mkdir(parents=True, exist_ok=True)
        enemy_attack_effect_path.write_bytes(enemy_attack_effect_bytes)
        generated.append({
            "path": enemy_attack_effect_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(enemy_attack_effect_bytes),
            "bytes": len(enemy_attack_effect_bytes),
        })

        player_skill_atlas_families = {
            0: "fi",
            1: "wa",
            2: "gr",
            3: "fi",
            4: "wa",
            5: "gr",
        }
        player_skill_effect_resources: list[tuple[int, int, str]] = [
            (0, 0, "grd/spr/0_01.eif"),
            (0, 1, "grd/spr/0_1.eif"),
        ]
        player_skill_effect_resources.extend(
            (skill_id, level_slot, f"grd/spr/{skill_id}_{level_slot}.eif")
            for skill_id in range(1, 2)
            for level_slot in range(2)
        )
        player_skill_effect_resources.extend(
            (skill_id, level_slot, f"grd/spr/{skill_id}_{level_slot}.eif")
            for skill_id in range(2, 6)
            for level_slot in range(3)
        )
        missing_player_skill_effects = [
            resource for _, _, resource in player_skill_effect_resources if resource not in members
        ]
        if missing_player_skill_effects:
            raise AssetFormatError(
                "missing pinned player skill effect resources: " + ", ".join(missing_player_skill_effects)
            )
        player_skill_effects = [
            {
                **decode_player_skill_effect(jar.read(resource), skill_id, level_slot, resource),
                "atlasFamily": player_skill_atlas_families[skill_id],
            }
            for skill_id, level_slot, resource in player_skill_effect_resources
        ]
        special_effect_resource = "grd/spr/0_02.eif"
        if special_effect_resource not in members:
            raise AssetFormatError(f"missing pinned player skill effect resource: {special_effect_resource}")
        player_skill_effect_catalog = {
            "format": "heroes-lore-player-skill-effect-catalog-v1",
            "effectCount": len(player_skill_effects),
            "effects": player_skill_effects,
            "specialEffects": [
                decode_player_skill_special_effect(jar.read(special_effect_resource), 2, special_effect_resource),
            ],
        }
        player_skill_effect_bytes = (
            json.dumps(player_skill_effect_catalog, separators=(",", ":")) + "\n"
        ).encode()
        player_skill_effect_path = output_dir / "player-skill-effects" / "catalog.json"
        player_skill_effect_path.parent.mkdir(parents=True, exist_ok=True)
        player_skill_effect_path.write_bytes(player_skill_effect_bytes)
        generated.append({
            "path": player_skill_effect_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(player_skill_effect_bytes),
            "bytes": len(player_skill_effect_bytes),
        })

        player_level_up_resource = "char/lvup.eif"
        if player_level_up_resource not in members:
            raise AssetFormatError(f"missing pinned player level-up effect resource: {player_level_up_resource}")
        player_level_up_effect = decode_player_level_up_effect(jar.read(player_level_up_resource))
        player_level_up_catalog = {
            "format": "heroes-lore-player-level-up-effect-catalog-v1",
            "effectCount": 1,
            "effects": [player_level_up_effect],
        }
        player_level_up_bytes = (
            json.dumps(player_level_up_catalog, separators=(",", ":")) + "\n"
        ).encode()
        player_level_up_path = output_dir / "player-level-up-effects" / "catalog.json"
        player_level_up_path.parent.mkdir(parents=True, exist_ok=True)
        player_level_up_path.write_bytes(player_level_up_bytes)
        generated.append({
            "path": player_level_up_path.relative_to(output_dir).as_posix(),
            "sha256": sha256(player_level_up_bytes),
            "bytes": len(player_level_up_bytes),
        })

        text_table_names = sorted(name for name in members if name.endswith(".tdf"))
        for member in text_table_names:
            parsed = decode_text_table(jar.read(member), member)
            output_path = _safe_output_path(
                output_dir / "text-tables",
                PurePosixPath(member).with_suffix(".json").as_posix(),
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            encoded = (json.dumps(parsed, separators=(",", ":")) + "\n").encode()
            output_path.write_bytes(encoded)
            generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(encoded), "bytes": len(encoded)})

        map_names = sorted(name for name in members if name.startswith("m/") and name.endswith(".map"))
        for member in map_names:
            parsed = decode_map(jar.read(member))
            output_path = _safe_output_path(output_dir / "maps", member[2:-4] + ".json")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            encoded = (json.dumps(parsed, separators=(",", ":")) + "\n").encode()
            output_path.write_bytes(encoded)
            generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(encoded), "bytes": len(encoded)})

        map_metadata: dict[str, dict[str, object]] = {}
        for member in map_names:
            parsed = decode_map(jar.read(member))
            map_metadata[PurePosixPath(member).stem] = parsed
        event_names = sorted(name for name in members if name.startswith("m/") and name.endswith(".evt"))
        enemy_placement_map_count = 0
        for member in event_names:
            path = PurePosixPath(member)
            map_id = path.stem
            if map_id not in map_metadata:
                continue
            metadata = map_metadata[map_id]
            width, height = int(metadata["width"]), int(metadata["height"])
            event_data = jar.read(member)
            parsed = decode_base_collision(event_data, width, height)
            output_path = _safe_output_path(output_dir / "collision", member[2:-4] + ".json")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            encoded = (json.dumps(parsed, separators=(",", ":")) + "\n").encode()
            output_path.write_bytes(encoded)
            generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(encoded), "bytes": len(encoded)})

            visuals = decode_event_visuals(event_data, width, height, int(metadata["tilesetId"]))
            visual_path = _safe_output_path(output_dir / "decorations", member[2:-4] + ".json")
            visual_path.parent.mkdir(parents=True, exist_ok=True)
            visual_encoded = (json.dumps(visuals, separators=(",", ":")) + "\n").encode()
            visual_path.write_bytes(visual_encoded)
            generated.append(
                {"path": visual_path.relative_to(output_dir).as_posix(), "sha256": sha256(visual_encoded), "bytes": len(visual_encoded)}
            )

            operations = decode_event_operations(event_data, width, height)
            if operations["enemyPlacements"]:
                enemy_placement_map_count += 1
            operations_path = _safe_output_path(output_dir / "event-operations", member[2:-4] + ".json")
            operations_path.parent.mkdir(parents=True, exist_ok=True)
            operations_encoded = (json.dumps(operations, separators=(",", ":")) + "\n").encode()
            operations_path.write_bytes(operations_encoded)
            generated.append(
                {"path": operations_path.relative_to(output_dir).as_posix(), "sha256": sha256(operations_encoded), "bytes": len(operations_encoded)}
            )

        png_names = sorted(name for name in members if name.lower().endswith(".png"))
        for member in png_names:
            data = jar.read(member)
            _validate_png(data, 0)
            output_path = _safe_output_path(output_dir / "standalone", member)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(data)
            generated.append({"path": output_path.relative_to(output_dir).as_posix(), "sha256": sha256(data), "bytes": len(data)})

    manifest = {
        "sourceJarSha256": jar_hash,
        "sourceJar": jar_path.name,
        "atlasCount": len(image_manifests),
        "heroElementPaletteVariantCount": hero_element_palette_variant_count,
        "characterSpriteLayoutCount": len(character_layout_names),
        "languageLocaleCount": 1,
        "languageStringCount": int(language["stringCount"]),
        "enemyDataVariantCount": len(enemy_data_names),
        "enemyDefinitionCountPerVariant": enemy_definition_count,
        "equipmentDataCategoryCount": len(equipment_categories),
        "enemySpriteAnimationCount": len(enemy_sprite_resources),
        "bossSpriteAnimationCount": len(boss_sprite_resources),
        "bossAttackEffectCount": len(boss_attack_effect_resources),
        "npcSpriteAnimationCount": len(npc_sprite_resources),
        "enemyAttackEffectCount": len(enemy_attack_effect_resources),
        "playerSkillEffectCount": len(player_skill_effect_resources),
        "playerSkillSpecialEffectCount": len(player_skill_effect_catalog["specialEffects"]),
        "playerLevelUpEffectCount": 1,
        "textTableCount": len(text_table_names),
        "mapCount": len(map_names),
        "eventCollisionGridCount": len(event_names),
        "eventDecorationSetCount": len(event_names),
        "eventOperationSetCount": len(event_names),
        "enemyPlacementMapCount": enemy_placement_map_count,
        "standalonePngCount": len(png_names),
        "musicTrackCount": 1,
        "musicLoopCount": -1,
        "generatedFileCount": len(generated),
        "files": generated,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jar", type=Path, default=DEFAULT_JAR, help="local v2.1.2 JAR (read-only)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="ignored local output directory")
    parser.add_argument(
        "--player-level-up-resource",
        type=Path,
        help="refresh only the level-up catalog from an already-decompiled char/lvup.eif",
    )
    args = parser.parse_args()
    if args.player_level_up_resource is not None:
        try:
            result = refresh_player_level_up_effect(args.player_level_up_resource, args.output)
        except (OSError, AssetFormatError) as exc:
            print(f"player level-up asset refresh failed: {exc}", file=sys.stderr)
            return 1
        print(
            f"Refreshed {result['frameCount']} level-up frames / {result['componentCount']} components "
            f"from {args.player_level_up_resource} to {result['catalogPath']}"
        )
        return 0
    try:
        result = extract(args.jar, args.output)
    except (OSError, zipfile.BadZipFile, AssetFormatError) as exc:
        print(f"asset extraction failed: {exc}", file=sys.stderr)
        return 1
    print(
        "Extracted "
        f"{result['atlasCount']} atlases, {result['mapCount']} maps, "
        f"{result['characterSpriteLayoutCount']} character sprite layouts, "
        f"{result['heroElementPaletteVariantCount']} hero element palette variants, "
        f"{result['languageStringCount']} localized strings, "
        f"{result['enemyDataVariantCount']} enemy data variants "
        f"({result['enemyDefinitionCountPerVariant']} records each), "
        f"{result['equipmentDataCategoryCount']} equipment item categories, "
        f"{result['enemySpriteAnimationCount']} enemy sprite animation sets, "
        f"{result['bossSpriteAnimationCount']} boss sprite animation sets, "
        f"{result['bossAttackEffectCount']} boss attack effect sets, "
        f"{result['npcSpriteAnimationCount']} NPC sprite animation sets, "
        f"{result['enemyAttackEffectCount']} enemy attack effect sets, "
        f"{result['playerSkillEffectCount']} player skill effect sets plus "
        f"{result['playerSkillSpecialEffectCount']} special effect stream, "
        f"{result['textTableCount']} localized text tables, "
        f"{result['eventCollisionGridCount']} base collision layers, "
        f"{result['eventDecorationSetCount']} base decoration sets, "
        f"{result['eventOperationSetCount']} raw event-operation tables, "
        f"{result['enemyPlacementMapCount']} maps with enemy placements, "
        f"{result['standalonePngCount']} standalone PNGs "
        f"({result['generatedFileCount']} generated files) to {args.output}"
    )
    print(f"Baseline SHA-256: {result['sourceJarSha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
