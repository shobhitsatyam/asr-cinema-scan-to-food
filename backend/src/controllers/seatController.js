const mongoose = require('mongoose');
const Seat = require('../models/Seat');
const { store } = require('../data/memoryStore');
const env = require('../config/env');

/**
 * GET /api/seats/resolve/:token
 * Customer QR endpoint: resolves a seat token into auditorium and physical seat details.
 * Fails closed in production for unknown or inactive seats.
 */
const resolveSeat = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ message: 'Seat token is required.', seat: null });
  }

  const normalizedToken = token.trim().toLowerCase();

  // 1. Query MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      const seatDoc = await Seat.findOne({
        token: normalizedToken,
      }).lean();

      if (seatDoc) {
        if (seatDoc.status !== 'active') {
          return res.status(404).json({
            message: `Seat ${seatDoc.seatNumber} in ${seatDoc.auditoriumName} is currently inactive or out of service.`,
            seat: null,
            status: 'inactive',
          });
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.json({
          seat: {
            _id: seatDoc._id,
            auditorium: seatDoc.auditoriumName,
            auditoriumId: seatDoc.auditoriumId || '',
            row: seatDoc.row || '',
            number: seatDoc.number || 0,
            seatNumber: seatDoc.seatNumber,
            section: seatDoc.section || 'Standard',
            token: seatDoc.token,
            status: seatDoc.status,
            isDemo: Boolean(seatDoc.isDemo),
          },
        });
      }
    } catch (err) {
      console.error('Database query error in resolveSeat:', err.message);
      if (env.nodeEnv === 'production') {
        return res.status(503).json({
          message: 'Database service is currently unavailable. Seat verification failed.',
          seat: null,
        });
      }
    }
  } else if (env.nodeEnv === 'production') {
    // Fail-closed in production: do not silently use in-memory records
    return res.status(503).json({
      message: 'Database service is currently unavailable. Seat verification failed.',
      seat: null,
    });
  }

  // If MongoDB is connected and seat was not found:
  // In production, fail closed with 404! Do NOT fall back to hardcoded demo seat or memory store.
  if (env.nodeEnv === 'production') {
    return res.status(404).json({
      message: 'Seat information could not be verified.',
      seat: null,
    });
  }

  // 2. Preserved customer demo seat: audi2-b16 (Development / test environments only)
  if (normalizedToken === 'audi2-b16') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      seat: {
        _id: 'demo-seat-audi2-b16',
        auditorium: 'Audi 2',
        auditoriumId: 'audi-2',
        row: 'B',
        number: 16,
        seatNumber: 'B16',
        section: 'VIP Recliner',
        token: 'audi2-b16',
        status: 'active',
        isDemo: true,
      },
    });
  }

  // 3. Development/demo in-memory fallback (Dev mode only)
  if (env.nodeEnv !== 'production') {
    const memSeat = store.seats.find((item) => item.token === normalizedToken);
    if (memSeat) {
      if (memSeat.status !== 'active') {
        return res.status(404).json({
          message: `Seat ${memSeat.seatNumber} in ${memSeat.auditoriumName} is currently inactive or out of service.`,
          seat: null,
          status: 'inactive',
        });
      }
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.json({
        seat: {
          _id: memSeat._id,
          auditorium: memSeat.auditoriumName,
          auditoriumId: memSeat.auditorium || '',
          row: memSeat.row || '',
          number: memSeat.number || 0,
          seatNumber: memSeat.seatNumber,
          section: memSeat.section || 'Standard',
          token: memSeat.token,
          status: memSeat.status,
          isDemo: Boolean(memSeat.isDemo),
        },
      });
    }
  }

  // 4. Invalid token: Return 404
  return res.status(404).json({
    message: 'Seat information could not be verified.',
    seat: null,
  });
};

/**
 * GET /api/seats
 * Public endpoint: returns list of active seats.
 */
const listSeats = async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    try {
      const dbSeats = await Seat.find({ status: 'active' }).lean();
      if (dbSeats.length > 0) {
        return res.json({ seats: dbSeats });
      }
    } catch (err) {
      console.error('Database error in listSeats:', err.message);
      if (env.nodeEnv === 'production') {
        return res.status(503).json({ message: 'Database service is currently unavailable.', seats: [] });
      }
    }
  }

  if (env.nodeEnv === 'production') {
    return res.status(503).json({ message: 'Database service is currently unavailable.', seats: [] });
  }

  const activeMemSeats = store.seats.filter((s) => s.status === 'active');
  res.json({ seats: activeMemSeats });
};

/**
 * GET /api/seats/admin
 * Protected endpoint for Admin Panel to list seats auditorium-wise with active/inactive status.
 */
const listAdminSeats = async (req, res) => {
  try {
    const { auditorium } = req.query;
    const filter = {};
    if (auditorium && auditorium !== 'All') {
      filter.auditoriumName = auditorium;
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const dbSeats = await Seat.find(filter).sort({ auditoriumName: 1, seatNumber: 1 }).lean();
        return res.json({
          success: true,
          count: dbSeats.length,
          seats: dbSeats,
        });
      } catch (err) {
        console.error('Database error in listAdminSeats:', err.message);
        if (env.nodeEnv === 'production') {
          return res.status(503).json({
            success: false,
            message: 'Database service is currently unavailable.',
            seats: [],
          });
        }
      }
    }

    if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
        seats: [],
      });
    }

    // Memory store fallback for development
    let memSeats = [...store.seats];
    if (auditorium && auditorium !== 'All') {
      memSeats = memSeats.filter((s) => s.auditoriumName === auditorium);
    }
    return res.json({
      success: true,
      count: memSeats.length,
      seats: memSeats,
    });
  } catch (error) {
    console.error('Error in listAdminSeats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin seats.',
      seats: [],
    });
  }
};

/**
 * PATCH /api/seats/:id/status
 * Protected endpoint to toggle or update seat active/inactive status.
 */
const updateSeatStatus = async (req, res) => {
  try {
    const rawId = req.params.id;
    const { status } = req.body;

    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Seat ID or token is required.' });
    }

    let nextStatus = status;
    if (nextStatus && !['active', 'inactive'].includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'active' or 'inactive'.",
      });
    }

    let updatedSeat = null;

    if (mongoose.connection.readyState === 1) {
      try {
        const query = mongoose.isValidObjectId(rawId)
          ? { _id: rawId }
          : { token: rawId.trim().toLowerCase() };
        const doc = await Seat.findOne(query);
        if (doc) {
          doc.status = nextStatus || (doc.status === 'active' ? 'inactive' : 'active');
          await doc.save();
          updatedSeat = doc.toObject();
        }
      } catch (err) {
        console.error('Database error in updateSeatStatus:', err.message);
        if (env.nodeEnv === 'production') {
          return res.status(500).json({ success: false, message: 'Database update failed.' });
        }
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    if (!updatedSeat && env.nodeEnv !== 'production') {
      const memSeat = store.seats.find(
        (s) => String(s._id) === rawId || s.token === rawId.trim().toLowerCase()
      );
      if (memSeat) {
        memSeat.status = nextStatus || (memSeat.status === 'active' ? 'inactive' : 'active');
        updatedSeat = memSeat;
      }
    }

    if (!updatedSeat) {
      return res.status(404).json({ success: false, message: `Seat '${rawId}' not found.` });
    }

    return res.json({
      success: true,
      message: `Seat ${updatedSeat.seatNumber} in ${updatedSeat.auditoriumName} status updated to '${updatedSeat.status}'.`,
      seat: updatedSeat,
    });
  } catch (error) {
    console.error('Error in updateSeatStatus:', error);
    return res.status(500).json({ success: false, message: 'Failed to update seat status.' });
  }
};

module.exports = {
  resolveSeat,
  listSeats,
  listAdminSeats,
  updateSeatStatus,
};
