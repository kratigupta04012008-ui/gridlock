"""
GRID LOCK — Prompt Builder Service

Compiles system and user prompts for batch decision making using validated Phase 3 telemetry.
Guarantees that prompts contain only permitted local telemetry fields.
"""

import json
from pathlib import Path
from typing import Any, Dict, List
from backend.telemetry_schema import VehicleTelemetryReport

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


class PromptBuilder:
    def __init__(self, prompts_dir: Path = PROMPTS_DIR):
        self.prompts_dir = prompts_dir
        self.system_prompt_path = prompts_dir / "system_v1.txt"
        self.user_template_path = prompts_dir / "user_template.txt"

        with open(self.system_prompt_path, "r", encoding="utf-8") as f:
            self._system_prompt = f.read().strip()

        with open(self.user_template_path, "r", encoding="utf-8") as f:
            self._user_template = f.read().strip()

    @property
    def system_prompt(self) -> str:
        return self._system_prompt

    def build_user_prompt(self, telemetry_reports: List[VehicleTelemetryReport]) -> str:
        """Serializes telemetry reports and renders the user prompt template."""
        telemetry_dicts = [r.model_dump() for r in telemetry_reports]
        telemetry_json = json.dumps(telemetry_dicts, indent=2)
        return self._user_template.format(
            telemetry_json=telemetry_json,
            vehicle_count=len(telemetry_reports),
        )

    def compile(
        self, telemetry_reports: List[VehicleTelemetryReport]
    ) -> Dict[str, Any]:
        """Returns the full compiled prompt dictionary."""
        return {
            "system_prompt": self.system_prompt,
            "user_prompt": self.build_user_prompt(telemetry_reports),
            "vehicle_count": len(telemetry_reports),
        }


# Global singleton
prompt_builder = PromptBuilder()
