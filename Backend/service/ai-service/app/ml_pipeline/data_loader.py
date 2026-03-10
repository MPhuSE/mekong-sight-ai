from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd
from supabase import Client, create_client


PROVINCE_MAP: Dict[str, str] = {
    "kien giang": "Kien Giang",
    "soc trang": "Soc Trang",
    "bac lieu": "Bac Lieu",
    "ben tre": "Ben Tre",
    "ca mau": "Ca Mau",
    "tra vinh": "Tra Vinh",
    "dong thap": "Dong Thap",
    "tien giang": "Tien Giang",
    "hau giang": "Hau Giang",
    "long an": "Long An",
    "an giang": "An Giang",
    "can tho": "Can Tho",
    "vinh long": "Vinh Long",
}

SALINITY_COLUMNS = ("salinity_daily", "salinity", "salinity_ppt", "salinityppt")
RAIN_COLUMNS = ("rain_mm", "rainfall_mm", "rain", "rainfall")
TEMP_COLUMNS = ("temp_c", "temperature_c", "temperature", "temp")
JSON_SALINITY_COLUMNS = ("Do_man", "do_man", "salinity", "salinity_ppt")
JSON_PH_COLUMNS = ("pH", "ph")

LOCATION_PROVINCE_MAP: Dict[str, str] = {
    "cang long": "Tra Vinh",
    "hau giang": "Hau Giang",
    "kien giang": "Kien Giang",
    "can tho": "Can Tho",
    "xa no": "Can Tho",
    "vam xang": "Can Tho",
    "ox12": "Can Tho",
}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    no_accents = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return no_accents


def normalize_province_name(value: str) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = _strip_accents(text).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if text in PROVINCE_MAP:
        return PROVINCE_MAP[text]
    for key, canonical in PROVINCE_MAP.items():
        if key in text:
            return canonical
    return " ".join(word.capitalize() for word in text.split())


def parse_province_from_address(address: str) -> Optional[str]:
    if address is None:
        return None
    text = str(address).strip()
    if not text:
        return None
    segments = [item.strip() for item in re.split(r",|;|\||-", text) if item.strip()]
    for segment in reversed(segments):
        province = normalize_province_name(segment)
        if province in PROVINCE_MAP.values():
            return province
    return normalize_province_name(text)


def _parse_iso_week_date(file_name: str) -> Optional[date]:
    match = re.search(r"tuan[_-](\d{1,2})_(\d{4})", file_name.lower())
    if not match:
        return None
    week = int(match.group(1))
    year = int(match.group(2))
    if week < 1 or week > 53:
        return None
    try:
        # ISO week: use Monday as anchor date for each report week.
        return date.fromisocalendar(year, week, 1)
    except ValueError:
        return None


def _province_from_location(location: str) -> Optional[str]:
    if not location:
        return None
    base = _strip_accents(str(location)).lower()
    base = re.sub(r"[^a-z0-9\s]", " ", base)
    base = re.sub(r"\s+", " ", base).strip()
    if not base:
        return None

    direct = normalize_province_name(base)
    if direct in PROVINCE_MAP.values():
        return direct

    for hint, province in LOCATION_PROVINCE_MAP.items():
        if hint in base:
            return province

    parsed = parse_province_from_address(str(location))
    return parsed if parsed in PROVINCE_MAP.values() else None


def load_salinity_json_folder(folder: Path) -> pd.DataFrame:
    if not folder.exists() or not folder.is_dir():
        raise ValueError(f"JSON folder does not exist: {folder}")

    rows: List[Dict[str, object]] = []
    for path in sorted(folder.glob("*.json")):
        report_date = _parse_iso_week_date(path.name)
        if report_date is None:
            continue

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue

        data = payload.get("data", []) if isinstance(payload, dict) else []
        if not isinstance(data, list):
            continue

        for item in data:
            if not isinstance(item, dict):
                continue
            location = item.get("location")
            province = _province_from_location(str(location or ""))
            if not province:
                continue

            salinity_val = None
            for key in JSON_SALINITY_COLUMNS:
                if key in item:
                    salinity_val = item.get(key)
                    break
            if salinity_val is None:
                continue

            try:
                salinity = float(salinity_val)
            except (TypeError, ValueError):
                continue

            ph_value = None
            for key in JSON_PH_COLUMNS:
                if key in item:
                    try:
                        ph_value = float(item.get(key)) if item.get(key) is not None else None
                    except (TypeError, ValueError):
                        ph_value = None
                    break

            rows.append(
                {
                    "date": pd.Timestamp(report_date),
                    "province": province,
                    "salinity_ppt": salinity,
                    "ph": ph_value,
                    "source_file": path.name,
                    "source_location": str(location or "").strip(),
                }
            )

    if not rows:
        return pd.DataFrame(columns=["date", "province", "salinity_ppt", "ph", "source_file", "source_location"])

    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.normalize()
    frame["province"] = frame["province"].apply(normalize_province_name)
    frame["salinity_ppt"] = pd.to_numeric(frame["salinity_ppt"], errors="coerce")
    frame = frame.dropna(subset=["date", "province", "salinity_ppt"])
    frame = frame.sort_values(["date", "province", "source_file"]).drop_duplicates(
        subset=["date", "province", "salinity_ppt", "source_location"],
        keep="first",
    )
    return frame.reset_index(drop=True)


def _detect_column(columns: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    lowered = {column.lower(): column for column in columns}
    for candidate in candidates:
        if candidate.lower() in lowered:
            return lowered[candidate.lower()]
    return None


def _standardize_common_columns(df: pd.DataFrame) -> pd.DataFrame:
    frame = df.copy()
    frame.columns = [str(column).strip() for column in frame.columns]
    date_col = _detect_column(frame.columns, ("date", "timestamp", "day"))
    province_col = _detect_column(frame.columns, ("province", "tinh", "province_name"))
    if date_col is None or province_col is None:
        raise ValueError("CSV phải có cột date và province.")
    frame["date"] = pd.to_datetime(frame[date_col], errors="coerce").dt.normalize()
    frame["province"] = frame[province_col].apply(normalize_province_name)
    return frame


def load_weather_csv(path: Path) -> pd.DataFrame:
    frame = _standardize_common_columns(pd.read_csv(path))
    rain_col = _detect_column(frame.columns, RAIN_COLUMNS)
    temp_col = _detect_column(frame.columns, TEMP_COLUMNS)
    if rain_col is None or temp_col is None:
        raise ValueError("Weather CSV phải có rain_mm/rainfall_mm và temp_c/temperature_c.")
    frame["rain_mm"] = pd.to_numeric(frame[rain_col], errors="coerce")
    frame["temp_c"] = pd.to_numeric(frame[temp_col], errors="coerce")
    return frame[["date", "province", "rain_mm", "temp_c"]]


def load_local_combined_csv(path: Path) -> pd.DataFrame:
    frame = _standardize_common_columns(pd.read_csv(path))
    sal_col = _detect_column(frame.columns, SALINITY_COLUMNS)
    if sal_col is not None:
        frame["salinity_daily"] = pd.to_numeric(frame[sal_col], errors="coerce")
    rain_col = _detect_column(frame.columns, RAIN_COLUMNS)
    if rain_col is not None:
        frame["rain_mm"] = pd.to_numeric(frame[rain_col], errors="coerce")
    temp_col = _detect_column(frame.columns, TEMP_COLUMNS)
    if temp_col is not None:
        frame["temp_c"] = pd.to_numeric(frame[temp_col], errors="coerce")
    return frame


def _fetch_table_all(client: Client, table_name: str, columns: str, page_size: int = 1000) -> List[dict]:
    rows: List[dict] = []
    start = 0
    while True:
        response = client.table(table_name).select(columns).range(start, start + page_size - 1).execute()
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def load_supabase_daily_dataset() -> pd.DataFrame:
    url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not service_key:
        raise ValueError("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY để đọc dữ liệu Supabase.")

    client = create_client(url, service_key)

    sensors = pd.DataFrame(
        _fetch_table_all(client, "sensor_readings", "device_id,timestamp,salinity,temperature")
    )
    devices = pd.DataFrame(_fetch_table_all(client, "iot_devices", "id,farm_id"))
    farms = pd.DataFrame(_fetch_table_all(client, "farms", "id,address"))

    if sensors.empty:
        raise ValueError("Không có dữ liệu sensor_readings trong Supabase.")
    if devices.empty or farms.empty:
        raise ValueError("Thiếu dữ liệu iot_devices hoặc farms trong Supabase.")

    frame = sensors.merge(devices, left_on="device_id", right_on="id", how="left", suffixes=("", "_device"))
    frame = frame.merge(farms, left_on="farm_id", right_on="id", how="left", suffixes=("", "_farm"))
    frame["province"] = frame["address"].apply(parse_province_from_address)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce", utc=True)
    frame = frame.dropna(subset=["timestamp", "province"])
    frame["date"] = frame["timestamp"].dt.tz_convert("Asia/Ho_Chi_Minh").dt.normalize()
    frame["salinity_daily"] = pd.to_numeric(frame["salinity"], errors="coerce")
    frame["temp_sensor_c"] = pd.to_numeric(frame["temperature"], errors="coerce")

    grouped = (
        frame.groupby(["province", "date"], as_index=False)
        .agg({"salinity_daily": "mean", "temp_sensor_c": "mean"})
        .sort_values(["province", "date"])
    )
    return grouped


def _fill_weather_gaps(frame: pd.DataFrame) -> pd.DataFrame:
    parts: List[pd.DataFrame] = []
    for province, group in frame.groupby("province", dropna=False):
        ordered = group.sort_values("date").copy()
        ordered["rain_mm"] = (
            ordered["rain_mm"]
            .interpolate(method="linear", limit_direction="both")
            .ffill(limit=3)
            .bfill(limit=3)
        )
        ordered["temp_c"] = (
            ordered["temp_c"]
            .interpolate(method="linear", limit_direction="both")
            .ffill(limit=3)
            .bfill(limit=3)
        )
        ordered["province"] = province
        parts.append(ordered)

    if not parts:
        return frame.copy()
    return pd.concat(parts, ignore_index=True).sort_values(["province", "date"]).reset_index(drop=True)


def build_daily_dataset(
    weather_csv_path: Path,
    local_dataset_path: Optional[Path] = None,
    use_supabase_fallback: bool = True,
) -> pd.DataFrame:
    weather = load_weather_csv(weather_csv_path)

    combined_local: Optional[pd.DataFrame] = None
    if local_dataset_path and local_dataset_path.exists():
        combined_local = load_local_combined_csv(local_dataset_path)

    if combined_local is not None and "salinity_daily" in combined_local.columns:
        salinity_source = combined_local[["date", "province", "salinity_daily"]].copy()
        if "temp_c" in combined_local.columns:
            salinity_source["temp_c_local"] = combined_local["temp_c"]
        if "rain_mm" in combined_local.columns:
            salinity_source["rain_mm_local"] = combined_local["rain_mm"]
    elif use_supabase_fallback:
        salinity_source = load_supabase_daily_dataset()
    else:
        raise ValueError("Không có cột salinity trong local dataset và đã tắt fallback Supabase.")

    merged = salinity_source.merge(weather, on=["date", "province"], how="left", suffixes=("", "_weather"))
    if "rain_mm_local" in merged.columns:
        merged["rain_mm"] = merged["rain_mm"].fillna(merged["rain_mm_local"])
    if "temp_c_local" in merged.columns:
        merged["temp_c"] = merged["temp_c"].fillna(merged["temp_c_local"])
    if "temp_sensor_c" in merged.columns:
        merged["temp_c"] = merged["temp_c"].fillna(merged["temp_sensor_c"])

    merged = _fill_weather_gaps(merged)
    merged["salinity_daily"] = pd.to_numeric(merged["salinity_daily"], errors="coerce")
    merged["rain_mm"] = pd.to_numeric(merged["rain_mm"], errors="coerce")
    merged["temp_c"] = pd.to_numeric(merged["temp_c"], errors="coerce")
    merged["date"] = pd.to_datetime(merged["date"], errors="coerce").dt.normalize()
    merged["province"] = merged["province"].apply(normalize_province_name)

    merged = merged.dropna(subset=["date", "province", "salinity_daily", "rain_mm", "temp_c"])
    merged = merged.sort_values(["province", "date"]).reset_index(drop=True)
    return merged[["date", "province", "salinity_daily", "rain_mm", "temp_c"]]
