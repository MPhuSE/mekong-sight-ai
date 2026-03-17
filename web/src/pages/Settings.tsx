import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Save, Camera, Loader2, MapPin, Settings as SettingsIcon, Cpu, Navigation2 } from 'lucide-react';
import { getProfile, updateProfile } from '../services/user.service';
import { iotService } from '../services/iot.service';
import { aiService } from '../services/ai.service';

export const Settings: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('profile');
    const [devices, setDevices] = useState<any[]>([]);
    const [aiSupportedProvinces, setAiSupportedProvinces] = useState<string[]>([]);
    const [profile, setProfile] = useState<any>({
        full_name: '',
        email: '',
        phone_number: '',
        province: '',
        district: '',
        commune: '',
        address: '',
        latitude: '',
        longitude: '',
        language: 'vi',
        measurement_unit: 'metric',
        notification_enabled: true
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getProfile();
                if (data) {
                    setProfile({
                        ...profile,
                        ...data,
                        latitude: data.latitude || '',
                        longitude: data.longitude || ''
                    });
                }

                // Fetch devices
                const deviceData = await iotService.getDevices();
                // In a real app, we'd have /iot/devices
                setDevices(deviceData.data.map((r: any) => r.iot_devices).filter((v: any, i: any, a: any) => a.findIndex((t: any) => t.id === v.id) === i));

                // Fetch AI supported provinces (from model metadata)
                const metadataResp = await aiService.getModelMetadata();
                const provinces = (metadataResp?.data?.provinces || []).filter(Boolean);
                setAiSupportedProvinces(provinces);

            } catch (err) {
                console.error("Failed to fetch data:", err);
                const localUser = JSON.parse(localStorage.getItem('user') || '{}');
                setProfile((prev: any) => ({ ...prev, ...localUser }));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { phone_number, created_at, updated_at, id, ...updateData } = profile;
            const updated = await updateProfile(updateData);

            setProfile((prev: any) => ({ ...prev, ...updated }));

            // Sync with local storage
            const localUser = JSON.parse(localStorage.getItem('user') || '{}');
            localStorage.setItem('user', JSON.stringify({ ...localUser, ...updated }));

            alert('Đã cập nhật cấu hình thành công!');
        } catch (err) {
            console.error(err);
            alert('Lỗi khi cập nhật cấu hình');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
            <Loader2 className="animate-spin" size={40} color="var(--primary-glow)" />
        </div>
    );

    return (
        <div className="settings-page" style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="settings-page-head" style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ marginBottom: '0.5rem' }}>Cấu hình hệ thống</h1>
                <p className="text-secondary">Quản lý thông tin cá nhân, vùng nuôi và thiết bị của bạn.</p>
            </div>

            <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '2rem' }}>
                {/* Sidebar Settings */}
                <div className="card glass-card settings-sidebar" style={{ height: 'fit-content', padding: '1rem' }}>
                    <div
                        className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('profile')}
                    >
                        <User size={18} /> Hồ sơ cá nhân
                    </div>
                    <div
                        className={`nav-item ${activeTab === 'location' ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('location')}
                    >
                        <MapPin size={18} /> Địa lý & Vùng nuôi
                    </div>
                    <div
                        className={`nav-item ${activeTab === 'devices' ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('devices')}
                    >
                        <Cpu size={18} /> Thiết bị IoT
                    </div>
                    <div
                        className={`nav-item ${activeTab === 'preferences' ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('preferences')}
                    >
                        <SettingsIcon size={18} /> Tùy chỉnh ứng dụng
                    </div>
                    <div
                        className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('notifications')}
                    >
                        <Bell size={18} /> Thông báo
                    </div>
                    <div
                        className={`nav-item ${activeTab === 'security' ? 'active' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveTab('security')}
                    >
                        <Shield size={18} /> Bảo mật
                    </div>
                </div>

                {/* Content Area */}
                <div className="card glass-card settings-content" style={{ padding: '2.5rem' }}>
                    <form onSubmit={handleSave}>
                        {activeTab === 'profile' && (
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <h3 style={{ marginBottom: '2rem' }}>Hồ sơ cá nhân</h3>

                                <div className="flex items-center gap-6 settings-profile-top" style={{ marginBottom: '2.5rem' }}>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ width: 100, height: 100, borderRadius: '20px', background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 'bold' }}>
                                            {(profile.full_name || 'K').charAt(0)}
                                        </div>
                                        <button type="button" className="primary" style={{ position: 'absolute', bottom: '-10px', right: '-10px', padding: '8px', borderRadius: '50%' }}>
                                            <Camera size={16} />
                                        </button>
                                    </div>
                                    <div>
                                        <h4>Ảnh đại diện</h4>
                                        <p className="text-secondary" style={{ fontSize: '0.85rem' }}>Dung lượng tối đa 2MB. Định dạng: JPG, PNG</p>
                                    </div>
                                </div>

                                <div className="settings-form-grid settings-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Họ và tên</label>
                                        <input
                                            placeholder="Họ và tên"
                                            value={profile.full_name || ''}
                                            onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Số điện thoại</label>
                                        <input placeholder="Số điện thoại" value={profile.phone_number || ''} disabled />
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Email liên hệ</label>
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={profile.email || ''}
                                            onChange={e => setProfile({ ...profile, email: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'location' && (
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <h3 style={{ marginBottom: '2rem' }}>Địa lý & Vùng nuôi</h3>
                                <div className="settings-form-grid settings-form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Tỉnh / Thành phố</label>
                                        {aiSupportedProvinces.length > 0 ? (
                                            <select
                                                value={profile.province || ''}
                                                onChange={e => setProfile({ ...profile, province: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '12px', color: 'white' }}
                                            >
                                                <option value="">-- Chọn tỉnh --</option>
                                                {aiSupportedProvinces.map((prov) => (
                                                    <option key={prov} value={prov}>
                                                        {prov}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                placeholder="Tỉnh/Thành"
                                                value={profile.province || ''}
                                                onChange={e => setProfile({ ...profile, province: e.target.value })}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Quận / Huyện</label>
                                        <input
                                            placeholder="Quận/Huyện"
                                            value={profile.district || ''}
                                            onChange={e => setProfile({ ...profile, district: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Phường / Xã</label>
                                        <input
                                            placeholder="Phường/Xã"
                                            value={profile.commune || ''}
                                            onChange={e => setProfile({ ...profile, commune: e.target.value })}
                                        />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Địa chỉ chi tiết</label>
                                        <input
                                            placeholder="Số nhà, đường..."
                                            value={profile.address || ''}
                                            onChange={e => setProfile({ ...profile, address: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}><Navigation2 size={12} /> Vĩ độ (Latitude)</label>
                                        <input
                                            placeholder="Ví dụ: 9.1234"
                                            value={profile.latitude || ''}
                                            onChange={e => setProfile({ ...profile, latitude: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}><Navigation2 size={12} /> Kinh độ (Longitude)</label>
                                        <input
                                            placeholder="Ví dụ: 105.1234"
                                            value={profile.longitude || ''}
                                            onChange={e => setProfile({ ...profile, longitude: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'devices' && (
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <h3 style={{ marginBottom: '2rem' }}>Thiết bị IoT đang kết nối</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {devices.length === 0 ? (
                                        <div className="card" style={{ textAlign: 'center', padding: '2rem', background: 'rgba(255,255,255,0.02)' }}>
                                            <p className="text-secondary">Chưa tìm thấy thiết bị nào được gán cho tài khoản này.</p>
                                        </div>
                                    ) : (
                                        devices.map((device: any) => (
                                            <div key={device.id} className="card flex items-center justify-between" style={{ padding: '1.2rem', background: 'rgba(255,255,255,0.03)' }}>
                                                <div className="flex items-center gap-4">
                                                    <div style={{ padding: '10px', background: 'var(--primary-gradient)', borderRadius: '12px' }}>
                                                        <Cpu size={24} />
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 600 }}>{device.device_name}</p>
                                                        <p className="text-secondary" style={{ fontSize: '0.8rem' }}>EUI: {device.device_eui}</p>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span className="status-tag status-active">Đang kết nối</span>
                                                    <p className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '4px' }}>Hardware: {device.device_type}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    <button type="button" className="secondary" style={{ marginTop: '1rem', width: 'fit-content' }}>
                                        + Thêm thiết bị mới (Yêu cầu Admin)
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'preferences' && (
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <h3 style={{ marginBottom: '2rem' }}>Tùy chỉnh ứng dụng</h3>
                                <div className="settings-form-grid settings-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Ngôn ngữ hiển thị</label>
                                        <select
                                            value={profile.language || 'vi'}
                                            onChange={e => setProfile({ ...profile, language: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '12px', color: 'white' }}
                                        >
                                            <option value="vi">Tiếng Việt</option>
                                            <option value="en">English</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Đơn vị đo lường</label>
                                        <select
                                            value={profile.measurement_unit || 'metric'}
                                            onChange={e => setProfile({ ...profile, measurement_unit: e.target.value })}
                                            style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '12px', color: 'white' }}
                                        >
                                            <option value="metric">Hệ mét (Celsius, ha)</option>
                                            <option value="imperial">Hệ Mỹ (Fahrenheit, acre)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <h3 style={{ marginBottom: '2rem' }}>Cấu hình thông báo</h3>
                                <div className="flex items-center justify-between card glass-card" style={{ padding: '1.5rem' }}>
                                    <div>
                                        <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Nhận thông báo qua ứng dụng</p>
                                        <p className="text-secondary" style={{ fontSize: '0.85rem' }}>Nhận cảnh báo mặn và khuyến nghị AI thời gian thực.</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={profile.notification_enabled}
                                        onChange={e => setProfile({ ...profile, notification_enabled: e.target.checked })}
                                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
                            <button type="submit" className="primary" style={{ padding: '0.8rem 2.5rem' }} disabled={saving}>
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Lưu tất cả thay đổi
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
