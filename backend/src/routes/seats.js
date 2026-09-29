const express = require('express');
const { resolveSeat, listSeats } = require('../controllers/seatController');

const router = express.Router();

router.get('/seats', listSeats);
router.get('/seats/resolve/:token', resolveSeat);

module.exports = router;
