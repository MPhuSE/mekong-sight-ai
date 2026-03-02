from __future__ import annotations

import asyncio
import csv
import io
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import google.generativeai as genai
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel
from supabase import Client, create_client

from app.ml_pipeline.config import DEFAULT_METADATA_PATH
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
if GEMINI_API_KEY:
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
FARM_CODE_PROVINCE = {
    "ST": "Soc Trang",
    "BL": "Bac Lieu",
    "KG": "Kien Giang",
    "BT": "Ben Tre",
    "CM": "Ca Mau",
}


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

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, app_dir="app")
