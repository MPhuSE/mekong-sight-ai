import React, { useState, useEffect } from 'react';
import { farmService } from '../services/farm.service';
import { Plus, MapPin, Ruler, Droplets, X, Loader2, Settings, Trash2 } from 'lucide-react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

type RicePreset = {
    variety: string;
    label: string;
    warningMax: number;
    criticalMax: number;
};

type ShrimpPreset = {
    variety: string;
    label: string;
    warningMin: number;
    warningMax: number;
    criticalMin: number;
    criticalMax: number;
    optimalMin: number;
    optimalMax: number;
};

const RICE_PRESETS: RicePreset[] = [
    { variety: 'OM2517', label: 'OM2517 (~4‰)', warningMax: 4, criticalMax: 6 },
    { variety: 'OM5451', label: 'OM5451 (~4‰)', warningMax: 4, criticalMax: 6 },
    { variety: 'OM9577', label: 'OM9577 (4-6‰)', warningMax: 6, criticalMax: 8 },
    { variety: 'OM5464', label: 'OM5464 (4-6‰)', warningMax: 6, criticalMax: 8 },
    { variety: 'OM18', label: 'OM18 (6-8‰)', warningMax: 8, criticalMax: 10 },
    { variety: 'OM429', label: 'OM429 (6-8‰)', warningMax: 8, criticalMax: 10 },
    { variety: 'OM242', label: 'OM242 (6-8‰)', warningMax: 8, criticalMax: 10 },
    { variety: 'ST24', label: 'ST24 (~4‰)', warningMax: 4, criticalMax: 6 },
    { variety: 'ST25', label: 'ST25 (~4‰)', warningMax: 4, criticalMax: 6 },
    { variety: 'MOT_BUI_DO', label: 'Một Bụi Đỏ (~4‰)', warningMax: 4, criticalMax: 6 },
];

const SHRIMP_PRESETS: ShrimpPreset[] = [
    {
        variety: 'TOM_SU',
        label: 'Tôm sú',
        warningMin: 5,
        warningMax: 20,
        criticalMin: 5,
        criticalMax: 35,
        optimalMin: 10,
        optimalMax: 25,
    },
    {
        variety: 'TOM_THE_CHAN_TRANG',
        label: 'Tôm thẻ chân trắng',
        warningMin: 5,
        warningMax: 25,
        criticalMin: 0.5,
        criticalMax: 40,
        optimalMin: 10,
        optimalMax: 20,
    },
];

const buildDefaultAlertConfig = () => ({
    rice_variety: 'ST25',
    shrimp_variety: 'TOM_THE_CHAN_TRANG',
    rice_warning_max: 4,
    rice_critical_max: 6,
    shrimp_warning_min: 5,
    shrimp_warning_max: 25,
    shrimp_critical_min: 0.5,
    shrimp_critical_max: 40,
    shrimp_optimal_min: 10,
    shrimp_optimal_max: 20,
});

type NewFarmForm = {
    farm_name: string;
    area_hectares: string;
    farm_type: string;
    farm_code: string;
    address: string;
    latitude: string;
    longitude: string;
};

const buildDefaultNewFarm = (): NewFarmForm => ({
    farm_name: '',
    area_hectares: '',
    farm_type: 'shrimp_rice',
    farm_code: '',
    address: '',
    latitude: '',
    longitude: '',
});

type LocationForm = {
    latitude: string;
    longitude: string;
    address: string;
};

type ProvinceOption = {
    code: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
};

const KEY_PROVINCES: ProvinceOption[] = [
    { code: 'CA_MAU', label: 'Cà Mau', address: 'TP Cà Mau, Tỉnh Cà Mau', lat: 9.1768, lng: 105.1524 },
    { code: 'BAC_LIEU', label: 'Bạc Liêu', address: 'TP Bạc Liêu, Tỉnh Bạc Liêu', lat: 9.2941, lng: 105.7216 },
    { code: 'BEN_TRE', label: 'Bến Tre', address: 'TP Bến Tre, Tỉnh Bến Tre', lat: 10.2434, lng: 106.3756 },
    { code: 'KIEN_GIANG', label: 'Kiên Giang', address: 'TP Rạch Giá, Tỉnh Kiên Giang', lat: 10.0125, lng: 105.0809 },
    { code: 'SOC_TRANG', label: 'Sóc Trăng', address: 'TP Sóc Trăng, Tỉnh Sóc Trăng', lat: 9.6025, lng: 105.9739 },
];

const DEFAULT_CENTER: LatLngExpression = [9.4, 105.8];

const parseFarmPosition = (farm: any): { lat: number; lng: number } | null => {
    if (!farm) return null;

    const latRaw = farm.latitude;
    const lngRaw = farm.longitude;
    if (latRaw !== undefined && lngRaw !== undefined && latRaw !== null && lngRaw !== null) {
        const lat = Number(latRaw);
        const lng = Number(lngRaw);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }

    const geometry = farm.geometry;
    if (geometry && typeof geometry === 'object' && geometry.type && geometry.coordinates) {
        if (geometry.type === 'Point') {
            return { lat: Number(geometry.coordinates[1]), lng: Number(geometry.coordinates[0]) };
        }
        if (geometry.type === 'Polygon') {
            const first = geometry.coordinates?.[0]?.[0];
            if (first && first.length >= 2) return { lat: Number(first[1]), lng: Number(first[0]) };
        }
    }

    if (typeof geometry === 'string') {
        const polyMatch = geometry.match(/POLYGON\(\(([-\d.]+) ([-\d.]+)/);
        if (polyMatch) return { lat: Number(polyMatch[2]), lng: Number(polyMatch[1]) };
    }
    return null;
};

const LocationMarker: React.FC<{
    position: { lat: number; lng: number } | null;
    onChange: (next: { lat: number; lng: number }) => void;
}> = ({ position, onChange }) => {
    useMapEvents({
        click(e) {
            onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
        },
    });

    if (!position) return null;
    return <Marker position={[position.lat, position.lng]} />;
};

export const Farms: React.FC = () => {
    const [farms, setFarms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [selectedFarm, setSelectedFarm] = useState<any>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [currentSeason, setCurrentSeason] = useState<any>(null);
    const [showSeasonForm, setShowSeasonForm] = useState(false);
    const [showThresholdModal, setShowThresholdModal] = useState(false);
    const [thresholdLoading, setThresholdLoading] = useState(false);
    const [savingThreshold, setSavingThreshold] = useState(false);
    const [savingLocation, setSavingLocation] = useState(false);
    const [alertConfig, setAlertConfig] = useState<any>(buildDefaultAlertConfig());
    const [locationForm, setLocationForm] = useState<LocationForm>({ latitude: '', longitude: '', address: '' });
    const [seasonData, setSeasonData] = useState({
        season_type: 'rice',
        variety: RICE_PRESETS[0].variety,
        start_date: new Date().toISOString().split('T')[0]
    });

    // Form state
    const [newFarm, setNewFarm] = useState<NewFarmForm>(buildDefaultNewFarm());
    const selectedFarmType = selectedFarm?.farm_type;
    const allowsRiceConfig = selectedFarmType !== 'shrimp_only';
    const allowsShrimpConfig = selectedFarmType !== 'rice_only';
    const locationLat = Number(locationForm.latitude);
    const locationLng = Number(locationForm.longitude);
    const hasValidLocation = Number.isFinite(locationLat) && Number.isFinite(locationLng);

    const fetchFarms = async () => {
        try {
            const data = await farmService.getMyFarms();
            setFarms(data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFarms();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const farmName = newFarm.farm_name.trim();
        const area = parseFloat(newFarm.area_hectares);
        const latitude = newFarm.latitude.trim();
        const longitude = newFarm.longitude.trim();
        const hasLatitude = latitude.length > 0;
        const hasLongitude = longitude.length > 0;

        if (!farmName) {
            alert('Vui lòng nhập tên trang trại.');
            return;
        }
        if (!Number.isFinite(area) || area <= 0) {
            alert('Diện tích phải là số lớn hơn 0.');
            return;
        }
        if ((hasLatitude && !hasLongitude) || (!hasLatitude && hasLongitude)) {
            alert('Vui lòng nhập đủ cả vĩ độ và kinh độ.');
            return;
        }
        if (hasLatitude && hasLongitude) {
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                alert('Vĩ độ không hợp lệ (phải trong khoảng -90 đến 90).');
                return;
            }
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                alert('Kinh độ không hợp lệ (phải trong khoảng -180 đến 180).');
                return;
            }
        }

        const payload = {
            farm_name: farmName,
            farm_type: newFarm.farm_type,
            area_hectares: area,
            ...(newFarm.farm_code.trim() ? { farm_code: newFarm.farm_code.trim() } : {}),
            ...(newFarm.address.trim() ? { address: newFarm.address.trim() } : {}),
            ...(hasLatitude && hasLongitude ? { latitude, longitude } : {}),
        };

        setSubmitting(true);
        try {
            await farmService.createFarm(payload);
            setShowModal(false);
            setNewFarm(buildDefaultNewFarm());
            fetchFarms();
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể tạo trang trại. Vui lòng kiểm tra lại.';
            alert(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleViewDetail = async (id: string) => {
        setLoadingDetail(true);
        try {
            const data = await farmService.getFarmById(id);
            setSelectedFarm(data.data);
            const position = parseFarmPosition(data.data);
            setLocationForm({
                latitude: position ? String(position.lat) : '',
                longitude: position ? String(position.lng) : '',
                address: data.data?.address || '',
            });

            // Lấy thông tin mùa vụ hiện tại
            const seasonResponse = await farmService.getCurrentSeason(id);
            const activeSeason = seasonResponse.data;
            setCurrentSeason(activeSeason);
            if (activeSeason) {
                setSeasonData({
                    season_type: activeSeason.season_type,
                    variety: activeSeason.variety || (activeSeason.season_type === 'rice' ? RICE_PRESETS[0].variety : SHRIMP_PRESETS[0].variety),
                    start_date: new Date(activeSeason.start_date).toISOString().split('T')[0],
                });
            } else {
                const farmType = data.data?.farm_type;
                const defaultSeasonType = farmType === 'shrimp_only' ? 'shrimp' : 'rice';
                setSeasonData({
                    season_type: defaultSeasonType,
                    variety: defaultSeasonType === 'rice' ? RICE_PRESETS[0].variety : SHRIMP_PRESETS[0].variety,
                    start_date: new Date().toISOString().split('T')[0],
                });
            }
            setShowSeasonForm(false);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleStartSeason = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await farmService.startSeason({
                ...seasonData,
                farm_id: selectedFarm.id
            });
            alert('Đã thiết lập mùa vụ mới thành công!');
            handleViewDetail(selectedFarm.id);
        } catch (err) {
            alert('Lỗi khi thiết lập mùa vụ.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveLocation = async () => {
        if (!selectedFarm?.id) return;

        const lat = Number(locationForm.latitude);
        const lng = Number(locationForm.longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            alert('Vĩ độ không hợp lệ (phải trong khoảng -90 đến 90).');
            return;
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
            alert('Kinh độ không hợp lệ (phải trong khoảng -180 đến 180).');
            return;
        }

        setSavingLocation(true);
        try {
            await farmService.updateFarm(selectedFarm.id, {
                latitude: lat,
                longitude: lng,
                address: locationForm.address.trim() || null,
            });
            await handleViewDetail(selectedFarm.id);
            fetchFarms();
            alert('Đã cập nhật vị trí trang trại.');
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể cập nhật vị trí.';
            alert(msg);
        } finally {
            setSavingLocation(false);
        }
    };

    const applyProvinceToNewFarm = (provinceCode: string) => {
        const selected = KEY_PROVINCES.find((item) => item.code === provinceCode);
        if (!selected) return;
        setNewFarm((prev) => ({
            ...prev,
            address: selected.address,
            latitude: selected.lat.toFixed(6),
            longitude: selected.lng.toFixed(6),
        }));
    };

    const applyProvinceToLocation = (provinceCode: string) => {
        const selected = KEY_PROVINCES.find((item) => item.code === provinceCode);
        if (!selected) return;
        setLocationForm((prev) => ({
            ...prev,
            address: selected.address,
            latitude: selected.lat.toFixed(6),
            longitude: selected.lng.toFixed(6),
        }));
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa trang trại này không? Dữ liệu không thể khôi phục.')) return;
        try {
            await farmService.deleteFarm(id);
            fetchFarms();
        } catch (err: any) {
            console.error(err);
            const msg = err?.response?.data?.message || err?.message || 'Lỗi khi xóa trang trại.';
            alert(msg);
        }
    };

    const applyRicePreset = (variety: string) => {
        const preset = RICE_PRESETS.find((item) => item.variety === variety);
        if (!preset) return;
        setAlertConfig((prev: any) => ({
            ...prev,
            rice_variety: preset.variety,
            rice_warning_max: preset.warningMax,
            rice_critical_max: preset.criticalMax,
        }));
    };

    const applyShrimpPreset = (variety: string) => {
        const preset = SHRIMP_PRESETS.find((item) => item.variety === variety);
        if (!preset) return;
        setAlertConfig((prev: any) => ({
            ...prev,
            shrimp_variety: preset.variety,
            shrimp_warning_min: preset.warningMin,
            shrimp_warning_max: preset.warningMax,
            shrimp_critical_min: preset.criticalMin,
            shrimp_critical_max: preset.criticalMax,
            shrimp_optimal_min: preset.optimalMin,
            shrimp_optimal_max: preset.optimalMax,
        }));
    };

    const openThresholdConfig = async () => {
        if (!selectedFarm?.id) return;
        setThresholdLoading(true);
        setShowThresholdModal(true);
        try {
            const response = await farmService.getAlertConfig(selectedFarm.id);
            setAlertConfig({ ...buildDefaultAlertConfig(), ...(response?.data || {}) });
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể tải cấu hình ngưỡng.';
            alert(msg);
            setAlertConfig(buildDefaultAlertConfig());
        } finally {
            setThresholdLoading(false);
        }
    };

    const handleSaveThresholdConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFarm?.id) return;
        setSavingThreshold(true);
        try {
            await farmService.updateAlertConfig(selectedFarm.id, alertConfig);
            alert('Đã lưu cấu hình ngưỡng cảnh báo.');
            setShowThresholdModal(false);
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Không thể lưu cấu hình ngưỡng.';
            alert(msg);
        } finally {
            setSavingThreshold(false);
        }
    };

    return (
        <div className="farms-page" style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="flex justify-between items-center farms-toolbar" style={{ marginBottom: '2.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.5rem' }}>Quản lý trang trại</h1>
                    <p className="text-secondary">Danh sách các khu vực nuôi trồng và thông tin chi tiết.</p>
                </div>
                <button className="primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} /> Thêm trang trại mới
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
                    <Loader2 className="animate-spin" size={40} color="var(--primary-glow)" />
                </div>
            ) : (
                <div className="grid farms-grid">
                    {farms.length === 0 ? (
                        <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', borderStyle: 'dashed' }}>
                            <p className="text-secondary">Bạn chưa có trang trại nào. Hãy thêm trang trại đầu tiên!</p>
                        </div>
                    ) : (
                        farms.map(farm => (
                            <div key={farm.id} className="card farm-card">
                                <div className="flex justify-between items-start" style={{ marginBottom: '1.5rem' }}>
                                    <h3>{farm.farm_name}</h3>
                                    <span className={`status-tag status-${farm.status === 'active' ? 'active' : 'warning'}`}>
                                        {farm.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="flex items-center gap-2 text-secondary">
                                        <Ruler size={16} />
                                        <span>Diện tích: <strong>{farm.area_hectares} ha</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2 text-secondary">
                                        <Droplets size={16} />
                                        <span>Loại hình: <strong>{
                                            farm.farm_type === 'shrimp_rice' ? 'Tôm - Lúa luân canh' :
                                                farm.farm_type === 'shrimp_only' ? 'Chỉ nuôi Tôm' : 'Chỉ trồng Lúa'
                                        }</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2 text-secondary">
                                        <MapPin size={16} />
                                        <span>Trạng thái: <strong>{farm.status === 'active' ? 'Bình thường' : 'Cần kiểm tra'}</strong></span>
                                    </div>
                                </div>

                                <div className="farm-card-actions" style={{ marginTop: '2rem', display: 'flex', gap: '0.8rem' }}>
                                    <button
                                        className="primary"
                                        style={{ flex: 1, fontSize: '0.8rem' }}
                                        onClick={() => handleViewDetail(farm.id)}
                                    >
                                        {loadingDetail ? <Loader2 className="animate-spin" size={16} /> : 'Xem chi tiết'}
                                    </button>
                                    <button
                                        className="secondary"
                                        style={{ flex: 0, padding: '10px', color: '#ff4444' }}
                                        onClick={() => handleDelete(farm.id)}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                    <button className="secondary" style={{ flex: 0, padding: '10px' }}><Settings size={18} /></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {showModal && (
                <div className="farm-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(8px)', overflowY: 'auto', padding: '1rem' }}>
                    <div className="card glass-card farm-modal-panel" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', maxHeight: '92vh', overflowY: 'auto' }}>
                        <div className="flex justify-between items-center farm-modal-head" style={{ marginBottom: '2rem' }}>
                            <h2>Thêm trang trại</h2>
                            <button className="secondary" style={{ padding: '8px', borderRadius: '50%' }} onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '1.2rem' }}>
                                <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Tỉnh chủ chốt (tự điền vị trí)</label>
                                <select defaultValue="" onChange={(e) => applyProvinceToNewFarm(e.target.value)}>
                                    <option value="">Chọn nhanh tỉnh...</option>
                                    {KEY_PROVINCES.map((item) => (
                                        <option key={item.code} value={item.code}>{item.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '1.2rem' }}>
                                <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Mã trang trại (tuỳ chọn)</label>
                                <input
                                    placeholder="Ví dụ: FARM-BL-001"
                                    value={newFarm.farm_code}
                                    onChange={e => setNewFarm({ ...newFarm, farm_code: e.target.value })}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Tên trang trại / Lô đất</label>
                                <input
                                    placeholder="Ví dụ: Khu vực A1 - Cánh đồng Tây"
                                    value={newFarm.farm_name}
                                    onChange={e => setNewFarm({ ...newFarm, farm_name: e.target.value })}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Địa chỉ (tuỳ chọn)</label>
                                <input
                                    placeholder="Ví dụ: Xã A, Huyện B, Tỉnh C"
                                    value={newFarm.address}
                                    onChange={e => setNewFarm({ ...newFarm, address: e.target.value })}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Diện tích (Hécta)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="1.5"
                                    value={newFarm.area_hectares}
                                    onChange={e => setNewFarm({ ...newFarm, area_hectares: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="farm-form-grid" style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Vĩ độ (tuỳ chọn)</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        placeholder="10.123456"
                                        value={newFarm.latitude}
                                        onChange={e => setNewFarm({ ...newFarm, latitude: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Kinh độ (tuỳ chọn)</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        placeholder="105.123456"
                                        value={newFarm.longitude}
                                        onChange={e => setNewFarm({ ...newFarm, longitude: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '2.5rem' }}>
                                <label className="text-secondary" style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>Loại hình canh tác</label>
                                <select
                                    value={newFarm.farm_type}
                                    onChange={e => setNewFarm({ ...newFarm, farm_type: e.target.value })}
                                >
                                    <option value="shrimp_rice">Tôm - Lúa luân canh</option>
                                    <option value="shrimp_only">Chuyên nuôi Tôm</option>
                                    <option value="rice_only">Chuyên trồng Lúa</option>
                                </select>
                            </div>

                            <div className="farm-modal-actions" style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="secondary" onClick={() => setShowModal(false)} style={{ flex: 1 }}>Hủy bỏ</button>
                                <button type="submit" className="primary" style={{ flex: 1 }} disabled={submitting}>
                                    {submitting ? 'Đang tạo...' : 'Xác nhận tạo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Modal Chi tiết Trang trại */}
            {selectedFarm && (
                <div className="farm-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(8px)', overflowY: 'auto', padding: '1rem' }}>
                    <div className="card glass-card farm-modal-panel farm-detail-panel" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem', maxHeight: '92vh', overflowY: 'auto' }}>
                        <div className="flex justify-between items-center farm-modal-head" style={{ marginBottom: '2rem' }}>
                            <div>
                                <h2 style={{ marginBottom: '0.4rem' }}>{selectedFarm.farm_name}</h2>
                                <span className={`status-tag status-${selectedFarm.status === 'active' ? 'active' : 'warning'}`}>
                                    {selectedFarm.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}
                                </span>
                            </div>
                            <button className="secondary" style={{ padding: '8px', borderRadius: '50%' }} onClick={() => setSelectedFarm(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="farm-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div className="glass-card p-4">
                                <label className="text-secondary" style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>THÔNG TIN CHUNG</label>
                                <div style={{ fontSize: '0.9rem' }}>
                                    <p>Hệ thống: {selectedFarm.farm_type === 'shrimp_rice' ? 'Tôm - Lúa' : 'Chuyên canh'}</p>
                                    <p>Diện tích: {selectedFarm.area_hectares} Ha</p>
                                    <p>Vị trí: {selectedFarm.address || 'Chưa cập nhật'}</p>
                                </div>
                            </div>
                            <div className="glass-card p-4">
                                <label className="text-secondary" style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>THIẾT BỊ IOT</label>
                                {selectedFarm.iot_devices?.length > 0 ? (
                                    selectedFarm.iot_devices.map((d: any) => (
                                        <div key={d.id} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{d.device_name}</span>
                                            <span style={{ color: '#10b981' }}>● Online</span>
                                        </div>
                                    ))
                                ) : (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Chưa cấu hình thiết bị</p>
                                )}
                            </div>
                        </div>

                        <div className="card p-4" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: '2rem' }}>
                            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                                <h4 style={{ margin: 0 }}>Bản đồ vị trí</h4>
                                <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                    Click lên bản đồ để cập nhật tọa độ
                                </span>
                            </div>

                            <div style={{ marginBottom: '0.8rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                                <MapContainer
                                    center={hasValidLocation ? [locationLat, locationLng] : DEFAULT_CENTER}
                                    zoom={hasValidLocation ? 14 : 9}
                                    scrollWheelZoom={false}
                                    style={{ height: '260px', width: '100%' }}
                                >
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    />
                                    <LocationMarker
                                        position={hasValidLocation ? { lat: locationLat, lng: locationLng } : null}
                                        onChange={(next) =>
                                            setLocationForm({
                                                ...locationForm,
                                                latitude: next.lat.toFixed(6),
                                                longitude: next.lng.toFixed(6),
                                            })
                                        }
                                    />
                                </MapContainer>
                            </div>

                            <div className="farm-location-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem' }}>Vĩ độ</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        value={locationForm.latitude}
                                        onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                                        placeholder="9.294000"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem' }}>Kinh độ</label>
                                    <input
                                        type="number"
                                        step="0.000001"
                                        value={locationForm.longitude}
                                        onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                                        placeholder="105.721000"
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '0.8rem' }}>
                                <label style={{ fontSize: '0.75rem' }}>Tỉnh chủ chốt (tự điền)</label>
                                <select defaultValue="" onChange={(e) => applyProvinceToLocation(e.target.value)}>
                                    <option value="">Chọn nhanh tỉnh...</option>
                                    {KEY_PROVINCES.map((item) => (
                                        <option key={item.code} value={item.code}>{item.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '0.8rem' }}>
                                <label style={{ fontSize: '0.75rem' }}>Địa chỉ</label>
                                <input
                                    value={locationForm.address}
                                    onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                                    placeholder="Xã/Huyện/Tỉnh"
                                />
                            </div>

                            <div className="flex justify-end">
                                <button className="primary" type="button" onClick={handleSaveLocation} disabled={savingLocation}>
                                    {savingLocation ? 'Đang lưu vị trí...' : 'Lưu vị trí'}
                                </button>
                            </div>
                        </div>

                        <div className="card p-4" style={{ background: 'rgba(255,255,255,0.02)', marginBottom: '2rem' }}>
                            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                                <h4 style={{ margin: 0 }}>Mùa vụ hiện tại</h4>
                                {!showSeasonForm && (
                                    <button
                                        className="secondary"
                                        style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                        onClick={() => setShowSeasonForm(true)}
                                    >
                                        {currentSeason ? 'Đổi mùa vụ' : 'Thiết lập mùa'}
                                    </button>
                                )}
                            </div>

                            {showSeasonForm ? (
                                <form onSubmit={handleStartSeason}>
                                    <div className="farm-season-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>Loại hình</label>
                                            <select
                                                style={{ padding: '6px', fontSize: '0.8rem' }}
                                                value={seasonData.season_type}
                                                disabled={selectedFarmType === 'rice_only' || selectedFarmType === 'shrimp_only'}
                                                onChange={e => {
                                                    const seasonType = e.target.value;
                                                    setSeasonData({
                                                        ...seasonData,
                                                        season_type: seasonType,
                                                        variety: seasonType === 'rice'
                                                            ? RICE_PRESETS[0].variety
                                                            : SHRIMP_PRESETS[0].variety
                                                    });
                                                }}
                                            >
                                                {selectedFarmType !== 'shrimp_only' && <option value="rice">Trồng Lúa</option>}
                                                {selectedFarmType !== 'rice_only' && <option value="shrimp">Nuôi Tôm</option>}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>Giống</label>
                                            <select
                                                style={{ padding: '6px', fontSize: '0.8rem' }}
                                                value={seasonData.variety}
                                                onChange={e => setSeasonData({ ...seasonData, variety: e.target.value })}
                                                required
                                            >
                                                {seasonData.season_type === 'rice'
                                                    ? RICE_PRESETS.map((item) => (
                                                        <option key={item.variety} value={item.variety}>
                                                            {item.variety}
                                                        </option>
                                                    ))
                                                    : SHRIMP_PRESETS.map((item) => (
                                                        <option key={item.variety} value={item.variety}>
                                                            {item.label}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 farm-inline-actions">
                                        <button type="submit" className="primary" style={{ flex: 1, fontSize: '0.75rem' }} disabled={submitting}>Xác nhận</button>
                                        <button type="button" className="secondary" style={{ flex: 1, fontSize: '0.75rem' }} onClick={() => setShowSeasonForm(false)}>Hủy</button>
                                    </div>
                                </form>
                            ) : currentSeason ? (
                                <div style={{ fontSize: '0.85rem' }}>
                                    <p>Loại: <strong>{currentSeason.season_type === 'rice' ? '🌾 Lúa' : '🦐 Tôm'}</strong></p>
                                    <p>Giống: <strong>{currentSeason.variety}</strong></p>
                                    <p>Ngày bắt đầu: <strong>{new Date(currentSeason.start_date).toLocaleDateString('vi-VN')}</strong></p>
                                </div>
                            ) : (
                                <p className="text-secondary" style={{ fontSize: '0.85rem', textAlign: 'center' }}>Chưa thiết lập mùa vụ. Hãy thiết lập để nhận cảnh báo chính xác!</p>
                            )}
                        </div>

                        <div className="farm-modal-actions" style={{ display: 'flex', gap: '1rem' }}>
                            <button className="primary" style={{ flex: 1 }} onClick={openThresholdConfig}>Cấu hình ngưỡng cảnh báo</button>
                            <button className="secondary" onClick={() => setSelectedFarm(null)} style={{ flex: 0.5 }}>Đóng</button>
                        </div>
                    </div>
                </div>
            )}

            {showThresholdModal && selectedFarm && (
                <div className="farm-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, backdropFilter: 'blur(8px)', overflowY: 'auto', padding: '1rem' }}>
                    <div className="card glass-card farm-modal-panel farm-threshold-panel" style={{ width: '100%', maxWidth: '760px', padding: '2rem', maxHeight: '92vh', overflowY: 'auto' }}>
                        <div className="flex justify-between items-center farm-modal-head" style={{ marginBottom: '1.5rem' }}>
                            <div>
                                <h2 style={{ marginBottom: '0.4rem' }}>Cấu hình ngưỡng cảnh báo</h2>
                                <p className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                    Trang trại: <strong>{selectedFarm.farm_name}</strong>
                                </p>
                            </div>
                            <button className="secondary" style={{ padding: '8px', borderRadius: '50%' }} onClick={() => setShowThresholdModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        {thresholdLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                <Loader2 className="animate-spin" size={28} />
                            </div>
                        ) : (
                            <form onSubmit={handleSaveThresholdConfig}>
                                <div className="farm-threshold-grid" style={{ display: 'grid', gridTemplateColumns: allowsRiceConfig && allowsShrimpConfig ? '1fr 1fr' : '1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                                    {allowsRiceConfig && (
                                        <div>
                                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Giống lúa</label>
                                        <select
                                            value={alertConfig.rice_variety}
                                            onChange={(e) => applyRicePreset(e.target.value)}
                                        >
                                            {RICE_PRESETS.map((item) => (
                                                <option key={item.variety} value={item.variety}>{item.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    )}
                                    {allowsShrimpConfig && (
                                        <div>
                                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Giống tôm</label>
                                        <select
                                            value={alertConfig.shrimp_variety}
                                            onChange={(e) => applyShrimpPreset(e.target.value)}
                                        >
                                            {SHRIMP_PRESETS.map((item) => (
                                                <option key={item.variety} value={item.variety}>{item.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    )}
                                </div>

                                <div className="farm-threshold-grid" style={{ display: 'grid', gridTemplateColumns: allowsRiceConfig && allowsShrimpConfig ? '1fr 1fr' : '1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                                    {allowsRiceConfig && (
                                        <div className="glass-card p-4">
                                        <h4 style={{ marginTop: 0, marginBottom: '0.8rem' }}>Ngưỡng lúa (‰)</h4>
                                        <div className="farm-threshold-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Cảnh báo (max)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.rice_warning_max}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, rice_warning_max: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Nguy cấp (max)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.rice_critical_max}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, rice_critical_max: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    )}

                                    {allowsShrimpConfig && (
                                        <div className="glass-card p-4">
                                        <h4 style={{ marginTop: 0, marginBottom: '0.8rem' }}>Ngưỡng tôm (‰)</h4>
                                        <div className="farm-threshold-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Cảnh báo (min)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.shrimp_warning_min}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, shrimp_warning_min: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Cảnh báo (max)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.shrimp_warning_max}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, shrimp_warning_max: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Nguy cấp (min)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.shrimp_critical_min}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, shrimp_critical_min: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Nguy cấp (max)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.shrimp_critical_max}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, shrimp_critical_max: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="farm-threshold-inner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginTop: '0.8rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Tối ưu (min)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.shrimp_optimal_min}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, shrimp_optimal_min: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem' }}>Tối ưu (max)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={alertConfig.shrimp_optimal_max}
                                                    onChange={(e) => setAlertConfig({ ...alertConfig, shrimp_optimal_max: parseFloat(e.target.value) })}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    )}
                                </div>

                                <div className="farm-modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="secondary" onClick={() => setShowThresholdModal(false)}>
                                        Hủy
                                    </button>
                                    <button type="submit" className="primary" disabled={savingThreshold}>
                                        {savingThreshold ? 'Đang lưu...' : 'Lưu cấu hình'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
