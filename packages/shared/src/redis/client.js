"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
let redisInstance = null;
const getRedisClient = () => {
    if (!redisInstance) {
        redisInstance = new ioredis_1.default({
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });
        redisInstance.on('error', (err) => {
            logger_1.logger.error('Redis Client Error', err);
        });
        redisInstance.on('connect', () => {
            logger_1.logger.info('Redis Client Connected');
        });
    }
    return redisInstance;
};
exports.getRedisClient = getRedisClient;
