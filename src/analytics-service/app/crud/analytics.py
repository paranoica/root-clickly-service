from sqlmodel import Session # type: ignore
from app.models.analytics import ClickEvent
import logging

logger = logging.getLogger(__name__)

def create_click_event(session: Session, click_data: dict) -> ClickEvent:
    try:
        click_event = ClickEvent(**click_data)

        session.add(click_event)

        session.commit()
        session.refresh(click_event)

        return click_event
    except Exception as e:
        logger.error(f"Error creating click event: {e}")
        session.rollback()
        
        raise