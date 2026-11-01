"""
GRID LOCK — Backend Configuration & Settings

Reads environment variables and .env file using pydantic-settings.
Provides provider configuration, timeouts, token limits, and credential checks.
"""

from typing import List, Literal, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Provider selection
    LLM_PROVIDER: Literal["gemini", "openai"] = Field(
        default="gemini",
        description="Active LLM provider: 'gemini' or 'openai'",
    )

    # API Keys
    GEMINI_API_KEY: Optional[str] = Field(
        default=None,
        description="Google Gemini API key",
    )
    OPENAI_API_KEY: Optional[str] = Field(
        default=None,
        description="OpenAI API key",
    )

    # Model & Inference Parameters
    LLM_MODEL: str = Field(
        default="gemini-3.1-flash-lite",
        description="Model name to call for decisions",
    )
    LLM_TIMEOUT_S: float = Field(
        default=10.0,
        ge=0.1,
        le=30.0,
        description="HTTP request timeout in seconds",
    )
    LLM_MAX_TOKENS: int = Field(
        default=1024,
        ge=64,
        le=4096,
        description="Max generation tokens",
    )
    LLM_TEMPERATURE: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="Sampling temperature (0.0 for deterministic output)",
    )

    # Batch limits
    MAX_VEHICLES_PER_BATCH: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum vehicles permitted in a single decision batch",
    )

    # CORS
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        description="Allowed CORS origins",
    )

    @property
    def is_configured(self) -> bool:
        """Returns True if the required API key for the active provider is set."""
        if self.LLM_PROVIDER == "gemini":
            return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())
        elif self.LLM_PROVIDER == "openai":
            return bool(self.OPENAI_API_KEY and self.OPENAI_API_KEY.strip())
        return False

    @property
    def masked_key(self) -> str:
        """Returns masked API key suitable for display in UI/HUD without leaking credentials."""
        raw_key = (
            self.GEMINI_API_KEY if self.LLM_PROVIDER == "gemini" else self.OPENAI_API_KEY
        )
        if not raw_key or not raw_key.strip():
            return "UNSET"
        key_str = raw_key.strip()
        if len(key_str) <= 8:
            return "****"
        return f"{key_str[:3]}...{key_str[-4:]}"


# Global settings singleton
settings = Settings()
