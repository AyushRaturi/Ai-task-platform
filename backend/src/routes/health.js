const express = require('express');
const mongoose = require('mongoose');
const { getRedisClient } = require('../utils/redis');

const router = express.Router();

router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: 'unknown',
      redis: 'unknown',
    },
  };

  // MongoDB check
  try {
    if (mongoose.connection.readyState === 1) {
      health.services.mongodb = 'ok';
    } else {
      health.services.mongodb = 'degraded';
      health.status = 'degraded';
    }
  } catch {
    health.services.mongodb = 'error';
    health.status = 'degraded';
  }

  // Redis check
  try {
    const redis = getRedisClient();
    await redis.ping();
    health.services.redis = 'ok';
  } catch {
    health.services.redis = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/ready', (req, res) => {
  if (mongoose.connection.readyState === 1) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

module.exports = router;
