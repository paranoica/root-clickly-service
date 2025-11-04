import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import ALLOWED_ORIGINS
from app.database import init_db

from app.api import url, redirect, admin
from app.core.rate_limiting import setup_rate_limiting

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting URL-service...")
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
    logger.info("Shutting down URL-service...")

app = FastAPI(
    title="Clickly URL Shortener",
    version="1.0.6",
    root_path="/api/urls",
    lifespan=lifespan
)

limiter = setup_rate_limiting(app)

app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/")
async def root():
    return {"message": "Clickly URL Shortener Service is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

app.include_router(url.router, tags=["URLs"])
app.include_router(redirect.router, tags=["Redirect"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])