"""Application configuration"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""

    # Database
    db_user: str = os.getenv("DB_USER", "parksense_user")
    db_password: str = os.getenv("DB_PASSWORD", "parksense_password_123")
    db_name: str = os.getenv("DB_NAME", "parksense_db")
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "3306"))

    # API
    api_title: str = "ParkSense API"
    api_version: str = "1.0.0"
    debug: bool = os.getenv("DEBUG", "False") == "True"

    # CORS
    cors_origins: list = ["*"]

    @property
    def database_url(self) -> str:
        """Construct database URL for MySQL"""
        password = self.db_password.replace("@", "%40")  # Escape @ in password
        return (
            f"mysql+pymysql://{self.db_user}:{password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
