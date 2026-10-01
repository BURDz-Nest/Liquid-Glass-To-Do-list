"""Local project checklist server with JSON-file persistence."""
from __future__ import annotations

import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).parent
DATA_FILE = ROOT / "checklist-data.json"

app = FastAPI(title="Project Checklist")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class Checklist(BaseModel):
    projects: list[dict[str, Any]] = Field(default_factory=list)


def read_data() -> dict[str, Any]:
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Could not read checklist-data.json: {error}") from error


def write_data(data: dict[str, Any]) -> None:
    """Write atomically so an interrupted save cannot eat the checklist."""
    with NamedTemporaryFile("w", encoding="utf-8", dir=ROOT, delete=False) as temp:
        json.dump(data, temp, indent=2, ensure_ascii=False)
        temp.write("\n")
        temp_path = Path(temp.name)
    os.replace(temp_path, DATA_FILE)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/checklist")
def get_checklist() -> dict[str, Any]:
    return read_data()


@app.put("/api/checklist")
def save_checklist(checklist: Checklist) -> dict[str, Any]:
    data = checklist.model_dump()
    write_data(data)
    return data
