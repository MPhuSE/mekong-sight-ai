"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const farm_controller_1 = require("../controllers/farm.controller");
const shared_1 = require("@mekong/shared");
const router = (0, express_1.Router)();
const farmController = new farm_controller_1.FarmController();
router.get('/my', shared_1.authMiddleware, (req, res) => farmController.getMyFarms(req, res));
router.get('/all', shared_1.authMiddleware, (req, res) => farmController.getAllFarms(req, res));
router.post('/', shared_1.authMiddleware, (req, res) => farmController.createFarm(req, res));
router.get('/alerts/all', shared_1.authMiddleware, (req, res) => farmController.getAlerts(req, res));
router.put('/alerts/:id/acknowledge', shared_1.authMiddleware, (req, res) => farmController.acknowledgeAlert(req, res));
router.get('/:id/alert-config', shared_1.authMiddleware, (req, res) => farmController.getAlertConfig(req, res));
router.put('/:id/alert-config', shared_1.authMiddleware, (req, res) => farmController.updateAlertConfig(req, res));
// Seasons
router.post('/seasons/start', shared_1.authMiddleware, (req, res) => farmController.startSeason(req, res));
router.get('/:farm_id/seasons/current', shared_1.authMiddleware, (req, res) => farmController.getCurrentSeason(req, res));
// Generic id routes must be declared after specific routes
router.get('/:id', shared_1.authMiddleware, (req, res) => farmController.getFarmDetails(req, res));
router.put('/:id', shared_1.authMiddleware, (req, res) => farmController.updateFarm(req, res));
router.delete('/:id', shared_1.authMiddleware, (req, res) => farmController.deleteFarm(req, res));
exports.default = router;
