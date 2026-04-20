// This script runs when MongoDB container is first initialized
db = db.getSiblingDB('ai-task-platform');

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });

db.tasks.createIndex({ userId: 1, createdAt: -1 });
db.tasks.createIndex({ status: 1, createdAt: 1 });
db.tasks.createIndex({ userId: 1, status: 1 });

print('MongoDB initialized: ai-task-platform database and indexes created');
