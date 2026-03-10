"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Try to load .env from project root (3 levels up from this file's compiled location in dist/)
// Adjust based on where this file ends up. 
// Source: packages/shared/src/config/index.ts
// Compiled: packages/shared/dist/config/index.js
// Root is at: ../../../
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../../.env') });
// Also try default for good measure
dotenv_1.default.config();
exports.config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'super-secret-key',
        expiresIn: '7d'
    }
};
