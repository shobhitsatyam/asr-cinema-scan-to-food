const express = require('express');
const {
  getCombos,
  createCombo,
  updateCombo,
  toggleComboAvailability,
  deleteCombo,
} = require('../controllers/comboController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.get('/', getCombos);
router.post('/', requireAdminAuth, createCombo);
router.patch('/:id', requireAdminAuth, updateCombo);
router.put('/:id', requireAdminAuth, updateCombo);
router.patch('/:id/availability', requireAdminAuth, toggleComboAvailability);
router.delete('/:id', requireAdminAuth, deleteCombo);

module.exports = router;

