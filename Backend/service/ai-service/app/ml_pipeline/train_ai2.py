from __future__ import annotations

"""
AI2 training script: risk classification (Low / Medium / High)
using sensor readings from Supabase.

Usage (from ai-service root):

    source .venv/bin/activate
    python -m app.ml_pipeline.train_ai2

Requires environment variables:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

from app.ml_pipeline.config import DEFAULT_WEATHER_CSV, MODELS_DIR
from app.ml_pipeline.data_loader import load_salinity_json_folder, normalize_province_name

try:
    from supabase import Client, create_client
except ImportError as exc:  # pragma: no cover
    raise ImportError("Supabase client library is missing. Install `supabase` in requirements.txt") from exc


AI2_METADATA_PATH = MODELS_DIR / "ai2_risk_metadata.json"


@dataclass
class AI2Config:
    min_history_per_device: int = 14
    test_size: float = 0.2
    random_state: int = 42


def _init_supabase_client() -> Client:
    load_dotenv()
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.")
    return create_client(url, key)


def _fetch_tables(client: Client) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    # Một số deployment cũ không có cột province trong bảng farms,
    # nên chỉ select các cột chắc chắn tồn tại. Thông tin tỉnh sẽ được
    # suy luận từ farm_code nếu cần.
    farms_res = client.table("farms").select("id, address, farm_type, farm_code").execute()
    devices_res = client.table("iot_devices").select("id, farm_id").execute()
    readings_res = (
        client.table("sensor_readings")
        .select("device_id, salinity, ph, temperature, timestamp")
        .order("timestamp", desc=True)
        .limit(200_000)
        .execute()
    )

    farms_df = pd.DataFrame(farms_res.data or [])
    devices_df = pd.DataFrame(devices_res.data or [])
    readings_df = pd.DataFrame(readings_res.data or [])

    return farms_df, devices_df, readings_df


FARM_CODE_PROVINCE = {
    "ST": "Soc Trang",
    "BL": "Bac Lieu",
    "KG": "Kien Giang",
    "BT": "Ben Tre",
    "CM": "Ca Mau",
}


def _build_base_frame(farms_df: pd.DataFrame, devices_df: pd.DataFrame, readings_df: pd.DataFrame) -> pd.DataFrame:
    if readings_df.empty:
        raise ValueError("No sensor_readings data available from Supabase.")

    readings_df["timestamp"] = pd.to_datetime(readings_df["timestamp"], errors="coerce")
    readings_df = readings_df.dropna(subset=["timestamp"])
    readings_df = readings_df.sort_values(["device_id", "timestamp"])

    frame = readings_df.merge(devices_df.rename(columns={"id": "device_id"}), on="device_id", how="left")
    frame = frame.merge(farms_df.rename(columns={"id": "farm_id"}), on="farm_id", how="left")
    frame = frame.dropna(subset=["farm_id"])

    frame["date"] = frame["timestamp"].dt.date
    frame["month"] = frame["timestamp"].dt.month
    frame["day_of_year"] = frame["timestamp"].dt.dayofyear
    frame["is_dry_season"] = frame["month"].isin([12, 1, 2, 3, 4]).astype(int)

    # Nếu cột province không tồn tại trong DB, cố gắng suy luận từ farm_code.
    if "province" not in frame.columns:
        frame["province"] = ""
    frame["province"] = frame["province"].fillna("").astype(str).str.strip()
    if "farm_code" in frame.columns:
        prefixes = frame["farm_code"].astype(str).str.split("_").str[0].str.upper()
        inferred = prefixes.map(FARM_CODE_PROVINCE).fillna("")
        mask = frame["province"].eq("") & inferred.ne("")
        frame.loc[mask, "province"] = inferred[mask]

    return frame


def _slug(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"[^a-z0-9_]", "", text)
    return text or "unknown"


def _build_local_frame_from_json(json_df: pd.DataFrame, weather_csv: Path) -> pd.DataFrame:
    if json_df.empty:
        raise ValueError("No valid rows in salinity JSON dataset.")

    frame = json_df.copy()
    frame["province"] = frame["province"].apply(normalize_province_name)
    frame = frame.dropna(subset=["date", "province", "salinity_ppt"])
    if frame.empty:
        raise ValueError("No rows left after cleaning JSON dataset.")

    frame = frame.sort_values(["date", "province", "source_location"]).reset_index(drop=True)
    frame["row_idx"] = frame.groupby(["date", "province"]).cumcount()
    frame["timestamp"] = pd.to_datetime(frame["date"]) + pd.to_timedelta(frame["row_idx"], unit="m")
    frame["device_id"] = (
        frame["province"].astype(str).map(_slug) + "__" + frame["source_location"].astype(str).map(_slug)
    )
    frame["salinity"] = pd.to_numeric(frame["salinity_ppt"], errors="coerce")
    frame["ph"] = pd.to_numeric(frame.get("ph"), errors="coerce")

    weather = pd.read_csv(weather_csv)
    weather.columns = [str(col).strip() for col in weather.columns]
    weather["date"] = pd.to_datetime(weather["date"], errors="coerce").dt.normalize()
    weather["province"] = weather["province"].apply(normalize_province_name)
    weather["temperature_c"] = pd.to_numeric(weather["temperature_c"], errors="coerce")
    weather = weather.dropna(subset=["date", "province", "temperature_c"])
    weather = weather[["date", "province", "temperature_c"]].drop_duplicates(subset=["date", "province"], keep="last")

    frame = frame.merge(weather, on=["date", "province"], how="left")
    temp_by_province = weather.groupby("province")["temperature_c"].median().to_dict()
    temp_global = float(weather["temperature_c"].median()) if not weather.empty else 28.5
    frame["temperature"] = frame.apply(
        lambda row: row["temperature_c"]
        if pd.notna(row["temperature_c"])
        else temp_by_province.get(row["province"], temp_global),
        axis=1,
    )

    ph_by_province = frame.groupby("province")["ph"].median().to_dict()
    ph_global = float(frame["ph"].median()) if frame["ph"].notna().any() else 7.4
    frame["ph"] = frame.apply(
        lambda row: row["ph"] if pd.notna(row["ph"]) else ph_by_province.get(row["province"], ph_global),
        axis=1,
    )

    frame["date"] = pd.to_datetime(frame["timestamp"]).dt.date
    frame["month"] = pd.to_datetime(frame["timestamp"]).dt.month
    frame["day_of_year"] = pd.to_datetime(frame["timestamp"]).dt.dayofyear
    frame["is_dry_season"] = frame["month"].isin([12, 1, 2, 3, 4]).astype(int)
    return frame


def _add_lag_and_rolling_features(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy().sort_values(["device_id", "timestamp"])
    group = frame.groupby("device_id", group_keys=False)

    frame["sal_t-1"] = group["salinity"].shift(1)
    frame["sal_t-3"] = group["salinity"].shift(3)
    frame["sal_t-7"] = group["salinity"].shift(7)

    frame["sal_3d_avg"] = group["salinity"].rolling(window=3, min_periods=1).mean().reset_index(level=0, drop=True)
    frame["sal_7d_avg"] = group["salinity"].rolling(window=7, min_periods=1).mean().reset_index(level=0, drop=True)
    frame["temp_7d_avg"] = group["temperature"].rolling(window=7, min_periods=1).mean().reset_index(level=0, drop=True)

    frame["sal_change_1d"] = frame["salinity"] - frame["sal_t-1"]
    frame["sal_change_3d"] = frame["salinity"] - frame["sal_t-3"]

    return frame


def _normalize_01(series: pd.Series, min_val: Optional[float] = None, max_val: Optional[float] = None) -> pd.Series:
    if min_val is not None and max_val is not None:
        return ((series - min_val) / (max_val - min_val)).clip(0, 1)
    lo = float(series.quantile(0.01))
    hi = float(series.quantile(0.99))
    if hi <= lo:
        hi = lo + 1.0
    return ((series - lo) / (hi - lo)).clip(0, 1)


def _build_risk_labels(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()

    s = _normalize_01(frame["salinity"], min_val=0.0, max_val=10.0)
    t = _normalize_01(frame["temperature"], min_val=15.0, max_val=35.0)

    r_raw = frame.get("rainfall_mm")
    r = _normalize_01(r_raw.fillna(0.0)) if r_raw is not None else pd.Series(0.0, index=frame.index)

    h_raw = frame.get("humidity")
    h = _normalize_01(h_raw.fillna(0.7)) if h_raw is not None else pd.Series(1.0, index=frame.index)

    risk_index = 0.55 * s + 0.20 * t + 0.20 * (1.0 - r) + 0.05 * (1.0 - h)
    risk_score = (risk_index * 100.0).clip(0, 100)
    frame["risk_score"] = risk_score

    conditions = [
        risk_score <= 35.0,
        (risk_score > 35.0) & (risk_score <= 65.0),
        risk_score > 65.0,
    ]
    choices = ["Low", "Medium", "High"]
    frame["risk_label"] = np.select(conditions, choices, default="Medium")

    return frame


def _prepare_dataset(frame: pd.DataFrame, config: AI2Config) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    frame = frame.copy()
    frame = frame.dropna(subset=["salinity", "temperature"])

    counts = frame.groupby("device_id")["timestamp"].transform("count")
    frame = frame[counts >= config.min_history_per_device]
    if frame.empty:
        raise ValueError("Not enough sensor history per device to train AI2.")

    frame["province_str"] = frame["province"].fillna("").astype(str).str.strip().str.lower()
    province_dummies = pd.get_dummies(frame["province_str"], prefix="province")
    frame = pd.concat([frame, province_dummies], axis=1)

    feature_cols = [
        "salinity",
        "temperature",
        "ph",
        "sal_t-1",
        "sal_t-3",
        "sal_t-7",
        "sal_3d_avg",
        "sal_7d_avg",
        "temp_7d_avg",
        "sal_change_1d",
        "sal_change_3d",
        "month",
        "day_of_year",
        "is_dry_season",
    ] + list(province_dummies.columns)

    frame = frame.dropna(subset=feature_cols)
    if frame.empty:
        raise ValueError("No rows remain after dropping NaNs for AI2 features.")

    X = frame[feature_cols].astype(float)
    y = frame["risk_label"].astype(str)
    return X, y, feature_cols


def _train_models(X: pd.DataFrame, y: pd.Series, config: AI2Config):
    if y.nunique() < 2:
        raise ValueError("AI2 needs at least 2 risk classes to train.")

    class_counts = y.value_counts()
    stratify = y if class_counts.min() >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=config.test_size,
        random_state=config.random_state,
        stratify=stratify,
    )

    baseline = LogisticRegression(
        max_iter=1000,
        class_weight="balanced",
    )
    baseline.fit(X_train, y_train)

    label_encoder = LabelEncoder()
    label_encoder.fit(y)
    y_train_enc = label_encoder.transform(y_train)
    y_test_enc = label_encoder.transform(y_test)

    main = XGBClassifier(
        max_depth=4,
        learning_rate=0.08,
        n_estimators=200,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        eval_metric="mlogloss",
        n_jobs=4,
        random_state=config.random_state,
    )
    main.fit(X_train, y_train_enc)

    print("=== AI2 Baseline (Logistic Regression) on test set ===")
    y_pred_base = baseline.predict(X_test)
    print(confusion_matrix(y_test, y_pred_base, labels=sorted(y.unique())))
    print(classification_report(y_test, y_pred_base, digits=3))

    print("=== AI2 Main (XGBoost) on test set ===")
    y_pred_main_enc = main.predict(X_test)
    y_pred_main = label_encoder.inverse_transform(y_pred_main_enc.astype(int))
    print(confusion_matrix(y_test, y_pred_main, labels=sorted(y.unique())))
    print(classification_report(y_test, y_pred_main, digits=3))

    return baseline, main


def _save_models_and_metadata(
    baseline,
    main,
    feature_cols: List[str],
    provinces: List[str],
    labels: List[str],
) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    baseline_path = MODELS_DIR / "ai2_risk_baseline.pkl"
    main_path = MODELS_DIR / "ai2_risk_xgboost.pkl"

    import joblib as _joblib

    _joblib.dump(baseline, baseline_path)
    _joblib.dump(main, main_path)

    metadata = {
        "model_version": datetime.utcnow().strftime("%Y%m%d%H%M%S"),
        "created_at_utc": datetime.utcnow().isoformat(),
        "feature_columns": feature_cols,
        "labels": labels,
        "provinces": sorted(set(provinces)),
        "artifacts": {
            "baseline_path": str(baseline_path),
            "main_path": str(main_path),
        },
    }

    AI2_METADATA_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[AI2] Models saved to: {baseline_path.name}, {main_path.name}")
    print(f"[AI2] Metadata saved to: {AI2_METADATA_PATH}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Train AI2 risk classification model.")
    parser.add_argument(
        "--salinity-json-dir",
        type=str,
        default="",
        help="Optional folder containing weekly salinity JSON files.",
    )
    parser.add_argument(
        "--weather-csv",
        type=str,
        default=str(DEFAULT_WEATHER_CSV),
        help="Weather CSV path used to enrich local JSON training.",
    )
    parser.add_argument("--min-history-per-device", type=int, default=14)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args()

    if args.salinity_json_dir:
        json_dir = Path(args.salinity_json_dir).expanduser().resolve()
        weather_csv = Path(args.weather_csv).expanduser().resolve()
        print(f"[AI2] Loading local JSON dataset: {json_dir}")
        json_df = load_salinity_json_folder(json_dir)
        print(f"[AI2] JSON rows loaded: {len(json_df)}")
        print(f"[AI2] Loading weather CSV: {weather_csv}")
        base_frame = _build_local_frame_from_json(json_df, weather_csv)
    else:
        print("[AI2] Initializing Supabase client...")
        client = _init_supabase_client()

        print("[AI2] Fetching tables from Supabase...")
        farms_df, devices_df, readings_df = _fetch_tables(client)

        print("[AI2] Building base frame...")
        base_frame = _build_base_frame(farms_df, devices_df, readings_df)

    print("[AI2] Adding lag and rolling features...")
    frame_with_feats = _add_lag_and_rolling_features(base_frame)

    print("[AI2] Computing rule-based risk labels...")
    frame_labeled = _build_risk_labels(frame_with_feats)

    cfg = AI2Config(
        min_history_per_device=max(1, int(args.min_history_per_device)),
        test_size=float(args.test_size),
        random_state=int(args.random_state),
    )
    print("[AI2] Preparing dataset for training...")
    X, y, feature_cols = _prepare_dataset(frame_labeled, cfg)

    print(f"[AI2] Training dataset size: {len(X)} rows, {len(feature_cols)} features")

    print("[AI2] Training models...")
    baseline, main = _train_models(X, y, cfg)

    provinces = frame_labeled["province"].dropna().astype(str).tolist()
    labels = sorted(y.unique().tolist())
    _save_models_and_metadata(baseline, main, feature_cols, provinces, labels)


if __name__ == "__main__":
    main()
