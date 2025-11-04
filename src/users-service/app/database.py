import logging

from typing import Annotated
from sqlmodel import SQLModel, create_engine, Session # type: ignore

from fastapi import Depends
from app.config import DATABASE_URL

logger = logging.getLogger(__name__)
engine = create_engine(DATABASE_URL)

def init_db():
    logger.info("Initializing users-service database")
    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Users-service database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating users-service database tables: {e}")
        raise

def get_session():
    try:
        with Session(engine) as session:
            yield session
    except Exception as e:
        logger.error(f"Database session error: {e}")
        raise

SessionDep = Annotated[Session, Depends(get_session)]