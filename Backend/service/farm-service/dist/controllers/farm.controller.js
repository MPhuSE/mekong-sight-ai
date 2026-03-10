"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FarmController = void 0;
const shared_1 = require("@mekong/shared");
const shared_2 = require("@mekong/shared");
const RICE_PRESETS = [
    { variety: 'OM2517', warning_max: 4, critical_max: 6 },
    { variety: 'OM5451', warning_max: 4, critical_max: 6 },
    { variety: 'OM9577', warning_max: 6, critical_max: 8 },
    { variety: 'OM5464', warning_max: 6, critical_max: 8 },
    { variety: 'OM18', warning_max: 8, critical_max: 10 },
    { variety: 'OM429', warning_max: 8, critical_max: 10 },
    { variety: 'OM242', warning_max: 8, critical_max: 10 },
    { variety: 'ST24', warning_max: 4, critical_max: 6 },
    { variety: 'ST25', warning_max: 4, critical_max: 6 },
    { variety: 'MOT_BUI_DO', warning_max: 4, critical_max: 6 },
];
const SHRIMP_PRESETS = [
    {
        variety: 'TOM_SU',
        warning_min: 5,
        warning_max: 20,
        critical_min: 5,
        critical_max: 35,
        optimal_min: 10,
        optimal_max: 25,
    },
    {
        variety: 'TOM_THE_CHAN_TRANG',
        warning_min: 5,
        warning_max: 25,
        critical_min: 0.5,
        critical_max: 40,
        optimal_min: 10,
        optimal_max: 20,
    },
];
class FarmController {
    supabase = (0, shared_1.getSupabaseAdminClient)();
    parseCoordinates(latitude, longitude) {
        const hasLatitude = latitude !== undefined && latitude !== null && String(latitude).trim() !== '';
        const hasLongitude = longitude !== undefined && longitude !== null && String(longitude).trim() !== '';
        if (!hasLatitude && !hasLongitude)
            return null;
        if (hasLatitude !== hasLongitude) {
            throw new Error('Vui lòng cung cấp đầy đủ cả vĩ độ và kinh độ.');
        }
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
            throw new Error('Vĩ độ không hợp lệ (phải trong khoảng -90 đến 90).');
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
            throw new Error('Kinh độ không hợp lệ (phải trong khoảng -180 đến 180).');
        }
        return { lat, lng };
    }
    buildGeometryPolygon(lat, lng) {
        const d = 0.0001;
        return `POLYGON((${lng - d} ${lat - d}, ${lng + d} ${lat - d}, ${lng + d} ${lat + d}, ${lng - d} ${lat + d}, ${lng - d} ${lat - d}))`;
    }
    getDefaultThresholdConfig() {
        const rice = RICE_PRESETS.find((item) => item.variety === 'ST25') || RICE_PRESETS[0];
        const shrimp = SHRIMP_PRESETS.find((item) => item.variety === 'TOM_THE_CHAN_TRANG') || SHRIMP_PRESETS[0];
        return {
            rice_variety: rice.variety,
            shrimp_variety: shrimp.variety,
            rice_warning_max: rice.warning_max,
            rice_critical_max: rice.critical_max,
            shrimp_warning_min: shrimp.warning_min,
            shrimp_warning_max: shrimp.warning_max,
            shrimp_critical_min: shrimp.critical_min,
            shrimp_critical_max: shrimp.critical_max,
            shrimp_optimal_min: shrimp.optimal_min,
            shrimp_optimal_max: shrimp.optimal_max,
        };
    }
    normalizeThresholdPayload(payload, farmType) {
        const fallback = this.getDefaultThresholdConfig();
        const requiresRice = farmType !== 'shrimp_only';
        const requiresShrimp = farmType !== 'rice_only';
        const riceVariety = String(payload?.rice_variety || fallback.rice_variety).trim().toUpperCase();
        const shrimpVariety = String(payload?.shrimp_variety || fallback.shrimp_variety).trim().toUpperCase();
        const ricePreset = RICE_PRESETS.find((item) => item.variety === riceVariety);
        const shrimpPreset = SHRIMP_PRESETS.find((item) => item.variety === shrimpVariety);
        if (requiresRice && !ricePreset)
            throw new Error('Giống lúa không hợp lệ.');
        if (requiresShrimp && !shrimpPreset)
            throw new Error('Giống tôm không hợp lệ.');
        const num = (value, fallbackValue) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallbackValue;
        };
        const config = {
            rice_variety: (ricePreset || RICE_PRESETS[0]).variety,
            shrimp_variety: (shrimpPreset || SHRIMP_PRESETS[0]).variety,
            rice_warning_max: num(payload?.rice_warning_max, (ricePreset || RICE_PRESETS[0]).warning_max),
            rice_critical_max: num(payload?.rice_critical_max, (ricePreset || RICE_PRESETS[0]).critical_max),
            shrimp_warning_min: num(payload?.shrimp_warning_min, (shrimpPreset || SHRIMP_PRESETS[0]).warning_min),
            shrimp_warning_max: num(payload?.shrimp_warning_max, (shrimpPreset || SHRIMP_PRESETS[0]).warning_max),
            shrimp_critical_min: num(payload?.shrimp_critical_min, (shrimpPreset || SHRIMP_PRESETS[0]).critical_min),
            shrimp_critical_max: num(payload?.shrimp_critical_max, (shrimpPreset || SHRIMP_PRESETS[0]).critical_max),
            shrimp_optimal_min: num(payload?.shrimp_optimal_min, (shrimpPreset || SHRIMP_PRESETS[0]).optimal_min),
            shrimp_optimal_max: num(payload?.shrimp_optimal_max, (shrimpPreset || SHRIMP_PRESETS[0]).optimal_max),
        };
        if (requiresRice && config.rice_warning_max >= config.rice_critical_max) {
            throw new Error('Ngưỡng cảnh báo lúa phải nhỏ hơn ngưỡng nguy cấp.');
        }
        if (requiresShrimp && config.shrimp_warning_min >= config.shrimp_warning_max) {
            throw new Error('Ngưỡng cảnh báo tôm không hợp lệ.');
        }
        if (requiresShrimp && config.shrimp_critical_min >= config.shrimp_critical_max) {
            throw new Error('Ngưỡng nguy cấp tôm không hợp lệ.');
        }
        return config;
    }
    /**
     * Lấy danh sách trang trại của người dùng
     */
    async getMyFarms(req, res) {
        try {
            const userId = req.user.sub;
            const { data, error } = await this.supabase
                .from('farms')
                .select('*')
                .eq('user_id', userId);
            if (error)
                throw error;
            return res.json({ success: true, data });
        }
        catch (error) {
            shared_2.logger.error(`Get farms error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    /**
     * Lấy toàn bộ trang trại trong hệ thống (Dành cho Admin)
     */
    async getAllFarms(req, res) {
        try {
            const { data, error } = await this.supabase
                .from('farms')
                .select('*')
                .order('created_at', { ascending: false });
            if (error)
                throw error;
            return res.json({ success: true, data });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    /**
     * Tạo trang trại mới
     */
    async createFarm(req, res) {
        try {
            const userId = req.user.sub;
            const { farm_name, farm_type, area_hectares, farm_code, address, latitude, longitude } = req.body;
            const coords = this.parseCoordinates(latitude, longitude);
            const geometry = coords ? this.buildGeometryPolygon(coords.lat, coords.lng) : null;
            const { data, error } = await this.supabase
                .from('farms')
                .insert({
                user_id: userId,
                farm_name,
                farm_type,
                area_hectares,
                farm_code,
                address,
                status: 'active',
                geometry: geometry // Add geometry
            })
                .select()
                .single();
            if (error)
                throw error;
            return res.status(201).json({ success: true, data });
        }
        catch (error) {
            shared_2.logger.error(`Create farm error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    /**
     * Cập nhật thông tin trang trại (bao gồm vị trí)
     */
    async updateFarm(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.sub;
            const { farm_name, farm_type, area_hectares, farm_code, address, latitude, longitude, clear_geometry, } = req.body || {};
            const { data: farm, error: farmError } = await this.supabase
                .from('farms')
                .select('id, user_id')
                .eq('id', id)
                .single();
            if (farmError || !farm) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy trang trại.' });
            }
            if (farm.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật trang trại này.' });
            }
            const updateData = {};
            if (farm_name !== undefined)
                updateData.farm_name = String(farm_name).trim();
            if (farm_type !== undefined)
                updateData.farm_type = farm_type;
            if (area_hectares !== undefined)
                updateData.area_hectares = area_hectares;
            if (farm_code !== undefined)
                updateData.farm_code = farm_code ? String(farm_code).trim() : null;
            if (address !== undefined)
                updateData.address = address ? String(address).trim() : null;
            const coords = this.parseCoordinates(latitude, longitude);
            if (coords) {
                updateData.geometry = this.buildGeometryPolygon(coords.lat, coords.lng);
            }
            else if (clear_geometry === true) {
                updateData.geometry = null;
            }
            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({ success: false, message: 'Không có dữ liệu hợp lệ để cập nhật.' });
            }
            const { data, error } = await this.supabase
                .from('farms')
                .update({
                ...updateData,
                updated_at: new Date().toISOString(),
            })
                .eq('id', id)
                .select()
                .single();
            if (error)
                throw error;
            return res.json({ success: true, message: 'Đã cập nhật trang trại.', data });
        }
        catch (error) {
            shared_2.logger.error(`Update farm error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message || 'Không thể cập nhật trang trại.' });
        }
    }
    /**
     * Lấy chi tiết trang trại
     */
    async getFarmDetails(req, res) {
        try {
            const { id } = req.params;
            const { data, error } = await this.supabase
                .from('farms')
                .select('*, iot_devices(*)')
                .eq('id', id)
                .single();
            if (error)
                throw error;
            return res.json({ success: true, data });
        }
        catch (error) {
            return res.status(404).json({ success: false, message: 'Farm not found' });
        }
    }
    async getAlertConfig(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.sub;
            const { data: farm, error: farmError } = await this.supabase
                .from('farms')
                .select('id, user_id, farm_type')
                .eq('id', id)
                .single();
            if (farmError || !farm) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy trang trại.' });
            }
            if (farm.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập trang trại này.' });
            }
            const { data, error } = await this.supabase
                .from('farm_alert_configs')
                .select('*')
                .eq('farm_id', id)
                .maybeSingle();
            if (error && error.code !== '42P01')
                throw error;
            return res.json({
                success: true,
                data: {
                    farm_id: id,
                    farm_type: farm.farm_type,
                    ...(data || this.getDefaultThresholdConfig()),
                },
                options: {
                    rice_varieties: RICE_PRESETS,
                    shrimp_varieties: SHRIMP_PRESETS,
                },
            });
        }
        catch (error) {
            shared_2.logger.error(`Get alert config error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message || 'Không thể tải cấu hình ngưỡng.' });
        }
    }
    async updateAlertConfig(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.sub;
            const { data: farm, error: farmError } = await this.supabase
                .from('farms')
                .select('id, user_id, farm_type')
                .eq('id', id)
                .single();
            if (farmError || !farm) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy trang trại.' });
            }
            if (farm.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật trang trại này.' });
            }
            const normalized = this.normalizeThresholdPayload(req.body || {}, farm.farm_type);
            const { data, error } = await this.supabase
                .from('farm_alert_configs')
                .upsert({
                farm_id: id,
                ...normalized,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'farm_id' })
                .select()
                .single();
            if (error) {
                if (error.code === '42P01') {
                    return res.status(500).json({
                        success: false,
                        message: 'Thiếu bảng farm_alert_configs. Vui lòng tạo bảng trước khi lưu cấu hình.',
                    });
                }
                throw error;
            }
            return res.json({
                success: true,
                message: 'Đã cập nhật cấu hình ngưỡng cảnh báo.',
                data,
            });
        }
        catch (error) {
            shared_2.logger.error(`Update alert config error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message || 'Không thể lưu cấu hình ngưỡng.' });
        }
    }
    /**
     * Lấy danh sách cảnh báo của người dùng
     */
    async getAlerts(req, res) {
        try {
            const userId = req.user.sub;
            const { data, error } = await this.supabase
                .from('alerts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (error)
                throw error;
            return res.json({ success: true, data });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    /**
     * Xác nhận cảnh báo
     */
    async acknowledgeAlert(req, res) {
        try {
            const { id } = req.params;
            const { error } = await this.supabase
                .from('alerts')
                .update({
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString()
            })
                .eq('id', id);
            if (error)
                throw error;
            return res.json({ success: true });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    /**
     * Xóa trang trại
     */
    async deleteFarm(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.sub;
            const { data: farm, error: farmError } = await this.supabase
                .from('farms')
                .select('id, user_id')
                .eq('id', id)
                .single();
            if (farmError || !farm) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy trang trại.' });
            }
            if (farm.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa trang trại này.' });
            }
            const safeDeleteByFarm = async (table) => {
                const { error } = await this.supabase.from(table).delete().eq('farm_id', id);
                // Ignore missing optional tables across environments.
                if (error && error.code !== '42P01')
                    throw error;
            };
            // 1) Xóa dữ liệu phụ thuộc theo farm_id (nếu có)
            await safeDeleteByFarm('alerts');
            await safeDeleteByFarm('seasons');
            await safeDeleteByFarm('analysis_requests');
            await safeDeleteByFarm('season_recommendations');
            await safeDeleteByFarm('farm_alert_configs');
            // 2) Xóa readings theo device trước, rồi xóa devices
            const { data: devices, error: devicesError } = await this.supabase
                .from('iot_devices')
                .select('id')
                .eq('farm_id', id);
            if (devicesError)
                throw devicesError;
            if (devices && devices.length > 0) {
                const deviceIds = devices.map((d) => d.id);
                const { error: readingsError } = await this.supabase
                    .from('sensor_readings')
                    .delete()
                    .in('device_id', deviceIds);
                if (readingsError && readingsError.code !== '42P01')
                    throw readingsError;
            }
            const { error: deleteDevicesError } = await this.supabase
                .from('iot_devices')
                .delete()
                .eq('farm_id', id);
            if (deleteDevicesError)
                throw deleteDevicesError;
            // 3) Cuối cùng xóa farm
            const { error } = await this.supabase
                .from('farms')
                .delete()
                .eq('id', id);
            if (error)
                throw error;
            return res.json({ success: true, message: 'Đã xóa trang trại và dữ liệu liên quan.' });
        }
        catch (error) {
            shared_2.logger.error(`Delete farm error: ${error.message}`);
            if (error.code === '23503') {
                return res.status(409).json({
                    success: false,
                    message: 'Không thể xóa do còn dữ liệu liên kết. Vui lòng xóa dữ liệu liên quan trước.',
                });
            }
            return res.status(500).json({ success: false, message: error.message || 'Xóa trang trại thất bại.' });
        }
    }
    /**
     * Thiết lập mùa vụ mới
     */
    async startSeason(req, res) {
        try {
            const { farm_id, season_type, start_date, variety, expected_end_date } = req.body;
            // 1. Kết thúc các mùa vụ cũ của farm này (nếu có)
            await this.supabase
                .from('seasons')
                .update({ status: 'completed' })
                .eq('farm_id', farm_id)
                .eq('status', 'active');
            // 2. Tạo mùa vụ mới
            const { data, error } = await this.supabase
                .from('seasons')
                .insert({
                farm_id,
                season_type,
                start_date,
                variety,
                expected_end_date,
                status: 'active'
            })
                .select()
                .single();
            if (error)
                throw error;
            return res.status(201).json({ success: true, data });
        }
        catch (error) {
            shared_2.logger.error(`Start season error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
    }
    /**
     * Lấy mùa vụ hiện tại của trang trại
     */
    async getCurrentSeason(req, res) {
        try {
            const { farm_id } = req.params;
            const { data, error } = await this.supabase
                .from('seasons')
                .select('*')
                .eq('farm_id', farm_id)
                .eq('status', 'active')
                .single();
            if (error)
                return res.json({ success: true, data: null });
            return res.json({ success: true, data });
        }
        catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}
exports.FarmController = FarmController;
