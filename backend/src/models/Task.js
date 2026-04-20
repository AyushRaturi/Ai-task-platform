const mongoose = require('mongoose');

const OPERATIONS = ['uppercase', 'lowercase', 'reverse', 'word_count'];
const STATUSES = ['pending', 'running', 'success', 'failed'];

const logEntrySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  message: { type: String, required: true },
}, { _id: false });

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title must be at most 100 characters'],
  },
  inputText: {
    type: String,
    required: [true, 'Input text is required'],
    maxlength: [10000, 'Input text must be at most 10000 characters'],
  },
  operation: {
    type: String,
    required: [true, 'Operation is required'],
    enum: { values: OPERATIONS, message: 'Invalid operation' },
  },
  status: {
    type: String,
    enum: STATUSES,
    default: 'pending',
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  logs: {
    type: [logEntrySchema],
    default: [],
  },
  errorMessage: {
    type: String,
    default: null,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

// Indexes for query performance
taskSchema.index({ userId: 1, createdAt: -1 });
taskSchema.index({ status: 1, createdAt: 1 });
taskSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);
module.exports.OPERATIONS = OPERATIONS;
module.exports.STATUSES = STATUSES;
