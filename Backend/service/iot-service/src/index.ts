import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from '@mekong/shared';
import { IoTController } from './controllers/iot.controller';

const fastify = Fastify({
    logger: true
});
const iotController = new IoTController();

fastify.register(cors);

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
        logger.info(`IoT Service listening on ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
