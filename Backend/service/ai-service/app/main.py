from __future__ import annotations

import asyncio
import csv
import io
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import sys

try:
    import google.generativeai as genai  # type: ignore[import]
except ImportError:
    genai = None  # type: ignore[assignment]
import numpy as np
import pandas as pd
import joblib
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel
from supabase import Client, create_client

# Allow running from either repo root or `app/` directory.
# Without this, `python main.py` (when CWD is `app/`) cannot resolve `import app.*`.
_SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from app.ml_pipeline.config import DEFAULT_METADATA_PATH, MODELS_DIR
from app.ml_pipeline.infer import ForecastError, ForecastResult, ForecastService
from app.ml_pipeline.data_loader import parse_province_from_address

load_dotenv()

app = FastAPI(title="Mekong Sight AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPORTS_DIR = Path(__file__).resolve().parent / "reports"
CHARTS_DIR = REPORTS_DIR / "charts"
CHARTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/ai/reports/static/charts", StaticFiles(directory=str(CHARTS_DIR)), name="ai-report-charts")


def _init_supabase_client() -> Optional[Client]:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception as exc:
        print(f"WARNING: Supabase client init failed: {exc}")
        return None


supabase = _init_supabase_client()


def _require_supabase() -> Client:
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase is not configured.")
    return supabase


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY and genai is not None:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel("gemini-2.5-flash")
        print("SUCCESS: Gemini AI initialized with model: gemini-2.5-flash")
    except Exception as exc:
        print(f"ERROR: Failed to initialize Gemini: {exc}")
        gemini_model = None
else:
    gemini_model = None
    print("WARNING: GEMINI_API_KEY not found in environment variables.")


SYSTEM_PROMPT = """
Bạn là một chuyên gia nông nghiệp hàng đầu tại Đồng bằng sông Cửu Long.
Nhiệm vụ của bạn là hỗ trợ nông dân phân tích hình ảnh về tôm và lúa.
1. Nếu thấy dấu hiệu bệnh, hãy gọi tên bệnh và giải thích nguyên nhân.
2. Đưa ra hướng xử lý thực tế, ưu tiên bền vững và chế phẩm sinh học.
3. Dùng ngôn ngữ gần gũi, chân chất với nông dân.
4. Nếu ảnh mờ hoặc thiếu dữ kiện, hướng dẫn cách chụp lại rõ hơn.
5. Nếu không phải ảnh nông nghiệp, từ chối nhẹ nhàng.
"""


BIOLOGICAL_THRESHOLDS = {
    "shrimp_rice": {
        "shrimp_phase": {"min_salinity": 5, "max_salinity": 35, "ideal_ph": [7.0, 9.0]},
        "rice_phase": {"critical_salinity": 2.0, "safe_sowing": 0.5, "red_alert": 3.0},
    },
    "rice_only": {
        "st24_25": {"limit": 2.0},
        "om_5451": {"limit": 3.0},
        "dai_thom_8": {"limit": 3.0},
    },
    "shrimp_only": {
        "su_chan_trang": {"salinity": [5, 35], "ph": [7, 9], "temp": [18, 33]},
        "cang_xanh": {"ph": [7, 8.5], "temp": [29, 31], "min_water": 60},
    },
}


class AnalysisRequest(BaseModel):
    farm_id: str
    analysis_type: str


class ForecastPointResponse(BaseModel):
    day_ahead: int
    date: str
    salinity_pred: float


class Forecast7DResponse(BaseModel):
    province: str
    as_of: str
    model_version: str
    model_set_used: str
    forecast: list[ForecastPointResponse]


_forecast_service: Optional[ForecastService] = None
_forecast_service_metadata_mtime: Optional[float] = None
_ai2_bundle: Optional[dict] = None
_ai2_bundle_mtime: Optional[tuple[float, float, float]] = None
FARM_CODE_PROVINCE = {
    "ST": "Soc Trang",
    "BL": "Bac Lieu",
    "KG": "Kien Giang",
    "BT": "Ben Tre",
    "CM": "Ca Mau",
}
AI2_METADATA_PATH = MODELS_DIR / "ai2_risk_metadata.json"
AI2_MAIN_PATH = MODELS_DIR / "ai2_risk_xgboost.pkl"
AI2_BASELINE_PATH = MODELS_DIR / "ai2_risk_baseline.pkl"


def _read_csv_report(file_name: str):
    report_path = REPORTS_DIR / file_name
    if not report_path.exists():
        return []
    with report_path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return list(reader)


def _read_model_metadata() -> dict:
    if not DEFAULT_METADATA_PATH.exists():
        raise HTTPException(status_code=404, detail="Model metadata not found. Train AI1 first.")
    return json.loads(DEFAULT_METADATA_PATH.read_text(encoding="utf-8"))


def _get_metadata_mtime() -> Optional[float]:
    if not DEFAULT_METADATA_PATH.exists():
        return None
    return DEFAULT_METADATA_PATH.stat().st_mtime


def get_forecast_service() -> ForecastService:
    global _forecast_service, _forecast_service_metadata_mtime
    metadata_mtime = _get_metadata_mtime()
    if _forecast_service is None or _forecast_service_metadata_mtime != metadata_mtime:
        _forecast_service = ForecastService()
        _forecast_service_metadata_mtime = metadata_mtime
    return _forecast_service


def _get_ai2_model_bundle() -> dict:
    global _ai2_bundle, _ai2_bundle_mtime

    if not AI2_METADATA_PATH.exists() or not AI2_MAIN_PATH.exists():
        raise HTTPException(status_code=404, detail="AI2 model artifacts not found. Train AI2 first.")

    baseline_mtime = AI2_BASELINE_PATH.stat().st_mtime if AI2_BASELINE_PATH.exists() else 0.0
    current_mtime = (
        AI2_METADATA_PATH.stat().st_mtime,
        AI2_MAIN_PATH.stat().st_mtime,
        baseline_mtime,
    )
    if _ai2_bundle is not None and _ai2_bundle_mtime == current_mtime:
        return _ai2_bundle

    metadata = json.loads(AI2_METADATA_PATH.read_text(encoding="utf-8"))
    main_model = joblib.load(AI2_MAIN_PATH)
    baseline_model = joblib.load(AI2_BASELINE_PATH) if AI2_BASELINE_PATH.exists() else None

    _ai2_bundle = {
        "metadata": metadata,
        "main_model": main_model,
        "baseline_model": baseline_model,
    }
    _ai2_bundle_mtime = current_mtime
    return _ai2_bundle


def _build_ai2_feature_row(
    readings_df: pd.DataFrame,
    feature_columns: list[str],
    province: Optional[str],
) -> tuple[pd.DataFrame, dict]:
    if readings_df.empty:
        raise HTTPException(status_code=422, detail="No sensor readings for this farm.")

    readings_df = readings_df.copy()
    readings_df["timestamp"] = pd.to_datetime(readings_df["timestamp"], errors="coerce")
    readings_df["salinity"] = pd.to_numeric(readings_df["salinity"], errors="coerce")
    readings_df["temperature"] = pd.to_numeric(readings_df["temperature"], errors="coerce")
    readings_df["ph"] = pd.to_numeric(readings_df["ph"], errors="coerce")
    readings_df = readings_df.dropna(subset=["timestamp", "salinity", "temperature"])
    if readings_df.empty:
        raise HTTPException(status_code=422, detail="Sensor readings invalid for AI2 inference.")

    readings_df = readings_df.sort_values("timestamp")
    latest = readings_df.iloc[-1]

    sal = readings_df["salinity"].to_numpy(dtype=float)
    temp = readings_df["temperature"].to_numpy(dtype=float)
    ph_series = readings_df["ph"].dropna()

    sal_t_1 = float(sal[-2]) if len(sal) >= 2 else float(sal[-1])
    sal_t_3 = float(sal[-4]) if len(sal) >= 4 else sal_t_1
    sal_t_7 = float(sal[-8]) if len(sal) >= 8 else sal_t_3
    sal_3d_avg = float(np.mean(sal[-3:]))
    sal_7d_avg = float(np.mean(sal[-7:]))
    temp_7d_avg = float(np.mean(temp[-7:]))
    sal_change_1d = float(sal[-1] - sal_t_1)
    sal_change_3d = float(sal[-1] - sal_t_3)
    ts = latest["timestamp"]
    month = int(ts.month)
    day_of_year = int(ts.dayofyear)
    is_dry = 1 if month in (12, 1, 2, 3, 4) else 0

    ph_value = float(ph_series.iloc[-1]) if not ph_series.empty else 7.4
    base_values = {
        "salinity": float(sal[-1]),
        "temperature": float(temp[-1]),
        "ph": ph_value,
        "sal_t-1": sal_t_1,
        "sal_t-3": sal_t_3,
        "sal_t-7": sal_t_7,
        "sal_3d_avg": sal_3d_avg,
        "sal_7d_avg": sal_7d_avg,
        "temp_7d_avg": temp_7d_avg,
        "sal_change_1d": sal_change_1d,
        "sal_change_3d": sal_change_3d,
        "month": float(month),
        "day_of_year": float(day_of_year),
        "is_dry_season": float(is_dry),
    }

    row = {feature: 0.0 for feature in feature_columns}
    for key, value in base_values.items():
        if key in row:
            row[key] = float(value)

    province_key = (province or "").strip().lower()
    if province_key:
        dummy_col = f"province_{province_key}"
        if dummy_col in row:
            row[dummy_col] = 1.0

    diagnostics = {
        "latest_timestamp": str(ts),
        "latest_salinity": float(sal[-1]),
        "latest_temperature": float(temp[-1]),
        "latest_ph": ph_value,
        "history_points": int(len(readings_df)),
        "province": province or "",
    }
    return pd.DataFrame([row], columns=feature_columns), diagnostics


def _infer_province_from_farm(farm: dict) -> Optional[str]:
    province = parse_province_from_address(farm.get("address", ""))
    if province:
        return province
    farm_code = str(farm.get("farm_code", "")).upper()
    prefix = farm_code.split("_")[0]
    return FARM_CODE_PROVINCE.get(prefix)


def _load_farm_readings_df(client: Client, farm_id: str) -> pd.DataFrame:
    devices_res = client.table("iot_devices").select("id").eq("farm_id", farm_id).execute()
    device_rows = devices_res.data or []
    device_ids = [str(item["id"]) for item in device_rows if item.get("id")]
    if not device_ids:
        raise HTTPException(status_code=422, detail="No IoT devices attached to this farm.")

    readings_res = (
        client.table("sensor_readings")
        .select("device_id,salinity,ph,temperature,timestamp")
        .in_("device_id", device_ids)
        .order("timestamp", desc=False)
        .limit(2000)
        .execute()
    )
    readings_df = pd.DataFrame(readings_res.data or [])
    if readings_df.empty:
        raise HTTPException(status_code=422, detail="No sensor readings available for this farm.")
    return readings_df


def _predict_ai2_for_farm(client: Client, farm_id: str, farm: dict) -> dict:
    bundle = _get_ai2_model_bundle()
    metadata = bundle["metadata"]
    feature_columns = metadata.get("feature_columns", [])
    labels = metadata.get("labels", ["Low", "Medium", "High"])
    if not feature_columns:
        raise HTTPException(status_code=500, detail="AI2 metadata missing feature_columns.")

    province = _infer_province_from_farm(farm)
    readings_df = _load_farm_readings_df(client, farm_id)
    feature_row, diagnostics = _build_ai2_feature_row(readings_df, feature_columns, province)

    model = bundle["main_model"]
    y_pred = model.predict(feature_row)
    predicted_idx = int(y_pred[0]) if hasattr(y_pred[0], "__int__") else int(float(y_pred[0]))
    predicted_label = labels[predicted_idx] if 0 <= predicted_idx < len(labels) else str(predicted_idx)

    risk_score = None
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(feature_row)
        risk_score = float(np.max(probs[0])) if len(probs) > 0 else None

    return {
        "farm_id": farm_id,
        "risk_label": predicted_label,
        "risk_score": risk_score,
        "model_version": metadata.get("model_version", "unknown"),
        "labels": labels,
        "diagnostics": diagnostics,
    }


def _build_ai3_decision(
    crop_mode: str,
    stage: str,
    forecast_points: list[ForecastPointResponse],
    risk_label: str,
    risk_score: Optional[float],
    current_date: datetime,
) -> dict:
    sal_values = [float(point.salinity_pred) for point in forecast_points]
    max_salinity = max(sal_values) if sal_values else 0.0
    min_salinity = min(sal_values) if sal_values else 0.0
    days_over_4 = sum(1 for value in sal_values if value > 4.0)
    days_under_1 = sum(1 for value in sal_values if value < 1.0)
    days_under_5 = sum(1 for value in sal_values if value < 5.0)
    current_month = current_date.month

    decision = "Tiếp tục vụ lúa" if crop_mode == "rice" else "Tiếp tục vụ tôm"
    urgency = "normal"
    reason = "Điều kiện hiện tại ổn định."
    actions: list[str] = ["Tiếp tục theo dõi cảm biến mỗi 2-4 giờ."]

    if crop_mode == "rice":
        if stage == "late" and days_over_4 >= 3:
            decision = "Thu hoạch khẩn cấp"
            urgency = "critical"
            reason = "Có từ 3/7 ngày dự báo độ mặn > 4‰ trong giai đoạn lúa cuối vụ."
            actions = [
                "Dừng cấp nước mặn vào ruộng ngay lập tức.",
                "Đóng cống ngăn mặn và ưu tiên xả/rửa mặn sớm.",
                "Thu hoạch sớm khu vực lúa đã chín để giảm thất thoát.",
                "Chuẩn bị phương án chuyển sang vụ tôm nếu độ mặn duy trì cao.",
            ]
        elif max_salinity < 1.0 and risk_label in {"Low", "Medium"}:
            decision = "Tiếp tục vụ lúa"
            urgency = "normal"
            reason = "Mức mặn dự báo thấp (<1‰) và rủi ro hiện tại không cao."
            actions = [
                "Duy trì lịch lấy nước ngọt và giữ mực nước mặt ruộng ổn định.",
                "Theo dõi pH và bổ sung hữu cơ/vi sinh nếu cần.",
                "Kiểm tra độ mặn đầu vào trước mỗi đợt bơm nước.",
            ]
        elif 1.0 <= max_salinity <= 4.0 and current_month in {12, 1, 2}:
            decision = "Chuẩn bị chuyển vụ tôm"
            urgency = "warning"
            reason = "Độ mặn dự báo 1-4‰ trong mùa khô, phù hợp chuẩn bị chuyển vụ tôm-lúa."
            actions = [
                "Lập kế hoạch rửa mặn theo từng ô ruộng để tránh sốc cây.",
                "Gia cố bờ bao, cống ngăn để chủ động khi mặn tăng nhanh.",
                "Chuẩn bị vật tư và lịch thả giống tôm cho giai đoạn tiếp theo.",
            ]
        elif risk_label == "High":
            decision = "Thu hoạch khẩn cấp"
            urgency = "critical"
            reason = "AI2 đánh giá rủi ro hiện tại ở mức High."
            actions = [
                "Kích hoạt quy trình ứng phó khẩn cấp theo farm.",
                "Tạm dừng cấp nước mới cho đến khi kiểm soát được độ mặn.",
                "Ưu tiên bảo vệ khu lúa đang cầm mặn và thu hoạch sớm nếu cần.",
            ]
    else:
        if risk_label == "High" and (risk_score or 0.0) >= 0.75:
            decision = "Điều tiết nước khẩn cấp"
            urgency = "critical"
            reason = "AI2 cho thấy rủi ro cao với độ tin cậy lớn."
            actions = [
                "Kiểm tra ngay cống cấp/thoát nước và thông số ao.",
                "Điều tiết nước để đưa độ mặn về vùng 10-20‰ nếu có thể.",
                "Tăng cường oxy hóa và giảm mật độ cho ăn tạm thời.",
            ]
        elif days_under_5 >= 3 or min_salinity < 3:
            decision = "Chuẩn bị chuyển vụ lúa"
            urgency = "warning"
            reason = "Nhiều ngày độ mặn dự báo thấp (<5‰), cần cân nhắc chuyển vụ lúa."
            actions = [
                "Đánh giá khả năng rửa mặn và cải tạo đất cho vụ lúa.",
                "Lên lịch giảm mật độ tôm, thu gọn vụ tôm hiện tại.",
                "Theo dõi dự báo AI1 hằng ngày để chốt thời điểm chuyển vụ.",
            ]
        else:
            decision = "Tiếp tục vụ tôm"
            urgency = "normal"
            reason = "Dự báo và rủi ro hiện tại nằm trong vùng có thể vận hành cho vụ tôm."
            actions = [
                "Duy trì độ mặn trong dải tối ưu theo giống tôm đang nuôi.",
                "Theo dõi pH, nhiệt độ và bổ sung khoáng định kỳ.",
                "Kiểm tra xác tôm, lượng ăn để điều chỉnh cho ăn.",
            ]

    return {
        "decision": decision,
        "urgency": urgency,
        "reason": reason,
        "actions": actions,
        "signals": {
            "crop_mode": crop_mode,
            "stage": stage,
            "max_salinity_7d": round(max_salinity, 3),
            "min_salinity_7d": round(min_salinity, 3),
            "days_over_4ppt_7d": int(days_over_4),
            "days_under_5ppt_7d": int(days_under_5),
            "risk_label": risk_label,
            "risk_score": risk_score,
        },
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service"}


@app.get("/api/ai/reports/charts")
def list_report_charts(request: Request):
    charts = sorted(path.name for path in CHARTS_DIR.glob("*.png"))
    base_url = str(request.base_url).rstrip("/")
    return {
        "success": True,
        "data": [
            {"name": name, "url": f"{base_url}/api/ai/reports/static/charts/{name}"}
            for name in charts
        ],
    }


@app.get("/api/ai/reports/metrics")
def get_report_metrics():
    return {"success": True, "data": _read_csv_report("metrics_summary.csv")}


@app.get("/api/ai/reports/backtest-metrics")
def get_backtest_metrics():
    return {"success": True, "data": _read_csv_report("backtest_metrics_summary.csv")}


@app.get("/api/ai/reports/lstm-metrics")
def get_lstm_metrics():
    return {"success": True, "data": _read_csv_report("lstm_pilot_metrics.csv")}


@app.get("/api/ai/reports/regression-check")
def get_regression_check():
    return {"success": True, "data": _read_csv_report("regression_check.csv")}


@app.get("/api/ai/model/metadata")
def get_model_metadata():
    return {"success": True, "data": _read_model_metadata()}


@app.post("/api/ai/model/reload")
def reload_model_cache():
    global _forecast_service, _forecast_service_metadata_mtime
    _forecast_service = None
    _forecast_service_metadata_mtime = None
    service = get_forecast_service()
    return {
        "success": True,
        "message": "Forecast model cache reloaded.",
        "model_version": service.metadata.get("model_version", "unknown"),
    }


@app.get("/api/ai/forecast7d", response_model=Forecast7DResponse)
def forecast_7d(
    province: str = Query(..., description="Province name"),
    as_of: Optional[str] = Query(None, description="Optional date YYYY-MM-DD"),
    model_set: str = Query("champion", description="champion|baseline|xgboost"),
):
    try:
        result: ForecastResult = get_forecast_service().forecast(
            province=province,
            as_of=as_of,
            model_set=model_set,
        )
        return Forecast7DResponse(
            province=result.province,
            as_of=result.as_of,
            model_version=result.model_version,
            model_set_used=result.model_set_used,
            forecast=[ForecastPointResponse(**point.__dict__) for point in result.forecast],
        )
    except ForecastError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/ai/forecast7d/farm/{farm_id}", response_model=Forecast7DResponse)
def forecast_7d_by_farm(
    farm_id: str,
    as_of: Optional[str] = Query(None, description="Optional date YYYY-MM-DD"),
    model_set: str = Query("champion", description="champion|baseline|xgboost"),
):
    client = _require_supabase()
    try:
        farm_res = client.table("farms").select("address,farm_code").eq("id", farm_id).single().execute()
        farm = farm_res.data
        if not farm:
            raise HTTPException(status_code=404, detail="Farm not found.")

        province = parse_province_from_address(farm.get("address", ""))
        if not province:
            farm_code = str(farm.get("farm_code", "")).upper()
            prefix = farm_code.split("_")[0]
            province = FARM_CODE_PROVINCE.get(prefix)
        if not province:
            raise HTTPException(status_code=422, detail="Cannot infer province from farm.")

        result: ForecastResult = get_forecast_service().forecast(
            province=province,
            as_of=as_of,
            model_set=model_set,
        )
        return Forecast7DResponse(
            province=result.province,
            as_of=result.as_of,
            model_version=result.model_version,
            model_set_used=result.model_set_used,
            forecast=[ForecastPointResponse(**point.__dict__) for point in result.forecast],
        )
    except HTTPException:
        raise
    except ForecastError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/ai/risk/farm/{farm_id}")
def predict_ai2_risk_by_farm(farm_id: str):
    client = _require_supabase()
    try:
        farm_res = client.table("farms").select("id,address,farm_code").eq("id", farm_id).single().execute()
        farm = farm_res.data
        if not farm:
            raise HTTPException(status_code=404, detail="Farm not found.")

        return {
            "success": True,
            "data": _predict_ai2_for_farm(client, farm_id, farm),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/ai/decision/farm/{farm_id}")
def get_ai3_decision_by_farm(
    farm_id: str,
    current_date: Optional[str] = Query(None, description="Optional date YYYY-MM-DD"),
):
    client = _require_supabase()
    try:
        farm_res = client.table("farms").select("id,farm_type,address,farm_code").eq("id", farm_id).single().execute()
        farm = farm_res.data
        if not farm:
            raise HTTPException(status_code=404, detail="Farm not found.")

        province = _infer_province_from_farm(farm)
        if not province:
            raise HTTPException(status_code=422, detail="Cannot infer province from farm.")

        try:
            dt_now = datetime.strptime(current_date, "%Y-%m-%d") if current_date else datetime.now()
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="current_date must be YYYY-MM-DD.") from exc

        season_res = (
            client.table("seasons")
            .select("season_type,start_date,variety,status")
            .eq("farm_id", farm_id)
            .eq("status", "active")
            .maybe_single()
            .execute()
        )
        season = season_res.data or {}
        crop_mode = season.get("season_type")
        if crop_mode not in {"rice", "shrimp"}:
            crop_mode = "shrimp" if farm.get("farm_type") == "shrimp_only" else "rice"

        start_date_raw = season.get("start_date")
        if start_date_raw:
            start_date = datetime.fromisoformat(str(start_date_raw).split("T")[0])
        else:
            start_date = dt_now - timedelta(days=45)
        season_age_days = max(0, (dt_now.date() - start_date.date()).days)
        if season_age_days <= 30:
            stage = "early"
        elif season_age_days <= 70:
            stage = "mid"
        else:
            stage = "late"

        forecast_result = get_forecast_service().forecast(
            province=province,
            as_of=dt_now.strftime("%Y-%m-%d"),
            model_set="champion",
        )
        forecast_points = [ForecastPointResponse(**point.__dict__) for point in forecast_result.forecast]

        ai2 = _predict_ai2_for_farm(client, farm_id, farm)
        decision = _build_ai3_decision(
            crop_mode=crop_mode,
            stage=stage,
            forecast_points=forecast_points,
            risk_label=str(ai2.get("risk_label", "Medium")),
            risk_score=ai2.get("risk_score"),
            current_date=dt_now,
        )

        return {
            "success": True,
            "data": {
                "farm_id": farm_id,
                "province": province,
                "crop_mode": crop_mode,
                "season_stage": stage,
                "season_age_days": season_age_days,
                "decision": decision["decision"],
                "urgency": decision["urgency"],
                "reason": decision["reason"],
                "actions": decision["actions"],
                "signals": decision["signals"],
                "ai1": {
                    "as_of": forecast_result.as_of,
                    "model_version": forecast_result.model_version,
                    "model_set_used": forecast_result.model_set_used,
                },
                "ai2": {
                    "risk_label": ai2.get("risk_label"),
                    "risk_score": ai2.get("risk_score"),
                    "model_version": ai2.get("model_version"),
                },
            },
        }
    except HTTPException:
        raise
    except ForecastError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/ai/analyze")
async def analyze_farm(request: AnalysisRequest):
    if not request.farm_id or not request.analysis_type:
        raise HTTPException(status_code=400, detail="farm_id and analysis_type are required.")
    # Queue background flow and return immediately to keep UI responsive.
    asyncio.create_task(queue_analysis(request.farm_id, request.analysis_type))
    return {"success": True, "message": "AI Analysis queued"}


async def queue_analysis(farm_id: str, analysis_type: str) -> None:
    if supabase is None:
        print("[AI] Supabase unavailable, skip storing analysis request.")
        return
    try:
        farm_res = supabase.table("farms").select("user_id").eq("id", farm_id).single().execute()
        user_id = farm_res.data["user_id"]
        supabase.table("analysis_requests").insert(
            {
                "user_id": user_id,
                "farm_id": farm_id,
                "analysis_type": analysis_type,
                "status": "pending",
            }
        ).execute()
    except Exception as exc:
        print(f"[AI] Failed to store analysis request: {exc}")
        return

    try:
        await process_analysis(farm_id, analysis_type)
    except Exception as exc:
        print(f"[AI] Failed to process analysis: {exc}")


@app.get("/api/ai/recommendations/{farm_id}")
async def get_recommendations(farm_id: str):
    client = _require_supabase()
    try:
        response = (
            client.table("season_recommendations")
            .select("*")
            .eq("farm_id", farm_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return {"success": True, "data": None}
        return {"success": True, "data": response.data[0]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/ai/analysis-requests/{farm_id}")
async def get_analysis_history(farm_id: str):
    client = _require_supabase()
    try:
        response = (
            client.table("analysis_requests")
            .select("*")
            .eq("farm_id", farm_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        return {"success": True, "data": response.data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/ai/chat")
async def chat_with_image(message: str = Form(...), image: UploadFile = File(None)):
    if not GEMINI_API_KEY or gemini_model is None:
        return {"success": False, "message": "Gemini API Key is not configured"}
    try:
        content = [SYSTEM_PROMPT, message]
        if image:
            image_data = await image.read()
            img = Image.open(io.BytesIO(image_data))
            content.append(img)
        response = gemini_model.generate_content(content)
        return {
            "success": True,
            "reply": response.text,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def process_analysis(farm_id: str, analysis_type: str):
    client = _require_supabase()
    try:
        farm_res = client.table("farms").select("*").eq("id", farm_id).single().execute()
        farm = farm_res.data
        if not farm:
            return

        device_res = client.table("iot_devices").select("id").eq("farm_id", farm_id).limit(1).execute()
        if not device_res.data:
            return
        device_id = device_res.data[0]["id"]

        sensor_res = (
            client.table("sensor_readings")
            .select("salinity, ph, temperature, timestamp")
            .eq("device_id", device_id)
            .order("timestamp", desc=True)
            .limit(48)
            .execute()
        )
        readings = sensor_res.data
        if not readings:
            return

        current = readings[0]
        avg_salinity = float(np.mean([row["salinity"] for row in readings]))
        recommendation = ""
        explanation = ""

        if farm["farm_type"] == "shrimp_rice":
            thresholds = BIOLOGICAL_THRESHOLDS["shrimp_rice"]
            month = datetime.now().month
            is_dry_season = month in [1, 2, 3, 4, 5, 6]
            if is_dry_season:
                if current["salinity"] < thresholds["shrimp_phase"]["min_salinity"]:
                    recommendation = "Cảnh báo độ mặn thấp cho tôm"
                    explanation = (
                        f"Độ mặn hiện tại {current['salinity']}‰ thấp hơn ngưỡng 5‰. "
                        "Cần theo dõi nguồn nước và bổ sung khoáng."
                    )
                else:
                    recommendation = "Môi trường nuôi tôm an toàn"
                    explanation = f"Độ mặn {current['salinity']}‰ nằm trong ngưỡng tối ưu."
            else:
                if current["salinity"] > thresholds["rice_phase"]["critical_salinity"]:
                    recommendation = "CẢNH BÁO XÂM NHẬP MẶN"
                    explanation = (
                        f"Độ mặn {current['salinity']}‰ vượt ngưỡng an toàn cho lúa (2‰). "
                        "Cần đóng cống ngăn mặn."
                    )
                elif 0.5 < current["salinity"] <= 1.0:
                    recommendation = "Đang trong giai đoạn rửa mặn"
                    explanation = "Độ mặn đang giảm dần, đợi dưới 0.5‰ để gieo sạ."
                else:
                    recommendation = "Vùng nuôi an toàn cho lúa"
                    explanation = "Các chỉ số môi trường đang ở mức phù hợp."

        client.table("season_recommendations").insert(
            {
                "farm_id": farm_id,
                "current_salinity_avg": avg_salinity,
                "salinity_trend": "stable",
                "recommended_action": recommendation,
                "explanation": explanation,
                "status": "suggested",
            }
        ).execute()
    except Exception as exc:
        print(f"AI Error: {exc}")


if __name__ == "__main__":
    import uvicorn

    reload_enabled = os.environ.get("AI_RELOAD", "0").strip() == "1"
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=reload_enabled, app_dir="app")
