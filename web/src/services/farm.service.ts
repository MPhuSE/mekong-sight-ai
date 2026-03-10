import api from './api';

export const farmService = {
    getMyFarms: async () => {
        const response = await api.get('/farms/my');
        return response.data;
    },

    getAllFarms: async () => {
        const response = await api.get('/farms/all');
        return response.data;
    },

    getFarmById: async (id: string) => {
        const response = await api.get(`/farms/${id}`);
        return response.data;
    },

    createFarm: async (farmData: any) => {
        const response = await api.post('/farms', farmData);
        return response.data;
    },

    updateFarm: async (id: string, farmData: any) => {
        const response = await api.put(`/farms/${id}`, farmData);
        return response.data;
    },

    deleteFarm: async (id: string) => {
        const response = await api.delete(`/farms/${id}`);
        return response.data;
    },

    getCurrentSeason: async (farmId: string) => {
        const response = await api.get(`/farms/${farmId}/seasons/current`);
        return response.data;
    },

    startSeason: async (seasonData: any) => {
        const response = await api.post('/farms/seasons/start', seasonData);
        return response.data;
    },

    getAlertConfig: async (farmId: string) => {
        const response = await api.get(`/farms/${farmId}/alert-config`);
        return response.data;
    },

    updateAlertConfig: async (farmId: string, config: any) => {
        const response = await api.put(`/farms/${farmId}/alert-config`, config);
        return response.data;
    },

    getAlerts: async () => {
        const response = await api.get('/farms/alerts/all');
        return response.data;
    },

    acknowledgeAlert: async (id: string) => {
        const response = await api.put(`/farms/alerts/${id}/acknowledge`);
        return response.data;
    }
};
