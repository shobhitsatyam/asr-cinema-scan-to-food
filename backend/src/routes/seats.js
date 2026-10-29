const express = require('express');
const {
  resolveSeat,
  listSeats,
  listAdminSeats,
  updateSeatStatus,
} = require('../controllers/seatController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.get('/seats', listSeats);
router.get('/seats/resolve/:token', resolveSeat);
router.get('/seats/admin', requireAdminAuth, listAdminSeats);
router.patch('/seats/:id/status', requireAdminAuth, updateSeatStatus);

module.exports = router;
