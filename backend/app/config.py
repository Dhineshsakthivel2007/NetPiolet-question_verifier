"""Application configuration using pydantic-settings."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Packet Tracer Auto Evaluator"
    app_version: str = "2.0.0"
    debug: bool = False

    # Database
    database_url: str = "postgresql+psycopg2://username:password@localhost:5432/netpiolet_db"

    # JWT Auth
    jwt_secret_key: str = "change-me-in-production-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 480

    # AI / Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # File Storage
    upload_dir: Path = Path("uploads")
    reports_dir: Path = Path("reports")

    # Base Directory
    base_dir: Path = Path(__file__).resolve().parent.parent

    # pka2xml Binary
    pka2xml_binary_path: str = str(Path(__file__).resolve().parent.parent.parent / "pka2xml" / "pka2xml")

    # CORS
    cors_origins: list[str] = ["*"]

    # Google OAuth
    google_client_id: str = ""
    allowed_email_domain: str = "bitsathy.ac.in"


settings = Settings()
