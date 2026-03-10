import { Router } from 'express';
import { FarmController } from '../controllers/farm.controller';
import { authMiddleware } from '@mekong/shared';

const router = Router();
const farmController = new FarmController();

router.get('/my', authMiddleware, (req, res) => farmController.getMyFarms(req, res));
router.get('/all', authMiddleware, (req, res) => farmController.getAllFarms(req, res));
router.post('/', authMiddleware, (req, res) => farmController.createFarm(req, res));
router.get('/alerts/all', authMiddleware, (req, res) => farmController.getAlerts(req, res));
router.put('/alerts/:id/acknowledge', authMiddleware, (req, res) => farmController.acknowledgeAlert(req, res));
router.get('/:id/alert-config', authMiddleware, (req, res) => farmController.getAlertConfig(req, res));
router.put('/:id/alert-config', authMiddleware, (req, res) => farmController.updateAlertConfig(req, res));

// Seasons
router.post('/seasons/start', authMiddleware, (req, res) => farmController.startSeason(req, res));
router.get('/:farm_id/seasons/current', authMiddleware, (req, res) => farmController.getCurrentSeason(req, res));

// Generic id routes must be declared after specific routes
router.get('/:id', authMiddleware, (req, res) => farmController.getFarmDetails(req, res));
router.put('/:id', authMiddleware, (req, res) => farmController.updateFarm(req, res));
router.delete('/:id', authMiddleware, (req, res) => farmController.deleteFarm(req, res));

export default router;
