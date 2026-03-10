"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IoTController = void 0;
const shared_1 = require("@mekong/shared");
class IoTController {
    supabase = (0, shared_1.getSupabaseAdminClient)();
    eventBus = new shared_1.EventBus();
    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }
    hashString(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i += 1) {
            hash = (hash << 5) - hash + input.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
    buildTrainLikeSimulatedReading(timestamp, seed) {
        const month = timestamp.getMonth() + 1;
        const hour = timestamp.getHours() + timestamp.getMinutes() / 60;
        const isDrySeason = [12, 1, 2, 3, 4].includes(month);
        const dayWave = Math.sin((hour / 24) * Math.PI * 2);
        const bias = ((seed % 200) - 100) / 100; // -1..1
        const salinityBase = isDrySeason ? 5.0 : 1.2;
        const salinity = this.clamp(salinityBase + bias * 0.45 + dayWave * 0.35 + (Math.random() - 0.5) * (isDrySeason ? 0.8 : 0.45), 0.2, 8.5);
        const temperature = this.clamp(29 + dayWave * 1.1 + bias * 0.25 + (Math.random() - 0.5) * 0.55, 26.0, 32.8);
        const ph = this.clamp(7.47 + bias * 0.06 + (Math.random() - 0.5) * 0.2, 7.1, 7.85);
        const waterLevel = this.clamp((isDrySeason ? 58 : 72) + dayWave * 2.0 + bias * 2.5 + (Math.random() - 0.5) * 4.0, 45, 90);
        const batteryVoltage = this.clamp(4.05 - ((seed % 17) / 1000) - Math.random() * 0.1, 3.6, 4.2);
        return {
            salinity: Number(salinity.toFixed(2)),
            temperature: Number(temperature.toFixed(2)),
            ph: Number(ph.toFixed(2)),
            water_level: Number(waterLevel.toFixed(1)),
            battery_voltage: Number(batteryVoltage.toFixed(2)),
        };
    }
    /**
     * Ngưỡng dựa trên tài liệu domain user cung cấp:
     * - Lúa: trồng lúa 0-4‰; 4-6‰ bắt đầu stress; >6‰ nguy cấp.
     * - Tôm thẻ/chuyên tôm: phát triển tốt 5-25‰; ngoài vùng này cần cảnh báo.
     *   Mức chịu đựng rộng khoảng 0.5-40‰, dùng >35‰/<0.5‰ là critical.
     */
    async getFarmAlertConfig(farmId) {
        const { data, error } = await this.supabase
            .from('farm_alert_configs')
            .select('rice_warning_max, rice_critical_max, shrimp_warning_min, shrimp_warning_max, shrimp_critical_min, shrimp_critical_max, shrimp_optimal_min, shrimp_optimal_max')
            .eq('farm_id', farmId)
            .maybeSingle();
        if (error) {
            // Optional table in some envs.
            if (error.code === '42P01' || error.code === 'PGRST116')
                return null;
            throw error;
        }
        if (!data)
            return null;
        return {
            rice_warning_max: Number(data.rice_warning_max),
            rice_critical_max: Number(data.rice_critical_max),
            shrimp_warning_min: Number(data.shrimp_warning_min),
            shrimp_warning_max: Number(data.shrimp_warning_max),
            shrimp_critical_min: Number(data.shrimp_critical_min),
            shrimp_critical_max: Number(data.shrimp_critical_max),
            shrimp_optimal_min: Number(data.shrimp_optimal_min),
            shrimp_optimal_max: Number(data.shrimp_optimal_max),
        };
    }
    evaluateSalinityAlert(salinityValue, isRiceSeason, config) {
        const salinityText = salinityValue.toFixed(2);
        const riceWarningMax = config?.rice_warning_max ?? 4;
        const riceCriticalMax = config?.rice_critical_max ?? 6;
        const shrimpWarningMin = config?.shrimp_warning_min ?? 5;
        const shrimpWarningMax = config?.shrimp_warning_max ?? 25;
        const shrimpCriticalMin = config?.shrimp_critical_min ?? 0.5;
        const shrimpCriticalMax = config?.shrimp_critical_max ?? 35;
        const shrimpOptimalMin = config?.shrimp_optimal_min ?? 10;
        const shrimpOptimalMax = config?.shrimp_optimal_max ?? 20;
        if (isRiceSeason) {
            if (salinityValue > riceCriticalMax) {
                return {
                    shouldAlert: true,
                    severity: 'critical',
                    title: 'Mức độ nghiêm trọng: Độ mặn vượt ngưỡng nguy cấp cho lúa',
                    message: `Độ mặn hiện tại ${salinityText}‰ (vụ lúa), vượt ngưỡng nguy cấp ${riceCriticalMax.toFixed(2)}‰. Cần đóng cống ngăn mặn, ngừng lấy nước mặn vào ruộng và ưu tiên xả/rửa mặn sớm.`,
                };
            }
            if (salinityValue > riceWarningMax) {
                return {
                    shouldAlert: true,
                    severity: 'warning',
                    title: 'Cảnh báo: Độ mặn vượt ngưỡng an toàn cho lúa',
                    message: `Độ mặn hiện tại ${salinityText}‰ (vụ lúa), vượt ngưỡng an toàn ${riceWarningMax.toFixed(2)}‰ và đang trong vùng stress. Cần hạn chế lấy nước mặn và theo dõi sát trong 24 giờ tới.`,
                };
            }
            return {
                shouldAlert: false,
                severity: 'warning',
                title: '',
                message: '',
            };
        }
        // Shrimp phase / shrimp farm
        if (salinityValue < shrimpCriticalMin || salinityValue > shrimpCriticalMax) {
            return {
                shouldAlert: true,
                severity: 'critical',
                title: 'Mức độ nghiêm trọng: Độ mặn ngoài ngưỡng chịu đựng của tôm',
                message: `Độ mặn hiện tại ${salinityText}‰ (vụ tôm), nằm ngoài ngưỡng chịu đựng ${shrimpCriticalMin.toFixed(2)}-${shrimpCriticalMax.toFixed(2)}‰. Cần điều chỉnh cấp/thoát nước khẩn cấp để đưa độ mặn về vùng ${shrimpWarningMin.toFixed(2)}-${shrimpWarningMax.toFixed(2)}‰.`,
            };
        }
        if (salinityValue < shrimpWarningMin || salinityValue > shrimpWarningMax) {
            return {
                shouldAlert: true,
                severity: 'warning',
                title: 'Cảnh báo: Độ mặn lệch khỏi vùng phát triển tốt của tôm',
                message: `Độ mặn hiện tại ${salinityText}‰ (vụ tôm), nằm ngoài vùng phát triển tốt ${shrimpWarningMin.toFixed(2)}-${shrimpWarningMax.toFixed(2)}‰. Cần điều tiết nước để đưa hệ thống về vùng tối ưu ${shrimpOptimalMin.toFixed(2)}-${shrimpOptimalMax.toFixed(2)}‰ nếu có thể.`,
            };
        }
        return {
            shouldAlert: false,
            severity: 'warning',
            title: '',
            message: '',
        };
    }
    /**
     * Nhận dữ liệu sensor (Giả lập webhook từ LoRaWAN hoặc MQTT)
     */
    async handleReading(request, reply) {
        try {
            const { device_eui, salinity, temperature, ph, water_level, battery_voltage, timestamp, force_insert } = request.body;
            const salinityValue = Number(salinity);
            if (!Number.isFinite(salinityValue)) {
                return reply.status(400).send({ success: false, message: 'Invalid salinity value' });
            }
            let readingTimestamp;
            if (timestamp !== undefined && timestamp !== null && String(timestamp).trim() !== '') {
                const parsedTime = new Date(timestamp);
                if (Number.isNaN(parsedTime.getTime())) {
                    return reply.status(400).send({ success: false, message: 'Invalid timestamp value' });
                }
                readingTimestamp = parsedTime.toISOString();
            }
            // 1. Tìm thiết bị
            const { data: device, error: deviceError } = await this.supabase
                .from('iot_devices')
                .select('id, farm_id')
                .eq('device_eui', device_eui)
                .single();
            if (deviceError || !device) {
                return reply.status(404).send({ success: false, message: 'Device not found' });
            }
            // 2. Lưu kết quả đo (Smart Storage: Chỉ lưu khi thay đổi > ngưỡng hoặc sau 10p)
            const { data: latestReading } = await this.supabase
                .from('sensor_readings')
                .select('*')
                .eq('device_id', device.id)
                .order('timestamp', { ascending: false })
                .limit(1)
                .single();
            let shouldInsert = Boolean(force_insert);
            if (!latestReading) {
                shouldInsert = true;
            }
            else if (!shouldInsert) {
                // Ngưỡng thay đổi (Deadband)
                const TEMP_THRESHOLD = 0.5; // độ C
                const SALINITY_THRESHOLD = 0.2; // phần nghìn
                const PH_THRESHOLD = 0.2;
                // Tính độ lệch
                const deltaTemp = Math.abs(Number(temperature) - Number(latestReading.temperature));
                const deltaSal = Math.abs(Number(salinity) - Number(latestReading.salinity));
                const deltaPh = Math.abs(Number(ph) - Number(latestReading.ph));
                // Check Time (Heartbeat: 10 phút lưu 1 lần dù không đổi)
                const timeDiff = Date.now() - new Date(latestReading.timestamp).getTime();
                const isHeartbeat = timeDiff > 10 * 60 * 1000;
                if (deltaTemp > TEMP_THRESHOLD || deltaSal > SALINITY_THRESHOLD || deltaPh > PH_THRESHOLD || isHeartbeat) {
                    shouldInsert = true;
                }
            }
            if (shouldInsert) {
                const payload = {
                    device_id: device.id,
                    salinity,
                    temperature,
                    ph,
                    water_level,
                    battery_voltage
                };
                if (readingTimestamp)
                    payload.timestamp = readingTimestamp;
                const { error: insertError } = await this.supabase
                    .from('sensor_readings')
                    .insert(payload);
                if (insertError)
                    throw insertError;
            }
            else {
                // Nếu thay đổi nhỏ: Chỉ cập nhật Timestamp để báo "Device Online"
                // Giúp Dashboard vẫn hiển thị "Vừa cập nhật" mà không tốn Row DB
                const { error: updateError } = await this.supabase
                    .from('sensor_readings')
                    .update({ timestamp: readingTimestamp || new Date().toISOString() })
                    .eq('id', latestReading.id);
                if (updateError)
                    throw updateError;
            }
            // 3. Bắn event để AI hoặc Farm service xử lý tiếp
            await this.eventBus.publish({
                type: shared_1.EventType.SENSOR_DATA_RECEIVED,
                data: {
                    device_id: device.id,
                    farm_id: device.farm_id,
                    readings: { salinity, temperature, ph }
                },
                source: 'iot-service'
            });
            // 4. Lấy thông tin farm + mùa vụ để đánh giá ngưỡng đúng theo mô hình canh tác
            const { data: farm } = await this.supabase
                .from('farms')
                .select('user_id, farm_type')
                .eq('id', device.farm_id)
                .single();
            const { data: currentSeason } = await this.supabase
                .from('seasons')
                .select('season_type')
                .eq('farm_id', device.farm_id)
                .eq('status', 'active')
                .single();
            const isRiceSeason = farm?.farm_type === 'rice_only'
                ? true
                : farm?.farm_type === 'shrimp_only'
                    ? false
                    : currentSeason?.season_type === 'rice';
            const alertConfig = await this.getFarmAlertConfig(device.farm_id);
            const decision = this.evaluateSalinityAlert(salinityValue, isRiceSeason, alertConfig);
            if (decision.shouldAlert) {
                if (farm) {
                    await this.supabase.from('alerts').insert({
                        user_id: farm.user_id,
                        farm_id: device.farm_id,
                        alert_type: 'salinity_high',
                        severity: decision.severity,
                        title: decision.title,
                        message: decision.message,
                        status: 'active'
                    });
                }
                await this.eventBus.publish({
                    type: shared_1.EventType.ALERT_TRIGGERED,
                    data: {
                        farm_id: device.farm_id,
                        severity: decision.severity,
                        title: decision.title,
                        message: decision.message
                    },
                    source: 'iot-service'
                });
            }
            return { success: true };
        }
        catch (error) {
            shared_1.logger.error(`IoT Handle Error: ${error.message}`);
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
    /**
     * Lấy dữ liệu sensor mới nhất cho Dashboard
     */
    async getLatestReadings(request, reply) {
        try {
            const { data, error } = await this.supabase
                .from('sensor_readings')
                .select('*, iot_devices(device_name, farm_id)')
                .order('timestamp', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return { success: true, data };
        }
        catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
    /**
     * Lấy lịch sử cảm biến theo farm trong N ngày gần nhất
     */
    async getFarmReadingsHistory(request, reply) {
        try {
            const farmId = String(request.query?.farm_id || '').trim();
            if (!farmId) {
                return reply.status(400).send({ success: false, message: 'Thiếu farm_id.' });
            }
            const daysRaw = Number(request.query?.days ?? 7);
            const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, Math.round(daysRaw))) : 7;
            const limitRaw = Number(request.query?.limit ?? 3000);
            const limit = Number.isFinite(limitRaw) ? Math.max(100, Math.min(10000, Math.round(limitRaw))) : 3000;
            const { data: devices, error: devicesError } = await this.supabase
                .from('iot_devices')
                .select('id, device_name, farm_id')
                .eq('farm_id', farmId);
            if (devicesError)
                throw devicesError;
            const deviceRows = devices || [];
            if (deviceRows.length === 0) {
                return { success: true, data: [], meta: { farm_id: farmId, days, count: 0 } };
            }
            const deviceIds = deviceRows.map((item) => item.id);
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            const { data: readings, error: readingsError } = await this.supabase
                .from('sensor_readings')
                .select('id, device_id, salinity, temperature, ph, water_level, battery_voltage, timestamp')
                .in('device_id', deviceIds)
                .gte('timestamp', since)
                .order('timestamp', { ascending: true })
                .limit(limit);
            if (readingsError)
                throw readingsError;
            const deviceMap = new Map(deviceRows.map((item) => [item.id, item]));
            const enriched = (readings || []).map((row) => {
                const device = deviceMap.get(row.device_id);
                return {
                    ...row,
                    iot_devices: {
                        device_name: device?.device_name || 'Unknown',
                        farm_id: device?.farm_id || farmId,
                    }
                };
            });
            return {
                success: true,
                data: enriched,
                meta: {
                    farm_id: farmId,
                    days,
                    count: enriched.length
                }
            };
        }
        catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
    /**
     * Seed dữ liệu giả lập lịch sử N ngày để demo trực quan
     */
    async seedSimulatedHistory(request, reply) {
        try {
            const deviceEui = String(request.body?.device_eui || '').trim();
            const daysRaw = Number(request.body?.days ?? 7);
            const intervalRaw = Number(request.body?.interval_minutes ?? 60);
            const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, Math.round(daysRaw))) : 7;
            const intervalMinutes = Number.isFinite(intervalRaw) ? Math.max(15, Math.min(360, Math.round(intervalRaw))) : 60;
            let deviceQuery = this.supabase
                .from('iot_devices')
                .select('id, device_eui, farm_id');
            if (deviceEui) {
                deviceQuery = deviceQuery.eq('device_eui', deviceEui);
            }
            else {
                deviceQuery = deviceQuery.not('farm_id', 'is', null);
            }
            const { data: devices, error: devicesError } = await deviceQuery;
            if (devicesError)
                throw devicesError;
            const deviceRows = devices || [];
            if (deviceRows.length === 0) {
                return reply.status(404).send({ success: false, message: 'Không tìm thấy thiết bị để seed dữ liệu.' });
            }
            const now = new Date();
            const steps = Math.max(1, Math.floor((days * 24 * 60) / intervalMinutes));
            const allRows = [];
            for (const device of deviceRows) {
                const seed = this.hashString(String(device.device_eui || device.id));
                for (let step = steps; step >= 0; step -= 1) {
                    const ts = new Date(now.getTime() - step * intervalMinutes * 60 * 1000);
                    const reading = this.buildTrainLikeSimulatedReading(ts, seed);
                    allRows.push({
                        device_id: device.id,
                        ...reading,
                        timestamp: ts.toISOString(),
                    });
                }
            }
            const chunkSize = 500;
            for (let i = 0; i < allRows.length; i += chunkSize) {
                const chunk = allRows.slice(i, i + chunkSize);
                const { error: insertError } = await this.supabase
                    .from('sensor_readings')
                    .insert(chunk);
                if (insertError)
                    throw insertError;
            }
            return {
                success: true,
                message: `Đã seed ${allRows.length} bản ghi giả lập.`,
                data: {
                    devices: deviceRows.length,
                    days,
                    interval_minutes: intervalMinutes,
                    rows_inserted: allRows.length
                }
            };
        }
        catch (error) {
            shared_1.logger.error(`Seed simulated history error: ${error.message}`);
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
    /**
     * Lấy danh sách thiết bị
     */
    /**
     * Lấy danh sách thiết bị
     */
    async getDevices(request, reply) {
        try {
            const { data, error } = await this.supabase
                .from('iot_devices')
                .select('*, farms(farm_name)');
            if (error)
                throw error;
            return { success: true, data };
        }
        catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
    /**
     * Đăng ký thiết bị mới
     */
    async registerDevice(request, reply) {
        try {
            const { device_eui, device_name, device_type, farm_id, hardware_version, firmware_version } = request.body;
            const { data, error } = await this.supabase
                .from('iot_devices')
                .insert({
                device_eui,
                device_name,
                device_type,
                farm_id: farm_id === "" ? null : farm_id,
                hardware_version,
                firmware_version,
                status: 'active',
                battery_level: 100
            })
                .select()
                .single();
            if (error)
                throw error;
            return reply.status(201).send({ success: true, data });
        }
        catch (error) {
            shared_1.logger.error(`Register device error: ${error.message}`);
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
    /**
     * Xóa thiết bị
     */
    async deleteDevice(request, reply) {
        try {
            const { id } = request.params;
            if (!id) {
                return reply.status(400).send({ success: false, message: 'Thiếu id thiết bị.' });
            }
            // Xóa readings trước để tránh lỗi khóa ngoại nếu không có ON DELETE CASCADE.
            const { error: deleteReadingsError } = await this.supabase
                .from('sensor_readings')
                .delete()
                .eq('device_id', id);
            if (deleteReadingsError)
                throw deleteReadingsError;
            const { data, error } = await this.supabase
                .from('iot_devices')
                .delete()
                .eq('id', id)
                .select('id')
                .maybeSingle();
            if (error)
                throw error;
            if (!data) {
                return reply.status(404).send({ success: false, message: 'Không tìm thấy thiết bị.' });
            }
            return reply.send({ success: true, message: 'Đã xóa thiết bị.' });
        }
        catch (error) {
            shared_1.logger.error(`Delete device error: ${error.message}`);
            return reply.status(500).send({ success: false, message: error.message });
        }
    }
}
exports.IoTController = IoTController;
