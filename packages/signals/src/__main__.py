"""Signal worker entry point — run with: python -m src"""

import logging
import os
import time

from src.worker_loop import SignalWorker

logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

logger = logging.getLogger("sentinel.signals")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
POLL_INTERVAL = float(os.environ.get("SIGNAL_POLL_INTERVAL", "1.0"))


def main() -> None:
    logger.info("Starting signal worker (redis=%s, poll=%.1fs)", REDIS_URL, POLL_INTERVAL)
    worker = SignalWorker(redis_url=REDIS_URL)

    try:
        while True:
            signals = worker.process_batch()
            if signals:
                logger.info("Processed %d signals", len(signals))
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        logger.info("Shutting down signal worker")


if __name__ == "__main__":
    main()
