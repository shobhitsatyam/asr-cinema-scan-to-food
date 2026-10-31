const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { requireAdminAuth } = require('../middleware/adminAuth');

router.get('/', requireAdminAuth, getSettings);
router.put('/', requireAdminAuth, updateSettings);

module.exports = router;

