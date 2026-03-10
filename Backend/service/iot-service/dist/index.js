"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const shared_1 = require("@mekong/shared");
const iot_controller_1 = require("./controllers/iot.controller");
const fastify = (0, fastify_1.default)({
    logger: true
});
const iotController = new iot_controller_1.IoTController();
fastify.register(cors_1.default);
fastify.get('/health', async (request, reply) => {
    return { status: 'ok', service: 'iot-service' };
});
// Sensor ingestion route
fastify.post('/api/iot/ingest', (req, res) => iotController.handleReading(req, res));
fastify.get('/api/iot/readings', (req, res) => iotController.getLatestReadings(req, res));
fastify.get('/api/iot/readings/history', (req, res) => iotController.getFarmReadingsHistory(req, res));
fastify.post('/api/iot/simulate/seed-history', (req, res) => iotController.seedSimulatedHistory(req, res));
fastify.get('/api/iot/devices', (req, res) => iotController.getDevices(req, res));
fastify.post('/api/iot/devices', (req, res) => iotController.registerDevice(req, res));
fastify.delete('/api/iot/devices/:id', (req, res) => iotController.deleteDevice(req, res));
const start = async () => {
    try {
        const PORT = parseInt(process.env.PORT || '3002');
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        shared_1.logger.info(`IoT Service listening on ${PORT}`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
