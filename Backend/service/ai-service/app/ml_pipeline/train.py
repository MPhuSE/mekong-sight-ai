from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from .config import (
    BACKTEST_MIN_TRAIN_DAYS,
    BACKTEST_STEP_DAYS,
    BACKTEST_TEST_DAYS,
    BACKTEST_VAL_DAYS,
    CHARTS_DIR,
    DEFAULT_BACKTEST_METRICS_CSV,
    DEFAULT_LSTM_METRICS_CSV,
    DEFAULT_METADATA_PATH,
    DEFAULT_METRICS_CSV,
    DEFAULT_PREDICTIONS_CSV,
    DEFAULT_PREPARED_DAILY_CSV,
    DEFAULT_REGRESSION_CHECK_CSV,
    DEFAULT_REPORT_PATH,
    DEFAULT_TRAIN_FEATURES_CSV,
    DEFAULT_WEATHER_CSV,
    FORECAST_HORIZONS,
    LSTM_DROPOUTS,
    LSTM_EPOCHS,
    LSTM_HIDDEN_SIZES,
    LSTM_PATIENCE,
    LSTM_SEQUENCE_LENGTH,
    MIN_VALID_DAYS_PER_PROVINCE,
    MODELS_DIR,
    XGB_PARAM_GRID,
    ensure_directories,
    grid_product,
)
from .data_loader import build_daily_dataset
from .evaluate import (
    build_rolling_origin_windows,
    evaluate_horizon_predictions,
    regression_metrics,
    season_error_table,
    summarize_backtest_metrics,
)
from .feature_builder import (
    build_feature_frame,
    encode_features,
    filter_valid_provinces,
    province_dummy_columns,
    time_series_split,
)
from .report import (
    build_report_markdown,
    generate_actual_vs_pred_charts,
    generate_error_by_season_chart,
    write_report,
)

try:
    from xgboost import XGBRegressor
except ImportError as exc:  # pragma: no cover - runtime dependency check
    raise ImportError("Thieu xgboost. Hay cai xgboost trong requirements.txt") from exc


def _quick_grid() -> Dict[str, list]:
    return {
        "max_depth": [4],
        "learning_rate": [0.05],
        "n_estimators": [120],
        "subsample": [0.8],
        "colsample_bytree": [0.8],
    }


def _rmse(y_true: pd.Series, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def _train_holdout_models(
    split,
    feature_cols: List[str],
    province_cols: List[str],
    param_grid: Dict[str, list],
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Dict[str, float]], Dict[str, str], Dict[str, Dict[str, float]], List[str]]:
    x_train = encode_features(split.train, feature_cols, province_cols)
    x_val = encode_features(split.val, feature_cols, province_cols)
    x_test = encode_features(split.test, feature_cols, province_cols)
    encoded_feature_cols = list(x_train.columns)

    metrics_rows: List[Dict[str, float]] = []
    prediction_frames: List[pd.DataFrame] = []
    best_params_map: Dict[str, Dict[str, float]] = {}
    champion_by_horizon: Dict[str, str] = {}
    validation_metrics: Dict[str, Dict[str, float]] = {}

    for horizon in FORECAST_HORIZONS:
        target_col = f"y_day{horizon}"
        y_train = split.train[target_col]
        y_val = split.val[target_col]
        y_test = split.test[target_col]

        baseline = LinearRegression()
        baseline.fit(x_train, y_train)
        baseline_val_pred = baseline.predict(x_val)
        baseline_test_pred = baseline.predict(x_test)
        baseline_val_rmse = _rmse(y_val, baseline_val_pred)

        best_model = None
        best_params = None
        best_rmse = float("inf")

        for params in grid_product(param_grid):
            candidate = XGBRegressor(
                objective="reg:squarederror",
                random_state=42,
                n_jobs=4,
                **params,
            )
            candidate.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
            val_pred = candidate.predict(x_val)
            val_rmse = _rmse(y_val, val_pred)
            if val_rmse < best_rmse:
                best_rmse = val_rmse
                best_model = candidate
                best_params = params

        if best_model is None or best_params is None:
            raise RuntimeError(f"Khong chon duoc model cho horizon day{horizon}.")

        main_test_pred = best_model.predict(x_test)
        main_val_rmse = best_rmse

        champion = "baseline_linear" if baseline_val_rmse <= main_val_rmse else "xgboost"
        champion_by_horizon[f"day{horizon}"] = champion
        validation_metrics[f"day{horizon}"] = {
            "baseline_rmse": round(baseline_val_rmse, 6),
            "xgboost_rmse": round(main_val_rmse, 6),
        }

        metrics_rows.extend(
            evaluate_horizon_predictions(
                y_true=y_test,
                baseline_pred=baseline_test_pred,
                main_pred=main_test_pred,
                horizon=horizon,
            )
        )

        test_meta = split.test.loc[:, ["date", "province", "is_dry_season", target_col]].copy()
        test_meta = test_meta.rename(columns={target_col: "actual"})
        for model_name, preds in (
            ("baseline_linear", baseline_test_pred),
            ("xgboost", main_test_pred),
        ):
            temp = test_meta.copy()
            temp["horizon"] = horizon
            temp["model"] = model_name
            temp["predicted"] = preds
            prediction_frames.append(temp)

        baseline_path = MODELS_DIR / f"baseline_day{horizon}.pkl"
        model_path = MODELS_DIR / f"salinity_day{horizon}.pkl"
        joblib.dump(baseline, baseline_path)
        joblib.dump(best_model, model_path)
        best_params_map[f"day{horizon}"] = best_params
        print(f"[AI1] Saved models for day{horizon}: {model_path.name}, {baseline_path.name}")

    metrics_df = pd.DataFrame(metrics_rows).sort_values(["horizon", "model"]).reset_index(drop=True)
    predictions_df = pd.concat(prediction_frames, ignore_index=True)
    return (
        metrics_df,
        predictions_df,
        best_params_map,
        champion_by_horizon,
        validation_metrics,
        encoded_feature_cols,
    )


def _run_rolling_backtest(
    frame: pd.DataFrame,
    feature_cols: List[str],
    province_cols: List[str],
    best_params_map: Dict[str, Dict[str, float]],
) -> pd.DataFrame:
    unique_dates = sorted(frame["date"].dropna().unique())
    windows = build_rolling_origin_windows(
        unique_dates=unique_dates,
        min_train_days=BACKTEST_MIN_TRAIN_DAYS,
        val_days=BACKTEST_VAL_DAYS,
        test_days=BACKTEST_TEST_DAYS,
        step_days=BACKTEST_STEP_DAYS,
    )
    if not windows:
        return pd.DataFrame(
            columns=[
                "fold_id",
                "train_end_date",
                "val_end_date",
                "test_end_date",
                "model",
                "horizon",
                "mae",
                "rmse",
            ]
        )

    rows: List[Dict[str, object]] = []
    for window in windows:
        train_fold = frame[frame["date"] <= window.train_end_date].copy()
        val_fold = frame[(frame["date"] > window.train_end_date) & (frame["date"] <= window.val_end_date)].copy()
        test_fold = frame[(frame["date"] > window.val_end_date) & (frame["date"] <= window.test_end_date)].copy()
        if train_fold.empty or val_fold.empty or test_fold.empty:
            continue

        x_train = encode_features(train_fold, feature_cols, province_cols)
        x_val = encode_features(val_fold, feature_cols, province_cols)
        x_test = encode_features(test_fold, feature_cols, province_cols)

        for horizon in FORECAST_HORIZONS:
            target_col = f"y_day{horizon}"
            y_train = train_fold[target_col]
            y_val = val_fold[target_col]
            y_test = test_fold[target_col]

            baseline = LinearRegression()
            baseline.fit(x_train, y_train)
            baseline_pred = baseline.predict(x_test)
            baseline_metrics = regression_metrics(y_test, baseline_pred)
            rows.append(
                {
                    "fold_id": window.fold_id,
                    "train_end_date": window.train_end_date.strftime("%Y-%m-%d"),
                    "val_end_date": window.val_end_date.strftime("%Y-%m-%d"),
                    "test_end_date": window.test_end_date.strftime("%Y-%m-%d"),
                    "model": "baseline_linear",
                    "horizon": horizon,
                    "mae": baseline_metrics["mae"],
                    "rmse": baseline_metrics["rmse"],
                }
            )

            params = best_params_map.get(f"day{horizon}")
            if not params:
                continue
            xgb = XGBRegressor(
                objective="reg:squarederror",
                random_state=42,
                n_jobs=4,
                **params,
            )
            xgb.fit(x_train, y_train, eval_set=[(x_val, y_val)], verbose=False)
            xgb_pred = xgb.predict(x_test)
            xgb_metrics = regression_metrics(y_test, xgb_pred)
            rows.append(
                {
                    "fold_id": window.fold_id,
                    "train_end_date": window.train_end_date.strftime("%Y-%m-%d"),
                    "val_end_date": window.val_end_date.strftime("%Y-%m-%d"),
                    "test_end_date": window.test_end_date.strftime("%Y-%m-%d"),
                    "model": "xgboost",
                    "horizon": horizon,
                    "mae": xgb_metrics["mae"],
                    "rmse": xgb_metrics["rmse"],
                }
            )
    return pd.DataFrame(rows)


def _build_regression_check(
    current_metrics: pd.DataFrame,
    previous_metrics: pd.DataFrame,
    focus_horizons: Optional[List[int]] = None,
) -> pd.DataFrame:
    focus = focus_horizons or [1, 3, 7]
    rows: List[Dict[str, object]] = []

    def _champion_rmse(metric_df: pd.DataFrame, horizon: int) -> Optional[float]:
        subset = metric_df[metric_df["horizon"] == horizon]
        if subset.empty:
            return None
        return float(subset["rmse"].min())

    for horizon in focus:
        new_rmse = _champion_rmse(current_metrics, horizon)
        old_rmse = _champion_rmse(previous_metrics, horizon) if not previous_metrics.empty else None
        if new_rmse is None:
            rows.append(
                {
                    "horizon": horizon,
                    "previous_rmse": None,
                    "current_rmse": None,
                    "pct_change": None,
                    "status": "missing_current",
                }
            )
            continue
        if old_rmse is None or old_rmse <= 0:
            rows.append(
                {
                    "horizon": horizon,
                    "previous_rmse": old_rmse,
                    "current_rmse": new_rmse,
                    "pct_change": 0.0,
                    "status": "no_previous",
                }
            )
            continue
        pct_change = (new_rmse - old_rmse) / old_rmse
        rows.append(
            {
                "horizon": horizon,
                "previous_rmse": old_rmse,
                "current_rmse": new_rmse,
                "pct_change": pct_change,
                "status": "pass" if pct_change <= 0.10 else "fail",
            }
        )
    return pd.DataFrame(rows)


def _lstm_sequences(frame: pd.DataFrame) -> np.ndarray:
    sal_cols = [f"sal_t-{lag}" for lag in range(LSTM_SEQUENCE_LENGTH, 0, -1)]
    rain_cols = [f"rain_t-{min(lag, 7)}" for lag in range(LSTM_SEQUENCE_LENGTH, 0, -1)]
    temp_cols = [f"temp_t-{min(lag, 7)}" for lag in range(LSTM_SEQUENCE_LENGTH, 0, -1)]
    sal = frame[sal_cols].to_numpy(dtype=np.float32)
    rain = frame[rain_cols].to_numpy(dtype=np.float32)
    temp = frame[temp_cols].to_numpy(dtype=np.float32)
    return np.stack([sal, rain, temp], axis=2)


def _run_lstm_pilot(split, quick_mode: bool) -> pd.DataFrame:
    columns = [
        "horizon",
        "model",
        "mae",
        "rmse",
        "status",
        "note",
        "best_hidden_size",
        "best_dropout",
        "best_val_rmse",
    ]
    if quick_mode:
        return pd.DataFrame(
            [
                {
                    "horizon": horizon,
                    "model": "lstm_pilot",
                    "mae": None,
                    "rmse": None,
                    "status": "skipped",
                    "note": "Skipped in quick mode.",
                    "best_hidden_size": None,
                    "best_dropout": None,
                    "best_val_rmse": None,
                }
                for horizon in FORECAST_HORIZONS
            ],
            columns=columns,
        )

    try:
        import torch
        import torch.nn as nn
    except ImportError:
        return pd.DataFrame(
            [
                {
                    "horizon": horizon,
                    "model": "lstm_pilot",
                    "mae": None,
                    "rmse": None,
                    "status": "skipped",
                    "note": "torch is unavailable.",
                    "best_hidden_size": None,
                    "best_dropout": None,
                    "best_val_rmse": None,
                }
                for horizon in FORECAST_HORIZONS
            ],
            columns=columns,
        )

    if len(split.train) < 220 or len(split.val) < 40 or len(split.test) < 40:
        return pd.DataFrame(
            [
                {
                    "horizon": horizon,
                    "model": "lstm_pilot",
                    "mae": None,
                    "rmse": None,
                    "status": "skipped",
                    "note": "Insufficient samples for stable LSTM pilot.",
                    "best_hidden_size": None,
                    "best_dropout": None,
                    "best_val_rmse": None,
                }
                for horizon in FORECAST_HORIZONS
            ],
            columns=columns,
        )

    class LSTMRegressor(nn.Module):
        def __init__(self, input_size: int, hidden_size: int, dropout: float):
            super().__init__()
            self.lstm = nn.LSTM(input_size=input_size, hidden_size=hidden_size, batch_first=True, dropout=dropout)
            self.head = nn.Linear(hidden_size, 1)

        def forward(self, x):
            output, _ = self.lstm(x)
            return self.head(output[:, -1, :]).squeeze(-1)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_seq = _lstm_sequences(split.train)
    val_seq = _lstm_sequences(split.val)
    test_seq = _lstm_sequences(split.test)

    seq_mean = train_seq.mean(axis=(0, 1), keepdims=True)
    seq_std = train_seq.std(axis=(0, 1), keepdims=True)
    seq_std[seq_std < 1e-6] = 1.0
    train_seq = (train_seq - seq_mean) / seq_std
    val_seq = (val_seq - seq_mean) / seq_std
    test_seq = (test_seq - seq_mean) / seq_std

    rows: List[Dict[str, object]] = []
    for horizon in FORECAST_HORIZONS:
        target_col = f"y_day{horizon}"
        y_train = split.train[target_col].to_numpy(dtype=np.float32)
        y_val = split.val[target_col].to_numpy(dtype=np.float32)
        y_test = split.test[target_col].to_numpy(dtype=np.float32)

        train_x = torch.tensor(train_seq, dtype=torch.float32, device=device)
        val_x = torch.tensor(val_seq, dtype=torch.float32, device=device)
        test_x = torch.tensor(test_seq, dtype=torch.float32, device=device)
        train_y = torch.tensor(y_train, dtype=torch.float32, device=device)
        val_y = torch.tensor(y_val, dtype=torch.float32, device=device)

        best_trial = None
        best_val_rmse = float("inf")
        for hidden_size in LSTM_HIDDEN_SIZES:
            for dropout in LSTM_DROPOUTS:
                model = LSTMRegressor(input_size=3, hidden_size=int(hidden_size), dropout=float(dropout)).to(device)
                optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
                loss_fn = nn.MSELoss()

                best_state = None
                no_improve = 0
                local_best = float("inf")
                for _ in range(LSTM_EPOCHS):
                    model.train()
                    optimizer.zero_grad()
                    pred = model(train_x)
                    loss = loss_fn(pred, train_y)
                    loss.backward()
                    optimizer.step()

                    model.eval()
                    with torch.no_grad():
                        val_pred = model(val_x).detach().cpu().numpy()
                    val_rmse = float(np.sqrt(np.mean((y_val - val_pred) ** 2)))
                    if val_rmse + 1e-7 < local_best:
                        local_best = val_rmse
                        best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
                        no_improve = 0
                    else:
                        no_improve += 1
                        if no_improve >= LSTM_PATIENCE:
                            break

                if local_best < best_val_rmse and best_state is not None:
                    best_val_rmse = local_best
                    best_trial = {
                        "hidden_size": int(hidden_size),
                        "dropout": float(dropout),
                        "state_dict": best_state,
                    }

        if best_trial is None:
            rows.append(
                {
                    "horizon": horizon,
                    "model": "lstm_pilot",
                    "mae": None,
                    "rmse": None,
                    "status": "skipped",
                    "note": "No valid LSTM trial.",
                    "best_hidden_size": None,
                    "best_dropout": None,
                    "best_val_rmse": None,
                }
            )
            continue

        best_model = LSTMRegressor(
            input_size=3,
            hidden_size=best_trial["hidden_size"],
            dropout=best_trial["dropout"],
        ).to(device)
        best_model.load_state_dict(best_trial["state_dict"])
        best_model.eval()
        with torch.no_grad():
            test_pred = best_model(test_x).detach().cpu().numpy()
        metrics = regression_metrics(y_test, test_pred)
        save_path = MODELS_DIR / f"lstm_day{horizon}.pkl"
        torch.save(
            {
                "state_dict": best_model.state_dict(),
                "hidden_size": best_trial["hidden_size"],
                "dropout": best_trial["dropout"],
                "sequence_length": LSTM_SEQUENCE_LENGTH,
                "input_size": 3,
            },
            save_path,
        )

        rows.append(
            {
                "horizon": horizon,
                "model": "lstm_pilot",
                "mae": metrics["mae"],
                "rmse": metrics["rmse"],
                "status": "trained",
                "note": f"Saved to {save_path.name}",
                "best_hidden_size": best_trial["hidden_size"],
                "best_dropout": best_trial["dropout"],
                "best_val_rmse": best_val_rmse,
            }
        )
        print(f"[AI1] LSTM pilot day{horizon} trained: {save_path.name}")

    return pd.DataFrame(rows, columns=columns)


def run_training(
    weather_csv: Path,
    local_dataset: Optional[Path] = None,
    use_supabase_fallback: bool = True,
    quick_mode: bool = False,
    run_lstm_pilot: bool = True,
) -> Dict[str, object]:
    ensure_directories()
    mode_label = "quick" if quick_mode else "full"
    print(f"[AI1] Training mode: {mode_label}")

    previous_metrics = pd.DataFrame()
    if DEFAULT_METRICS_CSV.exists():
        previous_metrics = pd.read_csv(DEFAULT_METRICS_CSV)

    daily_df = build_daily_dataset(
        weather_csv_path=weather_csv,
        local_dataset_path=local_dataset,
        use_supabase_fallback=use_supabase_fallback,
    )
    daily_df.to_csv(DEFAULT_PREPARED_DAILY_CSV, index=False)
    print(f"[AI1] Saved prepared daily dataset: {DEFAULT_PREPARED_DAILY_CSV}")

    feature_frame, feature_cols, target_cols = build_feature_frame(daily_df, include_targets=True)
    train_frame = filter_valid_provinces(
        feature_frame,
        feature_cols=feature_cols,
        target_cols=target_cols,
        min_valid_days=MIN_VALID_DAYS_PER_PROVINCE,
    )
    if train_frame.empty:
        raise ValueError("Khong co du lieu hop le sau feature engineering va filter tinh.")

    split = time_series_split(train_frame)
    provinces = sorted(train_frame["province"].unique())
    province_cols = province_dummy_columns(provinces)
    train_frame.to_csv(DEFAULT_TRAIN_FEATURES_CSV, index=False)
    print(f"[AI1] Saved training feature dataset: {DEFAULT_TRAIN_FEATURES_CSV}")

    param_grid = _quick_grid() if quick_mode else XGB_PARAM_GRID
    (
        metrics_df,
        predictions_df,
        best_params_map,
        champion_by_horizon,
        validation_metrics,
        encoded_feature_cols,
    ) = _train_holdout_models(
        split=split,
        feature_cols=feature_cols,
        province_cols=province_cols,
        param_grid=param_grid,
    )

    season_df = season_error_table(predictions_df)
    backtest_folds_df = _run_rolling_backtest(
        frame=train_frame,
        feature_cols=feature_cols,
        province_cols=province_cols,
        best_params_map=best_params_map,
    )
    backtest_summary_df = summarize_backtest_metrics(backtest_folds_df)
    regression_check_df = _build_regression_check(metrics_df, previous_metrics)
    regression_gate_passed = bool(
        regression_check_df.empty or not (regression_check_df["status"] == "fail").any()
    )
    lstm_metrics_df = _run_lstm_pilot(split, quick_mode=quick_mode) if run_lstm_pilot else pd.DataFrame(
        [
            {
                "horizon": horizon,
                "model": "lstm_pilot",
                "mae": None,
                "rmse": None,
                "status": "skipped",
                "note": "LSTM pilot disabled by flag.",
                "best_hidden_size": None,
                "best_dropout": None,
                "best_val_rmse": None,
            }
            for horizon in FORECAST_HORIZONS
        ]
    )

    metrics_df.to_csv(DEFAULT_METRICS_CSV, index=False)
    predictions_df.to_csv(DEFAULT_PREDICTIONS_CSV, index=False)
    backtest_summary_df.to_csv(DEFAULT_BACKTEST_METRICS_CSV, index=False)
    lstm_metrics_df.to_csv(DEFAULT_LSTM_METRICS_CSV, index=False)
    regression_check_df.to_csv(DEFAULT_REGRESSION_CHECK_CSV, index=False)
    print(f"[AI1] Metrics saved: {DEFAULT_METRICS_CSV}")
    print(f"[AI1] Predictions saved: {DEFAULT_PREDICTIONS_CSV}")
    print(f"[AI1] Backtest summary saved: {DEFAULT_BACKTEST_METRICS_CSV}")
    print(f"[AI1] LSTM pilot metrics saved: {DEFAULT_LSTM_METRICS_CSV}")
    print(f"[AI1] Regression check saved: {DEFAULT_REGRESSION_CHECK_CSV}")

    chart_paths = generate_actual_vs_pred_charts(predictions_df, CHARTS_DIR)
    season_chart = generate_error_by_season_chart(season_df, CHARTS_DIR)
    model_version = datetime.utcnow().strftime("%Y%m%d%H%M%S")

    metadata = {
        "model_version": model_version,
        "created_at_utc": datetime.utcnow().isoformat(),
        "horizons": list(FORECAST_HORIZONS),
        "feature_columns": encoded_feature_cols,
        "numeric_feature_columns": feature_cols,
        "province_dummy_columns": province_cols,
        "provinces": provinces,
        "split": {
            "train_end_date": split.train_end_date.strftime("%Y-%m-%d"),
            "val_end_date": split.val_end_date.strftime("%Y-%m-%d"),
            "train_ratio": 0.70,
            "val_ratio": 0.15,
            "test_ratio": 0.15,
        },
        "backtest": {
            "min_train_days": BACKTEST_MIN_TRAIN_DAYS,
            "val_days": BACKTEST_VAL_DAYS,
            "test_days": BACKTEST_TEST_DAYS,
            "step_days": BACKTEST_STEP_DAYS,
            "fold_count": int(backtest_folds_df["fold_id"].nunique()) if not backtest_folds_df.empty else 0,
        },
        "best_params": best_params_map,
        "validation_metrics": validation_metrics,
        "champion_by_horizon": champion_by_horizon,
        "regression_check": regression_check_df.to_dict(orient="records"),
        "regression_gate_passed": regression_gate_passed,
        "artifacts": {
            "prepared_daily_csv": str(DEFAULT_PREPARED_DAILY_CSV),
            "train_feature_csv": str(DEFAULT_TRAIN_FEATURES_CSV),
            "metrics_csv": str(DEFAULT_METRICS_CSV),
            "predictions_csv": str(DEFAULT_PREDICTIONS_CSV),
            "backtest_metrics_csv": str(DEFAULT_BACKTEST_METRICS_CSV),
            "lstm_metrics_csv": str(DEFAULT_LSTM_METRICS_CSV),
            "regression_check_csv": str(DEFAULT_REGRESSION_CHECK_CSV),
            "report_path": str(DEFAULT_REPORT_PATH),
        },
        "data_sources": {
            "weather_csv": str(weather_csv),
            "local_dataset": str(local_dataset) if local_dataset else None,
            "supabase_fallback": use_supabase_fallback,
        },
    }
    DEFAULT_METADATA_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[AI1] Metadata saved: {DEFAULT_METADATA_PATH}")

    markdown = build_report_markdown(
        metrics_df=metrics_df,
        season_df=season_df,
        provinces=provinces,
        model_version=model_version,
        chart_paths=chart_paths,
        season_chart_path=season_chart,
        champion_by_horizon=champion_by_horizon,
        backtest_summary_df=backtest_summary_df,
        lstm_metrics_df=lstm_metrics_df,
        regression_check_df=regression_check_df,
    )
    write_report(markdown, DEFAULT_REPORT_PATH)
    print(f"[AI1] Report generated: {DEFAULT_REPORT_PATH}")

    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train AI1 salinity 7-day forecast models.")
    parser.add_argument(
        "--weather-csv",
        type=Path,
        default=DEFAULT_WEATHER_CSV,
        help="Path to weather CSV (date, province, rain_mm, temp_c).",
    )
    parser.add_argument(
        "--local-dataset",
        type=Path,
        default=None,
        help="Optional combined local dataset containing salinity/weather columns.",
    )
    parser.add_argument(
        "--no-supabase-fallback",
        action="store_true",
        help="Disable Supabase fallback when local dataset has no salinity column.",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run quick training with compact XGBoost grid.",
    )
    parser.add_argument(
        "--skip-lstm",
        action="store_true",
        help="Skip LSTM pilot training.",
    )
    args = parser.parse_args()

    local_dataset = args.local_dataset if args.local_dataset else args.weather_csv
    run_training(
        weather_csv=args.weather_csv,
        local_dataset=local_dataset,
        use_supabase_fallback=not args.no_supabase_fallback,
        quick_mode=args.quick,
        run_lstm_pilot=not args.skip_lstm,
    )


if __name__ == "__main__":
    main()
