FROM python:3.14-slim AS base
WORKDIR /app

# Copy and install dependencies
COPY packages/signals/pyproject.toml packages/signals/
RUN pip install --no-cache-dir redis>=5.0.0 scikit-learn>=1.8.0

# Copy source
COPY packages/signals/src/ packages/signals/src/

WORKDIR /app/packages/signals
CMD ["python", "-m", "src"]
