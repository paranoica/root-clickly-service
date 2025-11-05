import logging
from sqlmodel import create_engine, SQLModel, Session # type: ignore

from typing import Annotated
from fastapi import Depends

from app.config import DATABASE_URL

logger = logging.getLogger(__name__)
engine = create_engine(DATABASE_URL)

def init_db():
    logger.info("Initializing analytics-service database")
    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Analytics-service database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating analytics-service database tables: {e}")
        raise

def get_session():
    try:
        with Session(engine) as session:
            yield session
    except Exception as e:
        logger.error(f"Database session error: {e}")
        raise

SessionDep = Annotated[Session, Depends(get_session)]