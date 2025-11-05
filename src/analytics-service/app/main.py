import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.api.analytics import router as analytics_router
from app.api.admin import admin_router

from app.config import ALLOWED_ORIGINS
from app.core.rate_limiting import setup_rate_limiting

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting analytics-service...")
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
    yield
    logger.info("Shutting down analytics-service...")

app = FastAPI(
    title="Analytics service",
    version="1.0.2",
    root_path="/api/analytics",
    lifespan=lifespan
)

limiter = setup_rate_limiting(app)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],)

app.include_router(analytics_router, tags=["analytics"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])

@app.get("/")
def read_root():
    return {"message": "Analytics-service is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}