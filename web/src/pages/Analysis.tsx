import React, { useEffect, useMemo, useState } from 'react';
import { aiService } from '../services/ai.service';
import { farmService } from '../services/farm.service';
import { iotService } from '../services/iot.service';
import {
    AlertCircle,
    Brain,
    CheckCircle2,
    History,
    Loader2,
    Send,
    Sparkles,
    Waves,
} from 'lucide-react';

type ForecastPoint = {
    day_ahead: number;
    date: string;
    salinity_pred: number;
};

type ForecastResponse = {
    province: string;
    as_of: string;
    model_version: string;
    model_set_used?: string;
    forecast: ForecastPoint[];
};

type RiskResponse = {
    farm_id: string;
    risk_label: string;
    risk_score?: number | null;
    model_version: string;
    labels?: string[];
    diagnostics?: Record<string, any>;
};

type DecisionResponse = {
    farm_id: string;
    province: string;
    crop_mode: 'rice' | 'shrimp' | string;
    season_stage: 'early' | 'mid' | 'late' | string;
    season_age_days: number;
    decision: string;
    urgency: 'normal' | 'warning' | 'critical' | string;
    reason: string;
    actions: string[];
    signals?: Record<string, any>;
    ai1?: Record<string, any>;
    ai2?: Record<string, any>;
};

type ReportChart = {
    name: string;
    url: string;
};

type ReportMetric = {
    horizon: string;
    model: string;
    mae: string;
    rmse: string;
};

type SensorReading = {
    id: string;
    device_id: string;
    salinity: number;
    temperature: number;
    ph: number;
    timestamp: string;
    iot_devices?: {
        device_name?: string;
        farm_id?: string;
    };
};

const PROVINCE_MAP: Record<string, string> = {
    'soc trang': 'Soc Trang',
    'bac lieu': 'Bac Lieu',
    'kien giang': 'Kien Giang',
    'ben tre': 'Ben Tre',
    'ca mau': 'Ca Mau',
    'tra vinh': 'Tra Vinh',
    'vinh long': 'Vinh Long',
    'can tho': 'Can Tho',
};

const FARM_CODE_MAP: Record<string, string> = {
    ST: 'Soc Trang',
    BL: 'Bac Lieu',
    KG: 'Kien Giang',
    BT: 'Ben Tre',
    CM: 'Ca Mau',
};

const normalize = (value?: string): string => {
    if (!value) return '';
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const inferProvinceFromFarm = (farm: any): string | null => {
    const address = String(farm?.address || '').trim();
    if (address) {
        const parts = address.split(',').map((item: string) => item.trim()).filter(Boolean).reverse();
        for (const part of parts) {
            const normalized = normalize(part);
            if (normalized in PROVINCE_MAP) {
                return PROVINCE_MAP[normalized];
            }
            for (const key of Object.keys(PROVINCE_MAP)) {
                if (normalized.includes(key)) {
                    return PROVINCE_MAP[key];
                }
            }
        }
    }

    const farmCode = String(farm?.farm_code || '').toUpperCase();
    const prefix = farmCode.split('_')[0];
    if (prefix in FARM_CODE_MAP) {
        return FARM_CODE_MAP[prefix];
    }

    return null;
};

const buildHeuristicForecast = (readings: any[]): ForecastPoint[] => {
    const sorted = [...readings]
        .filter((item) => item?.salinity !== undefined && item?.timestamp)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (sorted.length === 0) {
        return [];
    }

    const salinitySeries = sorted.map((item) => Number(item.salinity)).filter((value) => Number.isFinite(value));
    if (salinitySeries.length === 0) {
        return [];
    }

    const latest = salinitySeries[salinitySeries.length - 1];
    const window = salinitySeries.slice(-7);
    const baseline = window.reduce((sum, value) => sum + value, 0) / window.length;
    const trend = window.length > 1 ? (window[window.length - 1] - window[0]) / (window.length - 1) : 0;

    const today = new Date();
    const forecast: ForecastPoint[] = [];
    for (let day = 1; day <= 7; day += 1) {
        const projected = baseline + trend * day * 0.6 + (latest - baseline) * 0.4;
        const date = new Date(today.getTime() + day * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        forecast.push({
            day_ahead: day,
            date,
            salinity_pred: Number(Math.max(0, projected).toFixed(4)),
        });
    }
    return forecast;
};

const getApiErrorDetail = (error: any): string => {
    return (
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Khong the lay du bao tu AI service.'
    );
};

const shouldUseIotFallback = (error: any): boolean => {
    const status = Number(error?.response?.status || 0);
    // Network error (no status) or 5xx => allow heuristic fallback.
    return status === 0 || status >= 500;
};

const buildHeuristicRisk = (farmId: string, readings: any[]): RiskResponse | null => {
    const sorted = [...readings]
        .filter((item) => item?.salinity !== undefined && item?.temperature !== undefined && item?.timestamp)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (sorted.length === 0) return null;

    const latest = sorted[sorted.length - 1];
    const salinity = Number(latest.salinity);
    const temperature = Number(latest.temperature);
    const ph = Number(latest.ph);
    if (!Number.isFinite(salinity) || !Number.isFinite(temperature)) return null;

    const s = Math.max(0, Math.min(1, salinity / 10)); // align with AI2 salinity scaling
    const t = Math.max(0, Math.min(1, (temperature - 15) / 20)); // 15..35C
    const phPenalty = Number.isFinite(ph) ? Math.max(0, Math.min(1, Math.abs(ph - 7.4) / 2.0)) : 0.2;

    const risk01 = Math.max(0, Math.min(1, 0.65 * s + 0.25 * t + 0.10 * phPenalty));
    const riskLabel = risk01 <= 0.35 ? 'Low' : risk01 <= 0.65 ? 'Medium' : 'High';

    return {
        farm_id: farmId,
        risk_label: riskLabel,
        risk_score: risk01,
        model_version: 'heuristic-fallback',
        labels: ['Low', 'Medium', 'High'],
        diagnostics: {
            latest_timestamp: latest.timestamp,
            latest_salinity: salinity,
            latest_temperature: temperature,
            latest_ph: Number.isFinite(ph) ? ph : null,
            history_points: sorted.length,
        },
    };
};

const getRiskPalette = (riskLabel?: string) => {
    if (riskLabel === 'High') {
        return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' };
    }
    if (riskLabel === 'Medium') {
        return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' };
    }
    return { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' };
};

const getSalinityPalette = (value: number) => {
    if (value >= 6) return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    if (value >= 4) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
    return { color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
};

const getUrgencyPalette = (urgency?: string) => {
    if (urgency === 'critical') return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    if (urgency === 'warning') return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
    return { color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
};

const viDecisionFromLegacy = (raw?: string): string => {
    const key = normalize(raw || '');
    if (!key) return 'Tiếp tục theo dõi và vận hành ổn định';
    if (key.includes('emergency') || key.includes('harvest')) return 'Thu hoạch khẩn cấp';
    if (key.includes('continue') && key.includes('rice')) return 'Tiếp tục vụ lúa';
    if (key.includes('continue') && key.includes('shrimp')) return 'Tiếp tục vụ tôm';
    if (key.includes('prepare') && key.includes('shrimp')) return 'Chuẩn bị chuyển vụ tôm';
    if (key.includes('prepare') && key.includes('rice')) return 'Chuẩn bị chuyển vụ lúa';
    if (key.includes('water') && key.includes('urgent')) return 'Điều tiết nước khẩn cấp';
    return raw || 'Tiếp tục theo dõi và vận hành ổn định';
};

const viReasonFromLegacy = (raw?: string): string => {
    const key = normalize(raw || '');
    if (!key) return 'Khuyến nghị được tổng hợp từ dữ liệu hiện có.';
    if (key.includes('high') && key.includes('risk')) {
        return 'Rủi ro hiện tại ở mức cao, cần ưu tiên phương án an toàn.';
    }
    if (key.includes('stable') || key.includes('normal')) {
        return 'Điều kiện hiện tại tương đối ổn định.';
    }
    return raw || 'Khuyến nghị được tổng hợp từ dữ liệu hiện có.';
};

export const Analysis: React.FC = () => {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [farms, setFarms] = useState<any[]>([]);
    const [selectedFarm, setSelectedFarm] = useState('');
    const [analysisType, setAnalysisType] = useState('salinity_forecast');

    const [forecast, setForecast] = useState<ForecastResponse | null>(null);
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastError, setForecastError] = useState('');
    const [forecastNotice, setForecastNotice] = useState('');
    const [risk, setRisk] = useState<RiskResponse | null>(null);
    const [riskLoading, setRiskLoading] = useState(false);
    const [riskError, setRiskError] = useState('');
    const [riskNotice, setRiskNotice] = useState('');
    const [decision, setDecision] = useState<DecisionResponse | null>(null);
    const [decisionLoading, setDecisionLoading] = useState(false);
    const [decisionError, setDecisionError] = useState('');
    const [selectedProvince, setSelectedProvince] = useState('');
    const [reportCharts, setReportCharts] = useState<ReportChart[]>([]);
    const [reportMetrics, setReportMetrics] = useState<ReportMetric[]>([]);
    const [reportsLoading, setReportsLoading] = useState(true);
    const [aiSupportedProvinces, setAiSupportedProvinces] = useState<string[]>([]);
    const [manualProvince, setManualProvince] = useState('');
    const [sensorHistory, setSensorHistory] = useState<SensorReading[]>([]);
    const [sensorHistoryLoading, setSensorHistoryLoading] = useState(false);
    const [sensorHistoryError, setSensorHistoryError] = useState('');

    const farmOptions = useMemo(() => farms || [], [farms]);
    const selectedFarmInfo = useMemo(
        () => farmOptions.find((farm) => farm.id === selectedFarm),
        [farmOptions, selectedFarm],
    );

    const historyDaily = useMemo(() => {
        const dayKeys = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
            return date.toISOString().slice(0, 10);
        });
        const grouped = new Map<string, { salinitySum: number; tempSum: number; phSum: number; count: number }>();
        for (const key of dayKeys) {
            grouped.set(key, { salinitySum: 0, tempSum: 0, phSum: 0, count: 0 });
        }
        for (const row of sensorHistory || []) {
            const key = String(row.timestamp || '').slice(0, 10);
            if (!grouped.has(key)) continue;
            const bucket = grouped.get(key)!;
            const salinity = Number(row.salinity);
            const temperature = Number(row.temperature);
            const ph = Number(row.ph);
            if (Number.isFinite(salinity)) bucket.salinitySum += salinity;
            if (Number.isFinite(temperature)) bucket.tempSum += temperature;
            if (Number.isFinite(ph)) bucket.phSum += ph;
            bucket.count += 1;
        }

        return dayKeys.map((day) => {
            const bucket = grouped.get(day)!;
            const count = bucket.count || 0;
            return {
                day,
                label: day.slice(5),
                count,
                salinityAvg: count > 0 ? bucket.salinitySum / count : 0,
                temperatureAvg: count > 0 ? bucket.tempSum / count : 0,
                phAvg: count > 0 ? bucket.phSum / count : 0,
            };
        });
    }, [sensorHistory]);

    const fetchHistory = async (farmId: string) => {
        if (!farmId) {
            setRequests([]);
            return;
        }
        try {
            const historyData = await aiService.getAnalysisHistory(farmId);
            setRequests(historyData.data || []);
        } catch (error) {
            console.error(error);
            setRequests([]);
        }
    };

    const fetchSensorHistoryForFarm = async (farmId: string) => {
        if (!farmId) {
            setSensorHistory([]);
            setSensorHistoryError('');
            return;
        }

        setSensorHistoryLoading(true);
        setSensorHistoryError('');
        try {
            const response = await iotService.getReadingsHistory(farmId, 7, 4000);
            setSensorHistory((response?.data || []) as SensorReading[]);
        } catch (error: any) {
            setSensorHistory([]);
            setSensorHistoryError(getApiErrorDetail(error));
        } finally {
            setSensorHistoryLoading(false);
        }
    };

    const fetchReportAssets = async () => {
        setReportsLoading(true);
        try {
            const [chartsResp, metricsResp] = await Promise.all([
                aiService.getReportCharts(),
                aiService.getReportMetrics(),
            ]);
            setReportCharts(chartsResp?.data || []);
            setReportMetrics(metricsResp?.data || []);
        } catch (error) {
            console.error(error);
            setReportCharts([]);
            setReportMetrics([]);
        } finally {
            setReportsLoading(false);
        }
    };

    const fetchAiMetadata = async () => {
        try {
            const metadataResp = await aiService.getModelMetadata();
            const provinces = (metadataResp?.data?.provinces || []).filter(Boolean);
            setAiSupportedProvinces(provinces);
            if (provinces.length > 0) {
                setManualProvince((prev) => prev || provinces[0]);
            }
        } catch (error) {
            // If AI service is down, keep empty and fall back to heuristic flow.
            setAiSupportedProvinces([]);
        }
    };

    const fetchForecastByProvince = async (province: string) => {
        if (!province) return;
        setForecastLoading(true);
        setForecastError('');
        setForecastNotice('');
        try {
            const data = await aiService.getForecast7d(province, undefined, 'champion');
            setForecast(data);
            setSelectedProvince(data.province || province);
        } catch (error: any) {
            setForecast(null);
            setSelectedProvince(province);
            setForecastError(getApiErrorDetail(error));
        } finally {
            setForecastLoading(false);
        }
    };

    const fetchForecastForFarm = async (farmId: string, sourceFarms: any[]) => {
        if (!farmId) {
            setForecast(null);
            setSelectedProvince('');
            return;
        }

        setForecastLoading(true);
        setForecastError('');
        setForecastNotice('');
        try {
            const farm = sourceFarms.find((item) => item.id === farmId);
            const province = inferProvinceFromFarm(farm);
            if (province) {
                setManualProvince(province);
            }
            let rootError: any = null;

            // Prefer province-based endpoint because it does not depend on ai-service Supabase setup.
            if (province && (aiSupportedProvinces.length === 0 || aiSupportedProvinces.includes(province))) {
                try {
                    const data = await aiService.getForecast7d(province, undefined, 'champion');
                    setForecast(data);
                    setSelectedProvince(data.province || province);
                    return;
                } catch (provinceError: any) {
                    rootError = provinceError;
                }
            } else if (province && aiSupportedProvinces.length > 0 && !aiSupportedProvinces.includes(province)) {
                rootError = {
                    response: { status: 404, data: { message: `AI model chua ho tro tinh: ${province}` } },
                };
            }

            // Fallback to farm endpoint in case province inference is wrong/missing.
            try {
                const farmData = await aiService.getForecast7dByFarm(farmId, undefined, 'champion');
                setForecast(farmData);
                setSelectedProvince(farmData.province || province || '');
                return;
            } catch (farmError: any) {
                rootError = rootError || farmError;
            }

            if (!shouldUseIotFallback(rootError)) {
                setForecast(null);
                setSelectedProvince(province || '');
                setForecastError(getApiErrorDetail(rootError));
                return;
            }

            const readingsResp = await iotService.getReadings();
            const farmReadings = (readingsResp?.data || []).filter(
                (item: any) => item?.iot_devices?.farm_id === farmId,
            );
            const heuristic = buildHeuristicForecast(farmReadings);
            if (heuristic.length > 0) {
                setForecast({
                    province: province || 'N/A',
                    as_of: new Date().toISOString().slice(0, 10),
                    model_version: 'heuristic-fallback',
                    model_set_used: 'heuristic',
                    forecast: heuristic,
                });
                setSelectedProvince(province || '');
                setForecastNotice(`Khong goi duoc AI model (${getApiErrorDetail(rootError)}). Dang hien thi fallback IoT.`);
                setForecastError('');
            } else {
                setForecast(null);
                setSelectedProvince(province || '');
                setForecastError(`Khong du du lieu IoT de tao du bao fallback. Loi AI: ${getApiErrorDetail(rootError)}`);
            }
        } catch (error: any) {
            setForecast(null);
            setForecastError(getApiErrorDetail(error));
        } finally {
            setForecastLoading(false);
        }
    };

    const fetchRiskForFarm = async (farmId: string) => {
        if (!farmId) {
            setRisk(null);
            setRiskError('');
            setRiskNotice('');
            return;
        }

        setRiskLoading(true);
        setRiskError('');
        setRiskNotice('');
        try {
            const response = await aiService.getRiskByFarm(farmId);
            setRisk(response?.data || null);
        } catch (error: any) {
            const status = Number(error?.response?.status || 0);
            const allowFallback = status === 404 || shouldUseIotFallback(error);
            if (allowFallback) {
                try {
                    const readingsResp = await iotService.getReadings();
                    const farmReadings = (readingsResp?.data || []).filter(
                        (item: any) => item?.iot_devices?.farm_id === farmId,
                    );
                    const fallbackRisk = buildHeuristicRisk(farmId, farmReadings);
                    if (fallbackRisk) {
                        setRisk(fallbackRisk);
                        // Silent fallback for local/offline mode to keep UX smooth.
                        setRiskNotice('');
                        setRiskError('');
                        return;
                    }
                } catch (fallbackErr) {
                    console.error(fallbackErr);
                }
            }
            setRisk(null);
            setRiskError(getApiErrorDetail(error));
        } finally {
            setRiskLoading(false);
        }
    };

    const fetchDecisionForFarm = async (farmId: string) => {
        if (!farmId) {
            setDecision(null);
            setDecisionError('');
            return;
        }
        setDecisionLoading(true);
        setDecisionError('');
        try {
            const response = await aiService.getDecisionByFarm(farmId);
            setDecision(response?.data || null);
        } catch (error: any) {
            const status = Number(error?.response?.status || 0);
            if (status === 404) {
                try {
                    const legacy = await aiService.getRecommendations(farmId);
                    const rec = legacy?.data;
                    if (rec) {
                        setDecision({
                            farm_id: farmId,
                            province: selectedProvince || '',
                            crop_mode: 'rice',
                            season_stage: 'mid',
                            season_age_days: 0,
                            decision: viDecisionFromLegacy(rec.recommended_action),
                            urgency: 'warning',
                            reason: viReasonFromLegacy(rec.explanation),
                            actions: [
                                'Theo dõi độ mặn mỗi 2-4 giờ.',
                                'Kiểm tra cống cấp/thoát nước trước khi điều chỉnh.',
                                'Cập nhật mùa vụ để hệ thống tính ngưỡng đúng.',
                            ],
                            signals: {},
                            ai1: {},
                            ai2: {},
                        });
                        setDecisionError('');
                        return;
                    }
                } catch (legacyError) {
                    console.error(legacyError);
                }
            }
            setDecision(null);
            setDecisionError(getApiErrorDetail(error));
        } finally {
            setDecisionLoading(false);
        }
    };

    const fetchData = async () => {
        try {
            const userStr = localStorage.getItem('user');
            const role = userStr ? JSON.parse(userStr).role : 'farmer';
            const farmData = role === 'admin' ? await farmService.getAllFarms() : await farmService.getMyFarms();
            const nextFarms = farmData.data || [];
            setFarms(nextFarms);

            if (nextFarms.length > 0) {
                const firstFarmId = nextFarms[0].id;
                setSelectedFarm(firstFarmId);
                await Promise.allSettled([
                    fetchHistory(firstFarmId),
                    fetchSensorHistoryForFarm(firstFarmId),
                    fetchForecastForFarm(firstFarmId, nextFarms),
                    fetchRiskForFarm(firstFarmId),
                    fetchDecisionForFarm(firstFarmId),
                ]);
            } else {
                setRequests([]);
                setForecast(null);
                setRisk(null);
                setDecision(null);
                setSensorHistory([]);
            }
        } catch (error) {
            console.error(error);
            setForecastError('Khong the tai du lieu phan tich.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        fetchReportAssets();
        fetchAiMetadata();
    }, []);

    const handleFarmChange = async (farmId: string) => {
        setSelectedFarm(farmId);
        setLoading(true);
        try {
            await Promise.allSettled([
                fetchHistory(farmId),
                fetchSensorHistoryForFarm(farmId),
                fetchForecastForFarm(farmId, farms),
                fetchRiskForFarm(farmId),
                fetchDecisionForFarm(farmId),
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedFarm) return;
        setSubmitting(true);
        try {
            await aiService.analyze(selectedFarm, analysisType);
            await fetchHistory(selectedFarm);
            alert('Da gui yeu cau phan tich thanh cong.');
        } catch (error) {
            console.error(error);
            alert('Gui yeu cau that bai.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.5rem' }}>AI Analysis & Forecast</h1>
                    <p className="text-secondary">Gui task AI va xem du bao do man 7 ngay theo tinh.</p>
                </div>
            </div>

            <div
                className="glass-card"
                style={{
                    marginBottom: '1.5rem',
                    padding: '1rem 1.2rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.8rem',
                    border: '1px solid var(--border-light)',
                }}
            >
                <div style={{ padding: '0.7rem', background: 'rgba(59,130,246,0.1)', borderRadius: '12px' }}>
                    <div className="text-secondary" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Farm dang xem</div>
                    <div style={{ fontWeight: 700, marginTop: '0.25rem', fontSize: '0.95rem' }}>
                        {selectedFarmInfo?.farm_name || 'N/A'}
                    </div>
                </div>
                <div style={{ padding: '0.7rem', background: 'rgba(16,185,129,0.1)', borderRadius: '12px' }}>
                    <div className="text-secondary" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Tinh du bao</div>
                    <div style={{ fontWeight: 700, marginTop: '0.25rem', fontSize: '0.95rem' }}>
                        {selectedProvince || 'N/A'}
                    </div>
                </div>
                <div style={{ padding: '0.7rem', background: 'rgba(245,158,11,0.1)', borderRadius: '12px' }}>
                    <div className="text-secondary" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>AI2 hien tai</div>
                    <div style={{ fontWeight: 700, marginTop: '0.25rem', fontSize: '0.95rem' }}>
                        {risk?.risk_label || (riskLoading ? 'Loading...' : 'Fallback')}
                    </div>
                </div>
            </div>

            <div className="card glass-card" style={{ marginBottom: '1.5rem', padding: '1.2rem', border: '1px solid var(--border-light)' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: '0.8rem' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Biểu đồ dữ liệu cảm biến 7 ngày (đã lưu)</h3>
                        <p className="text-secondary" style={{ margin: 0, fontSize: '0.8rem' }}>
                            Dữ liệu thật/giả lập đã ghi vào hệ thống, không phải dự báo.
                        </p>
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                        {sensorHistory.length} bản ghi
                    </div>
                </div>

                {sensorHistoryLoading ? (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <Loader2 className="animate-spin" size={18} />
                    </div>
                ) : sensorHistoryError ? (
                    <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{sensorHistoryError}</div>
                ) : historyDaily.every((item) => item.count === 0) ? (
                    <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                        Chưa có dữ liệu 7 ngày. Vào Admin IoT và bấm "Seed 7 ngày" để tạo dữ liệu giả lập.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {[
                            { key: 'salinityAvg', label: 'Độ mặn (‰)', color: '#3b82f6', min: 0, max: 8.5 },
                            { key: 'temperatureAvg', label: 'Nhiệt độ (°C)', color: '#10b981', min: 26, max: 33 },
                            { key: 'phAvg', label: 'pH', color: '#f59e0b', min: 7.0, max: 8.0 },
                        ].map((metric) => (
                            <div key={metric.key}>
                                <div className="text-secondary" style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                                    {metric.label}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.45rem' }}>
                                    {historyDaily.map((item) => {
                                        const value = Number((item as any)[metric.key]) || 0;
                                        const ratio = Math.max(0, Math.min(1, (value - metric.min) / (metric.max - metric.min)));
                                        return (
                                            <div key={`${metric.key}-${item.day}`} style={{ textAlign: 'center' }}>
                                                <div
                                                    style={{
                                                        height: '88px',
                                                        borderRadius: '10px',
                                                        background: 'rgba(15,23,42,0.06)',
                                                        display: 'flex',
                                                        alignItems: 'flex-end',
                                                        padding: '3px',
                                                    }}
                                                >
                                                    <div
                                                        title={`${item.day}: ${value.toFixed(2)}`}
                                                        style={{
                                                            width: '100%',
                                                            height: `${Math.max(4, ratio * 100)}%`,
                                                            borderRadius: '8px',
                                                            background: metric.color,
                                                            opacity: item.count > 0 ? 0.95 : 0.2,
                                                        }}
                                                    />
                                                </div>
                                                <div style={{ fontSize: '0.68rem', marginTop: '0.25rem', color: 'var(--text-secondary)' }}>{item.label}</div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>{item.count > 0 ? value.toFixed(1) : '-'}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
                <div className="card glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border-light)' }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: '1.2rem' }}>
                        <Sparkles size={20} color="var(--primary-glow)" />
                        <h2 style={{ margin: 0 }}>Yeu cau AI</h2>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="text-secondary" style={{ display: 'block', marginBottom: '0.4rem' }}>
                                Farm
                            </label>
                            <select
                                value={selectedFarm}
                                onChange={(e) => handleFarmChange(e.target.value)}
                                disabled={farmOptions.length === 0}
                            >
                                {farmOptions.map((farm) => (
                                    <option key={farm.id} value={farm.id}>
                                        {farm.farm_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className="text-secondary" style={{ display: 'block', marginBottom: '0.4rem' }}>
                                Analysis Type
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => setAnalysisType('crop_health')}
                                    style={{
                                        border: analysisType === 'crop_health' ? '2px solid var(--primary-glow)' : '1px solid var(--border-light)',
                                        background: analysisType === 'crop_health' ? 'rgba(16,185,129,0.12)' : undefined,
                                    }}
                                >
                                    <Brain size={16} /> Crop Health
                                </button>
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => setAnalysisType('salinity_forecast')}
                                    style={{
                                        border: analysisType === 'salinity_forecast' ? '2px solid var(--primary-glow)' : '1px solid var(--border-light)',
                                        background: analysisType === 'salinity_forecast' ? 'rgba(59,130,246,0.12)' : undefined,
                                    }}
                                >
                                    <Waves size={16} /> Salinity Forecast
                                </button>
                            </div>
                        </div>

                        <button className="primary" style={{ width: '100%' }} disabled={submitting || farmOptions.length === 0}>
                            {submitting ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <>
                                    <Send size={16} /> Gui yeu cau
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="card glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border-light)' }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                        <Waves size={20} color="#3b82f6" />
                        <h2 style={{ margin: 0 }}>Forecast 7 ngay</h2>
                    </div>
                    <p className="text-secondary" style={{ fontSize: '0.8rem' }}>
                        Province: <strong>{selectedProvince || 'N/A'}</strong>
                    </p>

                {forecastLoading ? (
                        <div style={{ padding: '1rem', textAlign: 'center' }}>
                            <Loader2 className="animate-spin" size={20} />
                        </div>
                    ) : forecastError ? (
                        <div style={{ marginTop: '0.8rem', color: '#ef4444', fontSize: '0.85rem' }}>{forecastError}</div>
                    ) : forecast ? (
                        <div style={{ marginTop: '0.8rem' }}>
                            {forecastNotice && (
                                <div
                                    style={{
                                        marginBottom: '0.6rem',
                                        color: '#d97706',
                                        background: 'rgba(245, 158, 11, 0.12)',
                                        borderRadius: '8px',
                                        padding: '8px',
                                        fontSize: '0.75rem',
                                    }}
                                >
                                    {forecastNotice}
                                </div>
                            )}
                            <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.6rem' }}>
                                as_of: {forecast.as_of} | model: {forecast.model_version}
                                {forecast.model_set_used ? ` (${forecast.model_set_used})` : ''}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>Day</th>
                                        <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>Date</th>
                                        <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>Salinity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {forecast.forecast.map((item) => (
                                        <tr key={item.day_ahead} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>D+{item.day_ahead}</td>
                                            <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>{item.date}</td>
                                            <td style={{ padding: '8px 4px', fontSize: '0.85rem', fontWeight: 700 }}>
                                                <span
                                                    style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '999px',
                                                        ...getSalinityPalette(Number(item.salinity_pred)),
                                                    }}
                                                >
                                                    {Number(item.salinity_pred).toFixed(2)} ‰
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-secondary" style={{ marginTop: '0.8rem', fontSize: '0.85rem' }}>
                            Chua co du lieu du bao.
                        </div>
                    )}

                    {aiSupportedProvinces.length > 0 && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.8rem' }}>
                            <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                                Hoac xem nhanh theo tinh (AI1):
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem' }}>
                                <select
                                    value={manualProvince}
                                    onChange={(e) => setManualProvince(e.target.value)}
                                >
                                    {aiSupportedProvinces.map((province) => (
                                        <option key={province} value={province}>
                                            {province}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => fetchForecastByProvince(manualProvince)}
                                    disabled={forecastLoading || !manualProvince}
                                >
                                    Xem du bao
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.8rem' }}>
                        <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                            AI2 Risk (theo sensor hien tai):
                        </div>
                        {riskLoading ? (
                            <div style={{ padding: '0.4rem 0' }}>
                                <Loader2 className="animate-spin" size={16} />
                            </div>
                        ) : riskNotice ? (
                            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{riskNotice}</div>
                        ) : riskError ? (
                            <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{riskError}</div>
                        ) : risk ? (
                            <div
                                className="glass-card"
                                style={{
                                    padding: '0.7rem',
                                    border: `1px solid ${getRiskPalette(risk.risk_label).border}`,
                                    background: getRiskPalette(risk.risk_label).bg,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: getRiskPalette(risk.risk_label).color }}>
                                        Risk: {risk.risk_label}
                                    </div>
                                    {typeof risk.risk_score === 'number' && (
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: getRiskPalette(risk.risk_label).color }}>
                                            {(risk.risk_score * 100).toFixed(1)}%
                                        </div>
                                    )}
                                </div>
                                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                    model: {risk.model_version}
                                </div>
                                {typeof risk.risk_score === 'number' && (
                                    <div style={{ marginTop: '0.45rem', height: '6px', borderRadius: '999px', background: 'rgba(15,23,42,0.12)' }}>
                                        <div
                                            style={{
                                                width: `${Math.max(6, Math.min(100, risk.risk_score * 100))}%`,
                                                height: '100%',
                                                borderRadius: '999px',
                                                background: getRiskPalette(risk.risk_label).color,
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                Chua co ket qua AI2.
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.8rem' }}>
                        <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                            AI3 Decision (van hanh):
                        </div>
                        {decisionLoading ? (
                            <div style={{ padding: '0.4rem 0' }}>
                                <Loader2 className="animate-spin" size={16} />
                            </div>
                        ) : decisionError ? (
                            <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{decisionError}</div>
                        ) : decision ? (
                            <div className="glass-card" style={{ padding: '0.7rem', border: '1px solid var(--border-light)' }}>
                                <div className="flex justify-between items-center" style={{ marginBottom: '0.3rem' }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{decision.decision}</div>
                                    <span
                                        style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            borderRadius: '999px',
                                            padding: '3px 8px',
                                            ...getUrgencyPalette(decision.urgency),
                                        }}
                                    >
                                        {decision.urgency}
                                    </span>
                                </div>
                                <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                                    {decision.reason}
                                </div>
                                <div style={{ display: 'grid', gap: '0.25rem' }}>
                                    {(decision.actions || []).slice(0, 4).map((action, index) => (
                                        <div key={`${index}-${action}`} style={{ fontSize: '0.78rem' }}>
                                            {index + 1}. {action}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                Chua co quyet dinh AI3.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="card glass-card" style={{ marginTop: '1.5rem' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                    <History size={18} color="var(--primary-glow)" />
                    <h3 style={{ margin: 0 }}>Lich su phan tich</h3>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <Loader2 className="animate-spin" size={18} />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                        Chua co request nao.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                        {requests.map((req) => (
                            <div
                                key={req.id}
                                className="glass-card"
                                style={{
                                    padding: '0.8rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    borderLeft: `4px solid ${req.status === 'completed' ? '#10b981' : '#3b82f6'}`,
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{req.analysis_type}</div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                        {new Date(req.created_at).toLocaleString()}
                                    </div>
                                </div>
                                {req.status === 'completed' ? (
                                    <div className="flex items-center gap-1" style={{ color: '#10b981', fontSize: '0.8rem' }}>
                                        <CheckCircle2 size={14} /> Done
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1" style={{ color: '#3b82f6', fontSize: '0.8rem' }}>
                                        <Loader2 size={14} className="animate-spin" /> Running
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: '1rem', padding: '0.7rem', background: 'rgba(59,130,246,0.08)', borderRadius: '8px' }}>
                    <div className="flex items-center gap-2" style={{ color: '#3b82f6', fontSize: '0.8rem' }}>
                        <AlertCircle size={14} /> Forecast from AI1 models; refresh if you just retrained.
                    </div>
                </div>
            </div>

            <div className="card glass-card" style={{ marginTop: '1.5rem' }}>
                <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                    <Sparkles size={18} color="var(--primary-glow)" />
                    <h3 style={{ margin: 0 }}>AI1 Report Charts</h3>
                </div>

                {reportsLoading ? (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <Loader2 className="animate-spin" size={18} />
                    </div>
                ) : (
                    <>
                        {reportMetrics.length > 0 && (
                            <div style={{ marginBottom: '1rem', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>Horizon</th>
                                            <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>Model</th>
                                            <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>MAE</th>
                                            <th style={{ padding: '8px 4px', fontSize: '0.75rem' }}>RMSE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportMetrics.map((item, index) => (
                                            <tr key={`${item.model}-${item.horizon}-${index}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>D+{item.horizon}</td>
                                                <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>{item.model}</td>
                                                <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>{Number(item.mae).toFixed(4)}</td>
                                                <td style={{ padding: '8px 4px', fontSize: '0.85rem' }}>{Number(item.rmse).toFixed(4)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {reportCharts.length === 0 ? (
                            <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                Chua co chart report. Train AI1 de tao chart.
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                    gap: '0.8rem',
                                }}
                            >
                                {reportCharts.map((chart) => (
                                    <div key={chart.name} className="glass-card" style={{ padding: '0.5rem' }}>
                                        <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                                            {chart.name}
                                        </div>
                                        <img
                                            src={chart.url}
                                            alt={chart.name}
                                            style={{
                                                width: '100%',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
