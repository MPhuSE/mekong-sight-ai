from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import joblib
import pandas as pd

from .config import DEFAULT_METADATA_PATH, DEFAULT_PREPARED_DAILY_CSV, DEFAULT_WEATHER_CSV
from .data_loader import build_daily_dataset, normalize_province_name
from .feature_builder import build_feature_frame, encode_features


@dataclass
class ForecastPoint:
    day_ahead: int
    date: str
    salinity_pred: float


@dataclass
class ForecastResult:
    province: str
    as_of: str
    model_version: str
    model_set_used: str
    forecast: List[ForecastPoint]


class ForecastError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class ForecastService:
    def __init__(self, metadata_path: Path = DEFAULT_METADATA_PATH):
        if not metadata_path.exists():
            raise ForecastError(404, "Model metadata not found. Train AI1 first.")
        self.metadata_path = metadata_path
        self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        self.xgboost_models: Dict[int, object] = {}
        self.baseline_models: Dict[int, object] = {}
        self._load_models()

    def _load_models(self) -> None:
        for horizon in self.metadata.get("horizons", []):
            xgb_path = self.metadata_path.parent / f"salinity_day{horizon}.pkl"
            baseline_path = self.metadata_path.parent / f"baseline_day{horizon}.pkl"
            if not xgb_path.exists():
                raise ForecastError(404, f"Missing model file: {xgb_path.name}")
            if not baseline_path.exists():
                raise ForecastError(404, f"Missing model file: {baseline_path.name}")
            try:
                self.xgboost_models[int(horizon)] = joblib.load(xgb_path)
                self.baseline_models[int(horizon)] = joblib.load(baseline_path)
            except Exception as exc:
                message = str(exc)
                if "libomp" in message or "Library not loaded" in message or "libxgboost" in message:
                    raise ForecastError(
                        500,
                        "XGBoost Library could not be loaded. Mac users: run `brew install libomp`, then restart ai-service.",
                    ) from exc
                raise ForecastError(500, f"Failed to load model artifacts: {message}") from exc

    def _load_daily_dataset(self) -> pd.DataFrame:
        artifacts = self.metadata.get("artifacts", {})
        prepared_raw = artifacts.get("prepared_daily_csv", "")

        # Try multiple candidates for prepared dataset:
        # 1) Path stored in metadata (may be absolute Windows path or relative)
        # 2) Default prepared dataset path inside this repo.
        prepared_candidates = []
        if prepared_raw:
            prepared_candidates.append(Path(prepared_raw))
            # Handle Windows-style backslashes stored in metadata when running on POSIX.
            if "\\" in prepared_raw:
                prepared_candidates.append(Path(prepared_raw.replace("\\", "/")))
        prepared_candidates.append(DEFAULT_PREPARED_DAILY_CSV)

        for candidate in prepared_candidates:
            try:
                if candidate and candidate.exists():
                    frame = pd.read_csv(candidate)
                    frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.normalize()
                    return frame
            except Exception:
                continue

        data_sources = self.metadata.get("data_sources", {})
        weather_raw = data_sources.get("weather_csv", "")

        # Resolve weather CSV similarly: metadata may contain a Windows path like "app\\data\\...".
        weather_candidates = []
        if weather_raw:
            weather_candidates.append(Path(weather_raw))
            if "\\" in weather_raw:
                weather_candidates.append(Path(weather_raw.replace("\\", "/")))
        weather_candidates.append(DEFAULT_WEATHER_CSV)

        weather_csv: Optional[Path] = None
        for candidate in weather_candidates:
            if candidate and candidate.exists():
                weather_csv = candidate
                break

        if weather_csv is None:
            raise ForecastError(500, "Weather CSV not found to rebuild inference dataset.")

        local_dataset_raw = data_sources.get("local_dataset")
        local_dataset = Path(local_dataset_raw) if local_dataset_raw else None
        use_supabase_fallback = bool(data_sources.get("supabase_fallback", False))
        return build_daily_dataset(
            weather_csv_path=weather_csv,
            local_dataset_path=local_dataset if local_dataset and local_dataset.exists() else None,
            use_supabase_fallback=use_supabase_fallback,
        )

    def _resolve_model(self, horizon: int, model_set: str) -> object:
        if model_set == "xgboost":
            return self.xgboost_models[int(horizon)]
        if model_set == "baseline":
            return self.baseline_models[int(horizon)]

        champion_map = self.metadata.get("champion_by_horizon", {})
        champion = champion_map.get(f"day{horizon}", "xgboost")
        if champion == "baseline_linear":
            return self.baseline_models[int(horizon)]
        return self.xgboost_models[int(horizon)]

    def forecast(
        self,
        province: str,
        as_of: Optional[str] = None,
        model_set: str = "champion",
    ) -> ForecastResult:
        normalized_province = normalize_province_name(province or "")
        if not normalized_province:
            raise ForecastError(400, "province is required.")
        requested_model_set = (model_set or "champion").strip().lower()
        if requested_model_set not in {"champion", "baseline", "xgboost"}:
            raise ForecastError(400, "model_set must be one of: champion, baseline, xgboost.")
        if normalized_province not in self.metadata.get("provinces", []):
            raise ForecastError(404, f"No model/data for province: {province}")

        base_daily = self._load_daily_dataset()
        feature_frame, feature_cols, _ = build_feature_frame(base_daily, include_targets=False)
        province_frame = feature_frame[feature_frame["province"] == normalized_province].copy()
        province_frame = province_frame.dropna(subset=feature_cols)
        if province_frame.empty:
            raise ForecastError(422, "Not enough history to build forecast features.")

        if as_of:
            try:
                requested_as_of = pd.to_datetime(as_of).normalize().date()
            except Exception as exc:
                raise ForecastError(400, "as_of must be YYYY-MM-DD.") from exc
        else:
            requested_as_of = datetime.now(ZoneInfo("Asia/Bangkok")).date()

        province_frame = province_frame[province_frame["date"].dt.date <= requested_as_of]
        if province_frame.empty:
            raise ForecastError(422, "No valid data available before as_of.")

        latest_row = province_frame.sort_values("date").iloc[[-1]].copy()
        province_cols = self.metadata.get("province_dummy_columns", [])
        x_latest = encode_features(latest_row, feature_cols, province_cols)
        expected_cols = self.metadata.get("feature_columns", [])
        for column in expected_cols:
            if column not in x_latest.columns:
                x_latest[column] = 0
        x_latest = x_latest[expected_cols]

        points: List[ForecastPoint] = []
        for horizon in sorted(self.xgboost_models.keys()):
            model = self._resolve_model(horizon=int(horizon), model_set=requested_model_set)
            pred = float(model.predict(x_latest)[0])
            points.append(
                ForecastPoint(
                    day_ahead=int(horizon),
                    date=(requested_as_of + timedelta(days=int(horizon))).strftime("%Y-%m-%d"),
                    salinity_pred=round(pred, 4),
                )
            )

        return ForecastResult(
            province=normalized_province,
            as_of=requested_as_of.strftime("%Y-%m-%d"),
            model_version=self.metadata.get("model_version", "unknown"),
            model_set_used=requested_model_set,
            forecast=points,
        )
