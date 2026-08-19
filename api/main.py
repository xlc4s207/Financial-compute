import os
from contextlib import contextmanager
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel

DATABASE_URL = os.environ["DATABASE_URL"]


def connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def initialize_database() -> None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS fund_os_state (
                id SMALLINT PRIMARY KEY CHECK (id = 1),
                data JSONB NOT NULL,
                version BIGINT NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )


app = FastAPI(title="Fund OS API", docs_url=None, redoc_url=None)


class StateUpdate(BaseModel):
    data: dict[str, Any]
    version: int | None = None


def response_from_row(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {"initialized": False, "version": 0, "data": None}
    return {"initialized": True, "version": row["version"], "data": row["data"]}


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/api/health")
def health() -> dict[str, str]:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1")
        cur.fetchone()
    return {"status": "ok"}


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT data, version FROM fund_os_state WHERE id = 1")
        return response_from_row(cur.fetchone())


@app.put("/api/state")
def put_state(update: StateUpdate) -> dict[str, Any]:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT version FROM fund_os_state WHERE id = 1 FOR UPDATE")
        current = cur.fetchone()
        if current and update.version is not None and update.version != current["version"]:
            raise HTTPException(status_code=409, detail="The shared data changed. Refresh before saving again.")
        if current:
            cur.execute(
                "UPDATE fund_os_state SET data = %s, version = version + 1, updated_at = NOW() WHERE id = 1 RETURNING data, version",
                (Jsonb(update.data),),
            )
        else:
            cur.execute(
                "INSERT INTO fund_os_state (id, data, version) VALUES (1, %s, 1) RETURNING data, version",
                (Jsonb(update.data),),
            )
        return response_from_row(cur.fetchone())