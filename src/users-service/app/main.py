import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.config import ALLOWED_ORIGINS

from app.api.users import router
from app.api.admin import router as admin_router
from app.core.rate_limiting import setup_rate_limiting

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting users-service...")
    try:
        init_db()
        logger.info("Users database initialized successfully")
    except Exception as e:
        logger.error(f"Users database initialization failed: {e}")
        raise
    yield
    logger.info("Shutting down users-service...")

app = FastAPI(
    title="Clickly user-service",
    version="1.0.4",
    root_path="/api/users",
    lifespan=lifespan
)

limiter = setup_rate_limiting(app)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(router, tags=["users"])
app.include_router(admin_router, tags=["admin"])

@app.get("/")
def root():
    return {"message": "Clickly user-service is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}