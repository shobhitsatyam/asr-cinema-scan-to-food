const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { corsOrigin } = require('./config/env');
const seatRoutes = require('./routes/seats');
const menuRoutes = require('./routes/menu');

const app = express();

app.set('trust proxy', 1);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'asr-cinema-backend' });
});

app.use('/api', seatRoutes);
app.use('/api', menuRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong. Please try again.',
  });
});

module.exports = app;
