"""Pruebas unitarias de las funciones puras de personalización de checklist.

No requieren base de datos: cubren el merge catálogo base ± personalización
(review_checklist.get_effective_items) y la generación de keys de ítems
personalizados (nunca se confía en la key que manda el cliente).
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.review_checklist import (
    get_effective_items, generate_item_key, slugify, _normalize_custom_items,
)


def test_get_effective_items_returns_base_catalog_unmodified_without_overrides():
    items = get_effective_items("hardware", "windows_server", {}, {})
    keys = [i["key"] for i in items]
    assert "estado_general" in keys
    assert all(i["is_custom"] is False for i in items)


def test_get_effective_items_hides_removed_default_item():
    removed = {"hardware": {"windows_server": ["firmware"]}}
    items = get_effective_items("hardware", "windows_server", removed, {})
    keys = [i["key"] for i in items]
    assert "firmware" not in keys
    assert "estado_general" in keys


def test_get_effective_items_adds_custom_item():
    custom = {"hardware": {"windows_server": [{"key": "custom_x_ab12cd", "label": "Revisión extra"}]}}
    items = get_effective_items("hardware", "windows_server", {}, custom)
    custom_entries = [i for i in items if i["is_custom"]]
    assert len(custom_entries) == 1
    assert custom_entries[0]["label"] == "Revisión extra"


def test_get_effective_items_removal_does_not_affect_other_device_type():
    removed = {"hardware": {"windows_server": ["firmware"]}}
    items = get_effective_items("hardware", "linux", removed, {})
    keys = [i["key"] for i in items]
    assert "firmware" in keys


def test_generate_item_key_is_slugified_and_unique_per_call():
    k1 = generate_item_key("Revisión de discos")
    k2 = generate_item_key("Revisión de discos")
    assert k1.startswith("custom_revisi_n_de_discos")
    assert k1 != k2  # el sufijo aleatorio evita colisiones


def test_slugify_strips_accents_and_symbols_to_ascii_snake_case():
    assert slugify("Máquinas Virtuales!") == "m_quinas_virtuales"


def test_normalize_custom_items_ignores_client_supplied_keys():
    raw = {"vm": {"_all": [{"key": "not-trusted", "label": "Chequeo manual"}]}}
    normalized = _normalize_custom_items(raw)
    key = normalized["vm"]["_all"][0]["key"]
    assert key != "not-trusted"
    assert key.startswith("custom_")


def test_normalize_custom_items_drops_blank_labels():
    raw = {"vm": {"_all": [{"key": "x", "label": "   "}]}}
    normalized = _normalize_custom_items(raw)
    assert normalized["vm"]["_all"] == []
