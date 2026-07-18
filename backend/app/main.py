"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    logger.info("Starting %s v%s", settings.app_name, settings.app_version)

    # Discover and register all validators
    from app.validators.registry import discover_validators
    registry = discover_validators()
    logger.info("Registered %d validators", len(registry))

    # Create database tables (dev mode, SQLite)
    from app.db.session import create_tables
    create_tables()
    logger.info("Database tables ready")

    # Ensure upload/report directories exist
    (settings.upload_dir / "pkt").mkdir(parents=True, exist_ok=True)
    (settings.upload_dir / "xml").mkdir(parents=True, exist_ok=True)
    settings.reports_dir.mkdir(parents=True, exist_ok=True)

    yield

    # Shutdown
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered Cisco Packet Tracer lab auto-evaluation system",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router)


@app.get("/api/health", tags=["Health"])
def health_check():
    """Health check endpoint."""
    from app.validators.base import get_registry
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "validators_loaded": len(get_registry()),
    }
