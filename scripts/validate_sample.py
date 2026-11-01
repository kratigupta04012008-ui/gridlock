"""
Validate extracted engine telemetry sample using Python Pydantic models.
"""

import json
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from telemetry_schema import validate_telemetry_report
from pydantic import ValidationError

scripts_dir = Path(__file__).resolve().parent
sample_file = scripts_dir / "sample_report.json"
failing_file = scripts_dir / "failing_report.json"

print("=== Python (Pydantic v2) Validation of Real Sample ===")
with open(sample_file, "r", encoding="utf-8") as fp:
    sample_data = json.load(fp)

try:
    validated = validate_telemetry_report(sample_data)
    print("Python Pydantic Validation Passed: True")
    print(f"Validated Model Object: {validated}")
except ValidationError as e:
    print(f"Python Pydantic Validation Failed: {e}")

print("\n=== Python (Pydantic v2) Validation of Failing Sample (Extra Field) ===")
with open(failing_file, "r", encoding="utf-8") as fp:
    failing_data = json.load(fp)

try:
    validate_telemetry_report(failing_data)
    print("Python Validation Result: VALID (UNEXPECTED)")
except ValidationError as e:
    print("Python Validation Result: REJECTED (EXPECTED)")
    print(f"Pydantic Error Details:\n{e}")
