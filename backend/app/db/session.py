"""Database session management."""

from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)

# Enable WAL mode and foreign keys for SQLite
if engine.dialect.name == "sqlite":
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
    """Create all tables (for development without Alembic) and apply column migrations."""
    from app.models.base import Base
    import app.models  # noqa: F401 — ensure all models are imported
    Base.metadata.create_all(bind=engine)

    # Dialect-specific migrations for SQLite only
    if engine.dialect.name == "sqlite":
        with engine.connect() as conn:
            try:
                from sqlalchemy import text
                res = conn.execute(text("PRAGMA table_info(test_sessions)")).fetchall()
                cols = [r[1] for r in res]
                if "last_violation" not in cols:
                    conn.execute(text("ALTER TABLE test_sessions ADD COLUMN last_violation VARCHAR(255)"))
                    conn.commit()
            except Exception as e:
                print("Auto-migration notice:", e)

            try:
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
                conn.commit()
            except Exception as e:
                print("SQLite users migration notice:", e)

    # Seed initial default admin user if no admin exists
    db = SessionLocal()
    try:
        from app.models.user import User, UserRole
        from app.services.auth_service import hash_password
        admin_user = db.query(User).filter(User.role == UserRole.admin).first()
        if not admin_user:
            default_admin = User(
                username="admin",
                email="admin@netpilot.local",
                hashed_password=hash_password("admin123"),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(default_admin)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
