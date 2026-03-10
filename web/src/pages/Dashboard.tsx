import React, { useState, useEffect } from 'react';
import { farmService } from '../services/farm.service';
import { aiService } from '../services/ai.service';
import { iotService } from '../services/iot.service';
import { Droplets, Thermometer, Wind, TrendingUp, History, Loader2, Database, RefreshCcw, Brain, Sun, CloudRain, Sparkles } from 'lucide-react';
import { Gauge } from '../components/Gauge';

export const Dashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [readings, setReadings] = useState<any[]>([]);
    const [farms, setFarms] = useState<any[]>([]);
    const [recommendation, setRecommendation] = useState<any>(null);
    const [selectedFarmId, setSelectedFarmId] = useState<string>('');
    const [weather, setWeather] = useState<any>(null);

    const fetchData = async () => {
        setRefreshing(true);
        try {
            const farmData = await farmService.getMyFarms();
            const farmlist = farmData.data || [];
            setFarms(farmlist);

            // Auto-select first farm
            let currentId = selectedFarmId;
            if (!currentId && farmlist.length > 0) {
                currentId = farmlist[0].id;
                setSelectedFarmId(currentId);
            }

            const sensorData = await iotService.getReadings();
            const allReadings = sensorData.data || [];

            // Filter readings
            const farmReadings = allReadings.filter((r: any) => r.iot_devices?.farm_id === currentId);
            setReadings(farmReadings);

            if (currentId) {
                const recData = await aiService.getRecommendations(currentId);
                if (recData.data) {
                    setRecommendation(recData.data);
                } else {
                    setRecommendation(null);
                }
            }

            // We don't need to manually setStats anymore as we use readings[0] directly in JSX
        } catch (err) {
            console.error("Dashboard fetch error:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const runAI = async () => {
        if (farms.length === 0) return;
        setAnalyzing(true);
        try {
            await aiService.analyze(farms[0].id, 'salinity_forecast');
            // Wait a bit then refresh
            setTimeout(fetchData, 2000);
        } catch (err) {
            console.error(err);
        } finally {
            setTimeout(() => setAnalyzing(false), 2000);
        }
    };

    const seedData = async () => {
        if (!confirm('Khởi tạo dữ liệu mẫu cho vùng lúa - tôm?')) return;
        setRefreshing(true);
        try {
            const farmData = {
                farm_name: "Lô ST25 Thực nghiệm",
                area_hectares: 2.5,
                farm_type: "shrimp_rice"
            };
            await farmService.createFarm(farmData);
            fetchData();
        } catch (err: any) {
            console.error("Seed error:", err);
            const msg = err.response?.data?.message || err.message || 'Không xách định';
            alert(`Lỗi khi tạo dữ liệu mẫu: ${msg}`);
        } finally {
            setRefreshing(false);
        }
    };

    // Weather Effect
    useEffect(() => {
        if (!selectedFarmId) { setWeather(null); return; }

        const fetchWeather = async () => {
            // Default Mekong Delta (Bac Lieu)
            let lat = 9.294, lon = 105.721;

            // Try to find farm location
            const farm = farms.find(f => f.id === selectedFarmId);

            if (farm) {
                if (farm.latitude && farm.longitude) {
                    lat = parseFloat(farm.latitude);
                    lon = parseFloat(farm.longitude);
                } else if (farm.geometry && farm.geometry.coordinates) {
                    // Handle Point vs Polygon
                    if (farm.geometry.type === 'Point') {
                        lat = farm.geometry.coordinates[1];
                        lon = farm.geometry.coordinates[0];
                    } else if (farm.geometry.type === 'Polygon') {
                        const p = farm.geometry.coordinates[0][0];
                        lat = p[1];
                        lon = p[0];
                    }
                }
            }

            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=Asia%2FBangkok`);
                const data = await res.json();
                setWeather(data.current_weather);
            } catch (e) { console.error("Weather fetch error", e); }
        };

        fetchWeather();
        const interval = setInterval(fetchWeather, 600000); // 10 mins
        return () => clearInterval(interval);
    }, [selectedFarmId, farms]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 2000); // Poll every 2s for realtime feel
        return () => clearInterval(interval);
    }, [selectedFarmId]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <Loader2 className="animate-spin" size={40} color="var(--primary-glow)" />
        </div>
    );

    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '2.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.5rem' }}>Bảng điều khiển</h1>
                    <p className="text-secondary">Giám sát theo thời gian thực và Khuyến nghị AI thông minh.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {farms.length > 0 && (
                        <select
                            value={selectedFarmId}
                            onChange={(e) => {
                                setSelectedFarmId(e.target.value);
                            }}
                            className="glass-card"
                            style={{
                                padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border-light)',
                                outline: 'none', cursor: 'pointer', fontWeight: 600, minWidth: '220px',
                                color: 'var(--primary-dark)', boxShadow: 'var(--shadow-sm)',
                                marginRight: '1rem'
                            }}
                        >
                            {farms.map(f => (
                                <option key={f.id} value={f.id}>{f.farm_name}</option>
                            ))}
                        </select>
                    )}

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="secondary" onClick={fetchData} disabled={refreshing}>
                            <RefreshCcw size={18} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                        <button className="primary" onClick={seedData}>
                            <Database size={18} /> Mẫu Lúa-Tôm
                        </button>
                    </div>
                </div>
            </div>

            {/* === TOP CARDS GRID === */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1.5rem',
                marginBottom: '1.5rem'
            }}>
                {/* Card 1: Độ mặn */}
                <div className="card glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
                        <Droplets size={24} color="#3b82f6" />
                    </div>
                    <Gauge value={readings[0]?.salinity ? parseFloat(readings[0].salinity) : 0} max={35} label="Độ mặn" unit="‰" color="#3b82f6" threshold={2} />
                </div>

                {/* Card 2: Độ pH */}
                <div className="card glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
                        <Wind size={24} color="#10b981" />
                    </div>
                    <Gauge value={readings[0]?.ph ? parseFloat(readings[0].ph) : 7} max={14} label="Độ pH" unit="" color="#10b981" />
                </div>

                {/* Card 3: Nhiệt độ nước */}
                <div className="card glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', padding: '10px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
                        <Thermometer size={24} color="#f59e0b" />
                    </div>
                    <Gauge value={readings[0]?.temperature ? parseFloat(readings[0].temperature) : 25} max={50} label="Nhiệt độ nước" unit="°C" color="#f59e0b" />
                </div>

                {/* Card 4: Tổng quan + Thời tiết - SIMPLE VERSION */}
                <div className="card glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    {/* Top: Area Info */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <TrendingUp size={16} color="#8b5cf6" />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tổng quan</span>
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                            {farms.find(f => f.id === selectedFarmId)?.area_hectares || 0}
                            <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '4px' }}>ha</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {farms.find(f => f.id === selectedFarmId)?.farm_name || '---'}
                        </div>
                        <span style={{ display: 'inline-block', marginTop: '8px', padding: '3px 8px', fontSize: '0.65rem', fontWeight: 600, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
                            HOẠT ĐỘNG
                        </span>
                    </div>

                    {/* Bottom: Weather */}
                    {weather && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {weather.weathercode <= 3 ? <Sun size={24} color="#f59e0b" /> : <CloudRain size={24} color="#3b82f6" />}
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{weather.temperature}°C</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Không khí · Gió {weather.windspeed} km/h</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* === BOTTOM SECTION === */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>

                {/* History Table */}
                <div className="card glass-card" style={{ minHeight: '400px' }}>
                    <div className="flex justify-between items-center mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <History size={20} color="#3b82f6" /> Lịch sử đo lường
                        </h3>
                        <button className="secondary" style={{ fontSize: '0.8rem' }}>Xem tất cả</button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'left' }}>
                                    <th style={{ padding: '12px' }}>Thời gian</th>
                                    <th style={{ padding: '12px' }}>Thiết bị</th>
                                    <th style={{ padding: '12px' }}>Chỉ số (Mặn - pH - Nhiệt)</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {readings.length === 0 ? (
                                    <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center' }}>Đang tải dữ liệu...</td></tr>
                                ) : (
                                    readings.slice(0, 8).map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                                {new Date(r.timestamp).toLocaleTimeString()}
                                            </td>
                                            <td style={{ padding: '12px', fontWeight: 500 }}>
                                                {r.iot_devices?.device_name || 'Cảm biến ' + (i + 1)}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ display: 'flex', gap: '15px' }}>
                                                    <span style={{ color: r.salinity > 25 ? '#ef4444' : '#3b82f6', fontWeight: 600 }}>{r.salinity}‰</span>
                                                    <span style={{ color: 'var(--text-dim)' }}>{r.ph}</span>
                                                    <span style={{ color: '#f59e0b' }}>{r.temperature}°C</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                {parseFloat(r.salinity) > 30 ?
                                                    <span style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>Cảnh báo</span> :
                                                    <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>Ổn định</span>
                                                }
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* AI Advisor - Clean Version */}
                <div className="card glass-card flex flex-col" style={{ minHeight: '400px' }}>
                    <div className="flex items-center gap-2 mb-4" style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <Brain size={24} color="#10b981" />
                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Trợ lý AI</h3>
                    </div>

                    {!recommendation ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                            <p>Chưa có dữ liệu phân tích</p>
                            <button className="primary mt-4" onClick={runAI} disabled={analyzing}>Phân tích ngay</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
                            <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', borderLeft: '4px solid #10b981' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', textTransform: 'uppercase', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Sparkles size={14} /> Khuyến nghị
                                </h4>
                                <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-normal)' }}>{recommendation.recommended_action}</p>
                            </div>

                            <div style={{ flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                                <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    "{recommendation.explanation}"
                                </p>
                            </div>

                            <button className="primary w-full" onClick={runAI} disabled={analyzing} style={{ marginTop: 'auto' }}>
                                {analyzing ? 'Đang cập nhật...' : 'Cập nhật phân tích'}
                            </button>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
