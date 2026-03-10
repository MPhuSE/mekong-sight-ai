"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = exports.EventType = void 0;
const client_1 = require("../redis/client");
const logger_1 = require("../utils/logger");
var EventType;
(function (EventType) {
    EventType["USER_CREATED"] = "USER_CREATED";
    EventType["USER_UPDATED"] = "USER_UPDATED";
    EventType["FARM_UPDATED"] = "FARM_UPDATED";
    EventType["SENSOR_DATA_RECEIVED"] = "SENSOR_DATA_RECEIVED";
    EventType["ALERT_TRIGGERED"] = "ALERT_TRIGGERED";
    EventType["SEASON_RECOMMENDATION_READY"] = "SEASON_RECOMMENDATION_READY";
})(EventType || (exports.EventType = EventType = {}));
class EventBus {
    publisher = (0, client_1.getRedisClient)();
    subscriber = (0, client_1.getRedisClient)().duplicate();
    async publish(data) {
        try {
            await this.publisher.publish(data.type, JSON.stringify(data.data));
            logger_1.logger.info(`Event published: ${data.type}`, { payload: data.data, source: data.source });
        }
        catch (error) {
            logger_1.logger.error(`Error publishing event ${data.type}:`, error);
            throw error;
        }
    }
    async subscribe(event, callback) {
        try {
            await this.subscriber.subscribe(event);
            this.subscriber.on('message', async (channel, message) => {
                if (channel === event) {
                    try {
                        const payload = JSON.parse(message);
                        await callback(payload);
                    }
                    catch (err) {
                        logger_1.logger.error(`Error processing message for ${event}:`, err);
                    }
                }
            });
            logger_1.logger.info(`Subscribed to event: ${event}`);
        }
        catch (error) {
            logger_1.logger.error(`Error subscribing to event ${event}:`, error);
            throw error;
        }
    }
}
exports.EventBus = EventBus;
