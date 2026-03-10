"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceSchemas = exports.FarmSchemas = exports.AuthSchemas = void 0;
const joi_1 = __importDefault(require("joi"));
exports.AuthSchemas = {
    register: joi_1.default.object({
        phone_number: joi_1.default.string().pattern(/^[0-9]{10,11}$/).required(),
        full_name: joi_1.default.string().min(3).max(100).required(),
        role: joi_1.default.string().valid('admin', 'farmer', 'expert').default('farmer')
    }),
    login: joi_1.default.object({
        phone_number: joi_1.default.string().pattern(/^[0-9]{10,11}$/).required(),
        otp: joi_1.default.string().length(6).required()
    }),
    updateProfile: joi_1.default.object({
        full_name: joi_1.default.string().min(3).max(100),
        avatar_url: joi_1.default.string().uri().allow(null, '')
    })
};
exports.FarmSchemas = {
    create: joi_1.default.object({
        name: joi_1.default.string().required(),
        location: joi_1.default.object({
            latitude: joi_1.default.number().required(),
            longitude: joi_1.default.number().required()
        }).required(),
        size: joi_1.default.number().positive().required(),
        type: joi_1.default.string().valid('shrimp', 'rice', 'mixed').required()
    }),
    update: joi_1.default.object({
        name: joi_1.default.string(),
        size: joi_1.default.number().positive(),
        status: joi_1.default.string().valid('active', 'inactive')
    })
};
exports.DeviceSchemas = {
    register: joi_1.default.object({
        device_id: joi_1.default.string().required(),
        type: joi_1.default.string().valid('lorawan', 'wifi').required(),
        sensors: joi_1.default.array().items(joi_1.default.string()).min(1).required()
    })
};
