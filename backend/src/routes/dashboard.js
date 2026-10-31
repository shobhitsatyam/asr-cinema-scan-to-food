const express = require('express');
const router = express.Router();
const { getDashboardStats, getAnalyticsReports } = require('../controllers/dashboardController');
const { requireAdminAuth } = require('../middleware/adminAuth');

router.get('/stats', requireAdminAuth, getDashboardStats);
router.get('/reports/analytics', requireAdminAuth, getAnalyticsReports);

module.exports = router;

