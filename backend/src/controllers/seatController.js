const { store } = require('../data/memoryStore');

const resolveSeat = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ message: 'Seat token is required.' });
  }

  const seat = store.seats.find((item) => item.token === token && item.status === 'active');

  if (!seat) {
    return res.status(404).json({
      message: 'Seat information could not be verified.',
      seat: null,
    });
  }

  return res.json({
    seat: {
      _id: seat._id,
      auditorium: seat.auditoriumName,
      seatNumber: seat.seatNumber,
      token: seat.token,
      status: seat.status,
    },
  });
};

const listSeats = async (req, res) => {
  res.json({ seats: store.seats });
};

module.exports = {
  resolveSeat,
  listSeats,
};
