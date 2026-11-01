"""
GRID LOCK — Prompt Builder Service

Compiles system and user prompts for batch decision making using validated Phase 3 telemetry.
Uses compact positional serialization to minimize input tokens and API latency.
Guarantees that prompts contain only permitted local telemetry fields.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.compact_telemetry import serialize_compact_telemetry_batch
from backend.telemetry_schema import VehicleTelemetryReport

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


class PromptBuilder:
    def __init__(self, prompts_dir: Path = PROMPTS_DIR, compact: bool = True):
        self.prompts_dir = prompts_dir
        self.compact = compact
        self.system_prompt_path = (
            prompts_dir / "system_compact.txt"
            if compact and (prompts_dir / "system_compact.txt").exists()
            else prompts_dir / "system_v1.txt"
        )
        self.user_template_path = prompts_dir / "user_template.txt"

        with open(self.system_prompt_path, "r", encoding="utf-8") as f:
            self._system_prompt = f.read().strip()

        with open(self.user_template_path, "r", encoding="utf-8") as f:
            self._user_template = f.read().strip()

    @property
    def system_prompt(self) -> str:
        return self._system_prompt

    def build_user_prompt(
        self,
        telemetry_reports: List[VehicleTelemetryReport],
        tick_id: int = 0,
    ) -> str:
        """Serializes telemetry reports into a compact, minimal-token user prompt."""
        if self.compact:
            payload = serialize_compact_telemetry_batch(tick_id, telemetry_reports)
            # Compact JSON without whitespace bloat
            return json.dumps(payload, separators=(",", ":"))
        else:
            telemetry_dicts = [r.model_dump() for r in telemetry_reports]
            telemetry_json = json.dumps(telemetry_dicts, indent=2)
            return self._user_template.format(
                telemetry_json=telemetry_json,
                vehicle_count=len(telemetry_reports),
            )

    def compile(
        self,
        telemetry_reports: List[VehicleTelemetryReport],
        tick_id: int = 0,
    ) -> Dict[str, Any]:
        """Returns the full compiled prompt dictionary."""
        return {
            "system_prompt": self.system_prompt,
            "user_prompt": self.build_user_prompt(telemetry_reports, tick_id=tick_id),
            "vehicle_count": len(telemetry_reports),
        }


# Global singleton
prompt_builder = PromptBuilder()
