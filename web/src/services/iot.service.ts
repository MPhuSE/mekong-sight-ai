import api from './api';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildTrainLikeReading = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const hour = now.getHours() + now.getMinutes() / 60;
    const isDrySeason = [12, 1, 2, 3, 4].includes(month);

    // Match AI1 train distribution (weather_province_daily.csv):
    // salinity ~ wet median 1.1, dry median 4.9, overall max ~7.6
    const salinityBase = isDrySeason ? 5.0 : 1.2;
    const salinity = clamp(salinityBase + (Math.random() - 0.5) * (isDrySeason ? 1.6 : 0.9), 0.2, 8.2);

    // temp train p10/p90 ~ 26.9/31.1 with daytime sinusoidal pattern
    const diurnal = Math.sin((hour / 24) * Math.PI * 2);
    const temperature = clamp(29 + diurnal * 1.1 + (Math.random() - 0.5) * 0.6, 26.0, 32.5);

    // pH train center around 7.47
    const ph = clamp(7.47 + (Math.random() - 0.5) * 0.22, 7.1, 7.85);

    // Extra telemetry for realism
    const waterLevel = clamp((isDrySeason ? 58 : 72) + (Math.random() - 0.5) * 12, 45, 90);
    const batteryVoltage = clamp(3.95 + (Math.random() - 0.5) * 0.18, 3.6, 4.2);

    return {
        salinity: salinity.toFixed(2),
        temperature: temperature.toFixed(2),
        ph: ph.toFixed(2),
        water_level: waterLevel.toFixed(1),
        battery_voltage: batteryVoltage.toFixed(2),
    };
};

export const iotService = {
    getReadings: async () => {
        const response = await api.get('/iot/readings');
        return response.data;
    },

    getReadingsHistory: async (farmId: string, days = 7, limit = 3000) => {
        const params = new URLSearchParams({
            farm_id: farmId,
            days: String(days),
            limit: String(limit),
        });
        const response = await api.get(`/iot/readings/history?${params.toString()}`);
        return response.data;
    },

    getDevices: async () => {
        // In a real app, this would be /iot/devices
        const response = await api.get('/iot/devices');
        return response.data;
    },

    registerDevice: async (deviceData: any) => {
        const response = await api.post('/iot/devices', deviceData);
        return response.data;
    },

    deleteDevice: async (id: string) => {
        const response = await api.delete(`/iot/devices/${id}`);
        return response.data;
    },

    simulateReading: async (deviceEui: string, overrides?: any) => {
        // Generate AI1-train-aligned data profile by default.
        const generated = buildTrainLikeReading();
        const data = {
            device_eui: deviceEui,
            ...generated,
            ...overrides
        };
        // Use ingest endpoint
        const response = await api.post('/iot/ingest', data);
        return response.data;
    },

    seedSimulatedHistory: async (deviceEui?: string, days = 7, intervalMinutes = 60) => {
        const response = await api.post('/iot/simulate/seed-history', {
            device_eui: deviceEui || undefined,
            days,
            interval_minutes: intervalMinutes,
        });
        return response.data;
    },
};
