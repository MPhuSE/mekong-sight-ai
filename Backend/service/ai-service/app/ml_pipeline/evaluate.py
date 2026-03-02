from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error


def regression_metrics(y_true: Iterable[float], y_pred: Iterable[float]) -> Dict[str, float]:
    y_true_arr = np.asarray(list(y_true), dtype=float)
    y_pred_arr = np.asarray(list(y_pred), dtype=float)
    rmse = float(np.sqrt(mean_squared_error(y_true_arr, y_pred_arr)))
    mae = float(mean_absolute_error(y_true_arr, y_pred_arr))
    return {"mae": mae, "rmse": rmse}


def evaluate_horizon_predictions(
    y_true: pd.Series,
    baseline_pred: np.ndarray,
    main_pred: np.ndarray,
    horizon: int,
) -> List[Dict[str, float]]:
    base = regression_metrics(y_true, baseline_pred)
    main = regression_metrics(y_true, main_pred)
    return [
        {"horizon": horizon, "model": "baseline_linear", "mae": base["mae"], "rmse": base["rmse"]},
        {"horizon": horizon, "model": "xgboost", "mae": main["mae"], "rmse": main["rmse"]},
    ]


def season_error_table(predictions: pd.DataFrame) -> pd.DataFrame:
    required = {"model", "horizon", "is_dry_season", "actual", "predicted"}
    missing = required - set(predictions.columns)
    if missing:
        raise ValueError(f"Predictions thiếu cột bắt buộc: {sorted(missing)}")

    rows = []
    for (model_name, horizon, dry_flag), group in predictions.groupby(["model", "horizon", "is_dry_season"]):
        metrics = regression_metrics(group["actual"], group["predicted"])
        rows.append(
            {
                "model": model_name,
                "horizon": int(horizon),
                "season": "dry" if int(dry_flag) == 1 else "rainy",
                "mae": metrics["mae"],
                "rmse": metrics["rmse"],
                "sample_size": int(len(group)),
            }
        )
    return pd.DataFrame(rows).sort_values(["model", "horizon", "season"]).reset_index(drop=True)


@dataclass(frozen=True)
class RollingWindow:
    fold_id: int
    train_end_date: pd.Timestamp
    val_end_date: pd.Timestamp
    test_end_date: pd.Timestamp


def build_rolling_origin_windows(
    unique_dates: Sequence[pd.Timestamp],
    min_train_days: int = 180,
    val_days: int = 30,
    test_days: int = 30,
    step_days: int = 14,
) -> List[RollingWindow]:
    dates = [pd.Timestamp(item) for item in unique_dates]
    if len(dates) < (min_train_days + val_days + test_days):
        return []

    windows: List[RollingWindow] = []
    fold_id = 1
    max_train_end_idx = len(dates) - val_days - test_days - 1
    for train_end_idx in range(min_train_days - 1, max_train_end_idx + 1, step_days):
        val_end_idx = train_end_idx + val_days
        test_end_idx = val_end_idx + test_days
        windows.append(
            RollingWindow(
                fold_id=fold_id,
                train_end_date=dates[train_end_idx],
                val_end_date=dates[val_end_idx],
                test_end_date=dates[test_end_idx],
            )
        )
        fold_id += 1
    return windows


def summarize_backtest_metrics(backtest_df: pd.DataFrame) -> pd.DataFrame:
    if backtest_df.empty:
        return pd.DataFrame(
            columns=["model", "horizon", "mae_mean", "mae_std", "rmse_mean", "rmse_std", "fold_count"]
        )
    grouped = (
        backtest_df.groupby(["model", "horizon"], as_index=False)
        .agg(
            mae_mean=("mae", "mean"),
            mae_std=("mae", "std"),
            rmse_mean=("rmse", "mean"),
            rmse_std=("rmse", "std"),
            fold_count=("fold_id", "nunique"),
        )
        .sort_values(["horizon", "model"])
        .reset_index(drop=True)
    )
    grouped["mae_std"] = grouped["mae_std"].fillna(0.0)
    grouped["rmse_std"] = grouped["rmse_std"].fillna(0.0)
    return grouped
