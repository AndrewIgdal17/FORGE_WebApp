# --- Node build stage (React frontend) ---
FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

# --- Base image (pinned by digest) ---
# python:3.12-slim manifest list, Docker Hub tag digest looked up 2026-10-04.
FROM python:3.12-slim@sha256:02108f5d322dd89f1c9e552442c25acb0543dfdbc455693a5599624f20d9155d AS base

# --- Install uv (0.12.23, current release as of 2026-10-03) ---
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv

# forge-calc is a git dependency; uv will not fetch it without a git binary.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONUNBUFFERED=1

# --- Dependency layer (cached until uv.lock changes) ---
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# --- Application layer ---
COPY . .
COPY --from=frontend /frontend/dist /app/frontend/dist
RUN uv sync --frozen --no-dev

# --- Non-root user ---
# chown so `uv run` can lock the project env; the venv is created as root above.
RUN useradd --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["sh", "-c", "exec uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
