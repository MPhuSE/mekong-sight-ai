from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns


def _markdown_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_No data_"
    headers = [str(col) for col in df.columns]
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for _, row in df.iterrows():
        values = [str(row[col]) for col in df.columns]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def generate_actual_vs_pred_charts(predictions: pd.DataFrame, chart_dir: Path) -> List[Path]:
    chart_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: List[Path] = []
    target_horizons = list(range(1, 8))

    for province, province_df in predictions[predictions["model"] == "xgboost"].groupby("province"):
        fig, axes = plt.subplots(4, 2, figsize=(16, 18), sharex=False)
        axes = axes.flatten()
        for idx, horizon in enumerate(target_horizons):
            ax = axes[idx]
            subset = province_df[province_df["horizon"] == horizon].sort_values("date")
            if subset.empty:
                ax.set_title(f"{province} - day{horizon} (no data)")
                ax.axis("off")
                continue
            ax.plot(subset["date"], subset["actual"], label="actual", linewidth=1.5)
            ax.plot(subset["date"], subset["predicted"], label="predicted", linewidth=1.5)
            ax.set_title(f"{province} - day{horizon}")
            ax.tick_params(axis="x", labelrotation=45)
            ax.grid(alpha=0.3)
            if idx == 0:
                ax.legend(loc="best")
        axes[-1].axis("off")
        fig.tight_layout()
        file_name = f"actual_vs_pred_{province.replace(' ', '_').lower()}.png"
        output_path = chart_dir / file_name
        fig.savefig(output_path, dpi=140)
        plt.close(fig)
        saved_paths.append(output_path)
    return saved_paths


def generate_error_by_season_chart(season_df: pd.DataFrame, chart_dir: Path) -> Path:
    chart_dir.mkdir(parents=True, exist_ok=True)
    subset = season_df[
        (season_df["model"] == "xgboost")
        & (season_df["horizon"].isin([1, 3, 7]))
    ].copy()
    subset["horizon_label"] = subset["horizon"].apply(lambda value: f"day{int(value)}")

    fig, ax = plt.subplots(figsize=(10, 6))
    sns.barplot(data=subset, x="horizon_label", y="mae", hue="season", ax=ax)
    ax.set_title("MAE by Season (XGBoost)")
    ax.set_xlabel("Horizon")
    ax.set_ylabel("MAE")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()

    output_path = chart_dir / "error_by_season.png"
    fig.savefig(output_path, dpi=140)
    plt.close(fig)
    return output_path


def build_report_markdown(
    metrics_df: pd.DataFrame,
    season_df: pd.DataFrame,
    provinces: Iterable[str],
    model_version: str,
    chart_paths: List[Path],
    season_chart_path: Path,
    champion_by_horizon: Dict[str, str],
    backtest_summary_df: pd.DataFrame,
    lstm_metrics_df: pd.DataFrame,
    regression_check_df: pd.DataFrame,
) -> str:
    metric_focus = metrics_df[metrics_df["horizon"].isin([1, 3, 7])].copy()
    metric_focus["mae"] = metric_focus["mae"].round(4)
    metric_focus["rmse"] = metric_focus["rmse"].round(4)

    full_metrics = metrics_df.copy()
    full_metrics["mae"] = full_metrics["mae"].round(4)
    full_metrics["rmse"] = full_metrics["rmse"].round(4)

    season_view = season_df[season_df["horizon"].isin([1, 3, 7])].copy()
    season_view["mae"] = season_view["mae"].round(4)
    season_view["rmse"] = season_view["rmse"].round(4)
    backtest_view = backtest_summary_df.copy()
    for column in ("mae_mean", "mae_std", "rmse_mean", "rmse_std"):
        if column in backtest_view.columns:
            backtest_view[column] = backtest_view[column].round(4)
    lstm_view = lstm_metrics_df.copy()
    for column in ("mae", "rmse"):
        if column in lstm_view.columns:
            lstm_view[column] = lstm_view[column].round(4)
    regression_view = regression_check_df.copy()
    if "pct_change" in regression_view.columns:
        regression_view["pct_change"] = (regression_view["pct_change"] * 100.0).round(2).astype(str) + "%"
    failed_horizons = []
    if "status" in regression_check_df.columns and "horizon" in regression_check_df.columns:
        failed_horizons = sorted(
            int(item) for item in regression_check_df[regression_check_df["status"] == "fail"]["horizon"].tolist()
        )
    champion_rows = pd.DataFrame(
        [{"horizon": key, "champion_model": value} for key, value in sorted(champion_by_horizon.items())]
    )

    lines = [
        "# AI1 Report - 7-day Salinity Forecast",
        "",
        f"- Model version: `{model_version}`",
        f"- Provinces used: {', '.join(sorted(provinces))}",
        "",
        "## Dataset",
        "- Granularity: daily province-level.",
        "- Features: lag salinity, lag weather, rolling stats, seasonality, province one-hot.",
        "- Split: 70% train, 15% val, 15% test (time-ordered, no shuffle).",
        "",
        "## Metrics (day1/day3/day7)",
        _markdown_table(metric_focus.sort_values(["horizon", "model"]).reset_index(drop=True)),
        "",
        "## Champion by Horizon (production)",
        _markdown_table(champion_rows),
        "",
        "## Full Metrics (day1..day7)",
        _markdown_table(full_metrics.sort_values(["horizon", "model"]).reset_index(drop=True)),
        "",
        "## Rolling-origin Backtest Summary",
        _markdown_table(backtest_view),
        "",
        "## Error by Season (dry vs rainy)",
        _markdown_table(season_view.sort_values(["model", "horizon", "season"]).reset_index(drop=True)),
        "",
        "## LSTM Pilot",
        _markdown_table(lstm_view),
        "",
        "## Regression Check vs Previous Version",
        _markdown_table(regression_view),
        "",
        "Regression gate note:",
        (
            f"- WARNING: RMSE degradation >10% detected at horizons: {', '.join([f'day{h}' for h in failed_horizons])}."
            if failed_horizons
            else "- PASS: No horizon exceeded 10% RMSE degradation threshold."
        ),
        "",
        "## Charts",
        f"- Error by season chart: `{season_chart_path.as_posix()}`",
    ]
    for path in chart_paths:
        lines.append(f"- Actual vs predicted chart: `{path.as_posix()}`")

    lines.extend(
        [
            "",
            "## Limitations",
            "- Model is province-level; not optimized for per-farm microclimate.",
            "- Missing weather values are interpolated and can reduce reliability.",
            "- Direct multi-step forecasts are independent between horizons.",
        ]
    )
    return "\n".join(lines)


def write_report(markdown_text: str, report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(markdown_text, encoding="utf-8")
