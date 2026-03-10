from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from app.ml_pipeline.data_loader import normalize_province_name, parse_province_from_address
from app.ml_pipeline.data_loader import load_salinity_json_folder
from app.ml_pipeline.evaluate import build_rolling_origin_windows
from app.ml_pipeline.feature_builder import (
    build_feature_frame,
    filter_valid_provinces,
    time_series_split,
)
from app.ml_pipeline.infer import ForecastService
from app.ml_pipeline.train import run_training


class TestDataLoader(unittest.TestCase):
    def test_parse_and_normalize_province(self):
        self.assertEqual(normalize_province_name("Sóc Trăng"), "Soc Trang")
        self.assertEqual(parse_province_from_address("Tran De, Soc Trang"), "Soc Trang")
        self.assertEqual(parse_province_from_address("Hoa Binh, Bac Lieu"), "Bac Lieu")

    def test_load_salinity_json_folder(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            folder = Path(tmpdir)
            payload = {
                "data": [
                    {"location": "Càng Long", "Do_man": 4.0, "pH": 6.5, "page": 2},
                    {"location": "Hậu Giang", "Do_man": 8.2, "pH": None, "page": 2},
                    {"location": "OX12 (Ngã 3 sông Cần Thơ)", "Do_man": 0.3, "pH": 6.1, "page": 6},
                ],
                "summary": {"ket_luan": "test"},
            }
            (folder / "bt_nmt_tuan_11_2025.json").write_text(
                __import__("json").dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )

            result = load_salinity_json_folder(folder)
            self.assertEqual(len(result), 3)
            self.assertIn("Tra Vinh", set(result["province"]))
            self.assertIn("Hau Giang", set(result["province"]))
            self.assertIn("Can Tho", set(result["province"]))


class TestFeatureBuilder(unittest.TestCase):
    def _build_sample_daily(self) -> pd.DataFrame:
        dates = pd.date_range("2024-01-01", periods=200, freq="D")
        provinces = ["Soc Trang", "Bac Lieu", "Kien Giang"]
        rows = []
        for province in provinces:
            for idx, day in enumerate(dates):
                rows.append(
                    {
                        "date": day,
                        "province": province,
                        "salinity_daily": 2.0 + idx * 0.01 + (0.2 if province == "Bac Lieu" else 0),
                        "rain_mm": 1.0 + (idx % 10),
                        "temp_c": 27.0 + (idx % 5),
                    }
                )
        return pd.DataFrame(rows)

    def test_lag_features_no_leakage(self):
        frame, feature_cols, target_cols = build_feature_frame(self._build_sample_daily(), include_targets=True)
        row = frame[(frame["province"] == "Soc Trang") & (frame["date"] == pd.Timestamp("2024-01-20"))].iloc[0]
        prev_day = frame[(frame["province"] == "Soc Trang") & (frame["date"] == pd.Timestamp("2024-01-19"))].iloc[0]
        self.assertAlmostEqual(row["sal_t-1"], prev_day["salinity_daily"], places=6)

    def test_split_70_15_15(self):
        frame, feature_cols, target_cols = build_feature_frame(self._build_sample_daily(), include_targets=True)
        valid = filter_valid_provinces(frame, feature_cols, target_cols, min_valid_days=120)
        split = time_series_split(valid, train_ratio=0.70, val_ratio=0.15)
        self.assertTrue(len(split.train) > len(split.val) > 0)
        self.assertTrue(len(split.test) > 0)
        self.assertTrue(split.train["date"].max() < split.val["date"].min())
        self.assertTrue(split.val["date"].max() < split.test["date"].min())


class TestTrainingIntegration(unittest.TestCase):
    def test_training_generates_models(self):
        dates = pd.date_range("2024-01-01", periods=200, freq="D")
        provinces = ["Soc Trang", "Bac Lieu", "Kien Giang", "Ca Mau", "Ben Tre"]
        rows = []
        rng = np.random.default_rng(42)
        for province in provinces:
            base = 2.5 + 0.2 * provinces.index(province)
            for idx, day in enumerate(dates):
                rows.append(
                    {
                        "date": day.strftime("%Y-%m-%d"),
                        "province": province,
                        "salinity_ppt": base + 0.01 * idx + rng.normal(0, 0.03),
                        "temperature_c": 27.0 + rng.normal(0, 0.8),
                        "rainfall_mm": max(0.0, rng.normal(5, 3)),
                    }
                )

        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "dataset.csv"
            pd.DataFrame(rows).to_csv(csv_path, index=False)
            metadata = run_training(
                weather_csv=csv_path,
                local_dataset=csv_path,
                use_supabase_fallback=False,
                quick_mode=True,
            )

        models_dir = Path("app/models")
        for horizon in range(1, 8):
            self.assertTrue((models_dir / f"salinity_day{horizon}.pkl").exists())
            self.assertTrue((models_dir / f"baseline_day{horizon}.pkl").exists())
        self.assertIn("model_version", metadata)
        self.assertIn("champion_by_horizon", metadata)
        self.assertEqual(len(metadata["champion_by_horizon"]), 7)

        reports_dir = Path("app/reports")
        self.assertTrue((reports_dir / "backtest_metrics_summary.csv").exists())
        self.assertTrue((reports_dir / "lstm_pilot_metrics.csv").exists())
        self.assertTrue((reports_dir / "regression_check.csv").exists())

        service = ForecastService()
        for model_set in ("champion", "baseline", "xgboost"):
            result = service.forecast(province="Soc Trang", model_set=model_set)
            self.assertEqual(result.model_set_used, model_set)
            self.assertEqual(len(result.forecast), 7)

    def test_rolling_backtest_windows(self):
        dates = pd.date_range("2024-01-01", periods=365, freq="D")
        windows = build_rolling_origin_windows(
            unique_dates=dates,
            min_train_days=180,
            val_days=30,
            test_days=30,
            step_days=14,
        )
        self.assertGreater(len(windows), 0)
        for window in windows:
            self.assertLess(window.train_end_date, window.val_end_date)
            self.assertLess(window.val_end_date, window.test_end_date)


if __name__ == "__main__":
    unittest.main()
