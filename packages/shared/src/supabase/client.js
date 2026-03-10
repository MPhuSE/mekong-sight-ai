"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseClient = exports.getSupabaseAdminClient = exports.getSupabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
let supabaseInstance = null;
const getSupabaseClient = () => {
    if (!supabaseInstance) {
        if (!config_1.config.supabase.url || !config_1.config.supabase.key) {
            throw new Error('Supabase URL and Key must be provided');
        }
        supabaseInstance = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.key);
    }
    return supabaseInstance;
};
exports.getSupabaseClient = getSupabaseClient;
let supabaseAdminInstance = null;
const getSupabaseAdminClient = () => {
    if (!supabaseAdminInstance) {
        if (!config_1.config.supabase.url || !config_1.config.supabase.serviceKey) {
            throw new Error('Supabase URL and Service Key must be provided for Admin Client: ' + config_1.config.supabase.serviceKey);
        }
        supabaseAdminInstance = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    }
    return supabaseAdminInstance;
};
exports.getSupabaseAdminClient = getSupabaseAdminClient;
exports.createSupabaseClient = exports.getSupabaseClient;
