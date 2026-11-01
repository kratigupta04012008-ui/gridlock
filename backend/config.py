"""
GRID LOCK — Backend Configuration & Settings

Reads environment variables and .env file using pydantic-settings.
Provides provider configuration, timeouts, token limits, key pool settings, and credential checks.
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
        description="Google Gemini primary API key",
    )
    GEMINI_API_KEYS: Optional[str] = Field(
        default=None,
        description="Comma-separated pool of Google Gemini API keys for rotation & rate-limit mitigation",
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
        default=512,
        ge=64,
        le=4096,
        description="Max generation tokens (reduced for compact response efficiency)",
    )
    LLM_TEMPERATURE: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="Sampling temperature (0.0 for deterministic output)",
    )
    LLM_COMPACT_MODE: bool = Field(
        default=True,
        description="Enable compact positional serialization & action tuples to minimize tokens",
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
    def gemini_keys(self) -> List[str]:
        """Returns the list of active Gemini API keys from pool or primary key."""
        if self.GEMINI_API_KEY is None:
            return []

        # If GEMINI_API_KEY is set to a custom or test key not in pool, prioritize it
        if self.GEMINI_API_KEY and self.GEMINI_API_KEYS:
            pool = [k.strip() for k in self.GEMINI_API_KEYS.split(",") if k.strip()]
            if self.GEMINI_API_KEY.strip() not in pool:
                return [self.GEMINI_API_KEY.strip()]
            return pool

        if self.GEMINI_API_KEYS and self.GEMINI_API_KEYS.strip():
            return [k.strip() for k in self.GEMINI_API_KEYS.split(",") if k.strip()]

        if self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip():
            return [self.GEMINI_API_KEY.strip()]

        return []

    @property
    def is_configured(self) -> bool:
        """Returns True if the required API key for the active provider is set."""
        if self.LLM_PROVIDER == "gemini":
            return len(self.gemini_keys) > 0
        elif self.LLM_PROVIDER == "openai":
            return bool(self.OPENAI_API_KEY and self.OPENAI_API_KEY.strip())
        return False

    @property
    def masked_key(self) -> str:
        """Returns masked API key suitable for display in UI/HUD without leaking credentials."""
        if self.LLM_PROVIDER == "gemini":
            keys = self.gemini_keys
            if not keys:
                return "UNSET"
            primary = keys[0]
            masked_primary = f"{primary[:3]}...{primary[-4:]}" if len(primary) > 8 else "****"
            if len(keys) > 1:
                return f"{len(keys)} Keys Pool ({masked_primary})"
            return masked_primary
        else:
            raw_key = self.OPENAI_API_KEY
            if not raw_key or not raw_key.strip():
                return "UNSET"
            key_str = raw_key.strip()
            if len(key_str) <= 8:
                return "****"
            return f"{key_str[:3]}...{key_str[-4:]}"


# Global settings singleton
settings = Settings()
