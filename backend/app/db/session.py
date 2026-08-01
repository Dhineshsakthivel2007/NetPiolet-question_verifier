"""Database session management."""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)

# Enable WAL mode and foreign keys for SQLite
if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables (for development without Alembic)."""
    from app.models.base import Base
    import app.models  # noqa: F401 — ensure all models are imported
    Base.metadata.create_all(bind=engine)

    # Ensure missing columns are added for SQLite databases
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as conn:
            cursor = conn.exec_driver_sql("PRAGMA table_info(users)")
            cols = [row[1] for row in cursor.fetchall()]
            if "roll_number" not in cols:
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN roll_number VARCHAR(50)")
            if "session_slot" not in cols:
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN session_slot VARCHAR(100)")
            if "level_id" not in cols:
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN level_id VARCHAR(36)")
            if "attendance" not in cols:
                conn.exec_driver_sql("ALTER TABLE users ADD COLUMN attendance VARCHAR(20) DEFAULT 'Absent'")
            # Fix existing NULL attendance rows
            conn.exec_driver_sql("UPDATE users SET attendance = 'Absent' WHERE attendance IS NULL AND role = 'student'")
            conn.exec_driver_sql("UPDATE users SET attendance = 'Present' WHERE role IN ('admin', 'professor')")
            conn.commit()
