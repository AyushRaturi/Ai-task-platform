const express = require('express');
const Joi = require('joi');
const Task = require('../models/Task');
const { getRedisClient } = require('../utils/redis');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const logger = require('../utils/logger');

const router = express.Router();

const createTaskSchema = Joi.object({
  title: Joi.string().trim().max(100).required(),
  inputText: Joi.string().max(10000).required(),
  operation: Joi.string().valid('uppercase', 'lowercase', 'reverse', 'word_count').required(),
});

// All task routes require auth
router.use(auth);

// GET /api/tasks — list user's tasks
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;
  const statusFilter = req.query.status;

  const query = { userId: req.user._id };
  if (statusFilter && Task.STATUSES.includes(statusFilter)) {
    query.status = statusFilter;
  }

  const [tasks, total] = await Promise.all([
    Task.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-logs'),
    Task.countDocuments(query),
  ]);

  res.json({
    tasks,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}));

// POST /api/tasks — create a task
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createTaskSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map((d) => d.message),
    });
  }

  const task = await Task.create({
    ...value,
    userId: req.user._id,
    status: 'pending',
    logs: [{ level: 'info', message: 'Task created, queued for processing' }],
  });

  // Push to Redis queue
  try {
    const redis = getRedisClient();
    await redis.lpush('task_queue', JSON.stringify({
      taskId: task._id.toString(),
      operation: task.operation,
      inputText: task.inputText,
    }));
    logger.info(`Task ${task._id} pushed to queue`);
  } catch (err) {
    logger.error(`Failed to push task ${task._id} to Redis: ${err.message}`);
    // Task is still created; worker can poll DB as fallback
  }

  res.status(201).json({ task });
}));

// GET /api/tasks/:id — get single task with logs
router.get('/:id', asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
}));

// DELETE /api/tasks/:id — delete task
router.delete('/:id', asyncHandler(async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ message: 'Task deleted' });
}));

// POST /api/tasks/:id/rerun — requeue a failed task
router.post('/:id/rerun', asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!['failed'].includes(task.status)) {
    return res.status(400).json({ error: 'Only failed tasks can be rerun' });
  }

  task.status = 'pending';
  task.result = null;
  task.errorMessage = null;
  task.startedAt = null;
  task.completedAt = null;
  task.logs.push({ level: 'info', message: 'Task requeued for processing' });
  await task.save();

  try {
    const redis = getRedisClient();
    await redis.lpush('task_queue', JSON.stringify({
      taskId: task._id.toString(),
      operation: task.operation,
      inputText: task.inputText,
    }));
  } catch (err) {
    logger.error(`Failed to requeue task ${task._id}: ${err.message}`);
  }

  res.json({ task });
}));

// Expose OPERATIONS and STATUSES for frontend
router.get('/meta/options', (req, res) => {
  res.json({
    operations: Task.OPERATIONS,
    statuses: Task.STATUSES,
  });
});

module.exports = router;
