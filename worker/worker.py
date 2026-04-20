"""
AI Task Worker - Processes tasks from Redis queue and updates MongoDB.
Supports: uppercase, lowercase, reverse, word_count operations.
"""

import json
import os
import signal
import sys
import time
from datetime import datetime, timezone

import redis
import structlog
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

load_dotenv()

# ─── Logging ────────────────────────────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer() if os.getenv("NODE_ENV") == "production"
        else structlog.dev.ConsoleRenderer(),
    ]
)
log = structlog.get_logger()

# ─── Configuration ───────────────────────────────────────────────────────────

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/ai-task-platform")
QUEUE_NAME = "task_queue"
DEAD_LETTER_QUEUE = "task_queue_dead"
QUEUE_TIMEOUT = 5  # seconds to block on BRPOP
MAX_TASK_RETRIES = 3
WORKER_ID = os.getenv("HOSTNAME", f"worker-{os.getpid()}")

# ─── Graceful shutdown ───────────────────────────────────────────────────────

_shutdown = False


def handle_signal(signum, frame):
    global _shutdown
    log.info("Shutdown signal received", signal=signum)
    _shutdown = True


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

# ─── Operations ──────────────────────────────────────────────────────────────


def process_operation(operation: str, input_text: str) -> dict:
    """Execute the requested operation on input_text."""
    op = operation.lower()
    logs = []

    logs.append({"level": "info", "message": f"Starting operation: {op}", "timestamp": _now()})

    if op == "uppercase":
        result = input_text.upper()
        logs.append({"level": "info", "message": f"Converted {len(input_text)} characters to uppercase", "timestamp": _now()})

    elif op == "lowercase":
        result = input_text.lower()
        logs.append({"level": "info", "message": f"Converted {len(input_text)} characters to lowercase", "timestamp": _now()})

    elif op == "reverse":
        result = input_text[::-1]
        logs.append({"level": "info", "message": f"Reversed string of {len(input_text)} characters", "timestamp": _now()})

    elif op == "word_count":
        words = input_text.split()
        word_freq = {}
        for word in words:
            clean = word.strip(".,!?;:\"'").lower()
            if clean:
                word_freq[clean] = word_freq.get(clean, 0) + 1

        result = {
            "total_words": len(words),
            "unique_words": len(word_freq),
            "character_count": len(input_text),
            "character_count_no_spaces": len(input_text.replace(" ", "")),
            "sentence_count": input_text.count(".") + input_text.count("!") + input_text.count("?"),
            "top_words": dict(sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]),
        }
        logs.append({
            "level": "info",
            "message": f"Counted {len(words)} words, {len(word_freq)} unique",
            "timestamp": _now(),
        })
    else:
        raise ValueError(f"Unknown operation: {operation}")

    logs.append({"level": "info", "message": "Operation completed successfully", "timestamp": _now()})
    return {"result": result, "logs": logs}


def _now():
    return datetime.now(timezone.utc).isoformat()


# ─── Database & Queue ─────────────────────────────────────────────────────────


@retry(
    retry=retry_if_exception_type(ConnectionFailure),
    stop=stop_after_attempt(10),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    before_sleep=lambda rs: log.warning("Retrying MongoDB connection", attempt=rs.attempt_number),
)
def get_mongo_collection():
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client.get_default_database()
    return db["tasks"]


@retry(
    retry=retry_if_exception_type(redis.exceptions.ConnectionError),
    stop=stop_after_attempt(10),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    before_sleep=lambda rs: log.warning("Retrying Redis connection", attempt=rs.attempt_number),
)
def get_redis_client():
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    r.ping()
    return r


# ─── Task Processing ─────────────────────────────────────────────────────────


def process_task(tasks_col, task_id: str, operation: str, input_text: str):
    from bson import ObjectId

    log.info("Processing task", task_id=task_id, operation=operation, worker=WORKER_ID)

    # Mark as running
    tasks_col.update_one(
        {"_id": ObjectId(task_id), "status": "pending"},
        {
            "$set": {
                "status": "running",
                "startedAt": datetime.now(timezone.utc),
            },
            "$push": {
                "logs": {
                    "level": "info",
                    "message": f"Picked up by worker {WORKER_ID}",
                    "timestamp": datetime.now(timezone.utc),
                }
            },
        },
    )

    try:
        output = process_operation(operation, input_text)

        tasks_col.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {
                    "status": "success",
                    "result": output["result"],
                    "completedAt": datetime.now(timezone.utc),
                },
                "$push": {
                    "logs": {
                        "$each": output["logs"],
                    }
                },
            },
        )
        log.info("Task completed", task_id=task_id, status="success")

    except Exception as exc:
        error_msg = str(exc)
        log.error("Task failed", task_id=task_id, error=error_msg)
        tasks_col.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {
                    "status": "failed",
                    "errorMessage": error_msg,
                    "completedAt": datetime.now(timezone.utc),
                },
                "$push": {
                    "logs": {
                        "level": "error",
                        "message": f"Task failed: {error_msg}",
                        "timestamp": datetime.now(timezone.utc),
                    }
                },
            },
        )


# ─── Main Loop ────────────────────────────────────────────────────────────────


def main():
    log.info("Worker starting", worker_id=WORKER_ID)

    log.info("Connecting to MongoDB...")
    tasks_col = get_mongo_collection()
    log.info("MongoDB connected")

    log.info("Connecting to Redis...")
    r = get_redis_client()
    log.info("Redis connected")

    log.info("Worker ready, listening on queue", queue=QUEUE_NAME)

    while not _shutdown:
        try:
            # Blocking pop with timeout so we can check _shutdown
            result = r.brpop(QUEUE_NAME, timeout=QUEUE_TIMEOUT)

            if result is None:
                continue  # Timeout, loop and check _shutdown

            _, raw = result
            payload = json.loads(raw)

            task_id = payload.get("taskId")
            operation = payload.get("operation")
            input_text = payload.get("inputText", "")

            if not task_id or not operation:
                log.warning("Invalid payload, skipping", payload=payload)
                continue

            process_task(tasks_col, task_id, operation, input_text)

        except redis.exceptions.ConnectionError as e:
            log.error("Redis connection lost, reconnecting...", error=str(e))
            time.sleep(2)
            try:
                r = get_redis_client()
            except Exception:
                log.error("Failed to reconnect to Redis")
                time.sleep(5)

        except Exception as e:
            log.error("Unexpected error in worker loop", error=str(e))
            time.sleep(1)

    log.info("Worker shutting down gracefully", worker_id=WORKER_ID)
    sys.exit(0)


if __name__ == "__main__":
    main()
