import csv
import os
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.database import SessionLocal

# Initialize FastAPI app
app = FastAPI(
    title="ParkSense API",
    description="Intelligent car parking availability monitoring system",
    version="1.0.0",
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint - API is running"""
    return {"message": "ParkSense API is running", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/api/parkinglogs")
async def get_parkinglogs():
    """Get all parking logs from database"""
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT * FROM parking_logs ORDER BY id DESC"))
        columns = result.keys()
        rows = result.fetchall()
        
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        db.close()


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y"}
    return False


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    raise ValueError("Invalid timestamp value")


def _normalize_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "timestamp": _to_datetime(row["timestamp"]),
        "direction": str(row["direction"] or "UNKNOWN").upper(),
        "raw_ultrasonic_us": _to_float(row.get("raw_ultrasonic_us")),
        "ultrasonic_cm": _to_float(row.get("ultrasonic_cm")),
        "raw_sharp_analog": _to_float(row.get("raw_sharp_analog")),
        "sharp_cm": _to_float(row.get("sharp_cm")),
        "board_temp": _to_float(row.get("board_temp")),
        "is_counted": _to_bool(row.get("is_counted")),
    }


def _load_events_from_db() -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        result = db.execute(
            text(
                """
                SELECT
                    id,
                    timestamp,
                    direction,
                    raw_ultrasonic_us,
                    ultrasonic_cm,
                    raw_sharp_analog,
                    sharp_cm,
                    board_temp,
                    is_counted
                FROM parking_events
                ORDER BY timestamp DESC
                """
            )
        )
        columns = result.keys()
        rows = result.fetchall()
        return [_normalize_event(dict(zip(columns, row))) for row in rows]
    finally:
        db.close()


def _load_events_from_csv(csv_path: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    with open(csv_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            if not row:
                continue
            events.append(_normalize_event(row))
    events.sort(key=lambda event: event["timestamp"], reverse=True)
    return events


def _get_event_source() -> tuple[list[dict[str, Any]], str]:
    csv_path = os.getenv("PARKING_EVENTS_CSV", "/Users/cherio/Downloads/parking_events.csv")
    db_error = None
    try:
        return _load_events_from_db(), "db:parking_events"
    except Exception as exc:
        db_error = str(exc)

    if os.path.exists(csv_path):
        return _load_events_from_csv(csv_path), f"csv:{csv_path}"

    raise HTTPException(
        status_code=500,
        detail=f"Unable to load parking events from DB or CSV. DB error: {db_error}",
    )


def _bucket_timestamp(ts: datetime, bucket: str) -> str:
    if bucket == "minute":
        return ts.replace(second=0, microsecond=0).isoformat(sep=" ")
    if bucket == "day":
        return ts.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(sep=" ")
    return ts.replace(minute=0, second=0, microsecond=0).isoformat(sep=" ")


def _in_range(value: float | None, min_value: float | None, max_value: float | None) -> bool:
    if value is None:
        return False
    if min_value is not None and value < min_value:
        return False
    if max_value is not None and value > max_value:
        return False
    return True


def _matches_filters(
    event: dict[str, Any],
    start_time: datetime | None,
    end_time: datetime | None,
    direction: str | None,
    is_counted: bool | None,
    board_temp_min: float | None,
    board_temp_max: float | None,
    ultrasonic_min: float | None,
    ultrasonic_max: float | None,
    sharp_min: float | None,
    sharp_max: float | None,
    search_id: str | None,
) -> bool:
    ts = event["timestamp"]
    if start_time and ts < start_time:
        return False
    if end_time and ts > end_time:
        return False

    if direction and event["direction"] != direction.upper():
        return False

    if is_counted is not None and event["is_counted"] != is_counted:
        return False

    if board_temp_min is not None or board_temp_max is not None:
        if not _in_range(event["board_temp"], board_temp_min, board_temp_max):
            return False

    if ultrasonic_min is not None or ultrasonic_max is not None:
        if not _in_range(event["ultrasonic_cm"], ultrasonic_min, ultrasonic_max):
            return False

    if sharp_min is not None or sharp_max is not None:
        if not _in_range(event["sharp_cm"], sharp_min, sharp_max):
            return False

    if search_id and search_id.strip() not in str(event["id"]):
        return False

    return True


def _avg(values: list[float | None]) -> float | None:
    filtered = [v for v in values if v is not None]
    if not filtered:
        return None
    return sum(filtered) / len(filtered)


@app.get("/api/parking-events/dashboard")
async def get_parking_events_dashboard(
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    bucket: str = Query(default="hour", pattern="^(minute|hour|day)$"),
    direction: str | None = Query(default=None),
    is_counted: bool | None = Query(default=None),
    board_temp_min: float | None = Query(default=None),
    board_temp_max: float | None = Query(default=None),
    ultrasonic_min: float | None = Query(default=None),
    ultrasonic_max: float | None = Query(default=None),
    sharp_min: float | None = Query(default=None),
    sharp_max: float | None = Query(default=None),
    search_id: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
):
    events, source = _get_event_source()

    filtered_events = [
        event
        for event in events
        if _matches_filters(
            event=event,
            start_time=start_time,
            end_time=end_time,
            direction=direction,
            is_counted=is_counted,
            board_temp_min=board_temp_min,
            board_temp_max=board_temp_max,
            ultrasonic_min=ultrasonic_min,
            ultrasonic_max=ultrasonic_max,
            sharp_min=sharp_min,
            sharp_max=sharp_max,
            search_id=search_id,
        )
    ]

    total_events = len(filtered_events)
    counted_events = sum(1 for event in filtered_events if event["is_counted"])

    direction_counts: dict[str, int] = {}
    for event in filtered_events:
        direction_key = event["direction"]
        direction_counts[direction_key] = direction_counts.get(direction_key, 0) + 1

    bucket_map: dict[str, dict[str, Any]] = {}
    for event in filtered_events:
        bucket_key = _bucket_timestamp(event["timestamp"], bucket)
        if bucket_key not in bucket_map:
            bucket_map[bucket_key] = {
                "timestamp": bucket_key,
                "total": 0,
                "counted": 0,
                "uncounted": 0,
                "direction": {},
            }
        bucket_record = bucket_map[bucket_key]
        bucket_record["total"] += 1
        if event["is_counted"]:
            bucket_record["counted"] += 1
        else:
            bucket_record["uncounted"] += 1

        direction_key = event["direction"]
        bucket_record["direction"][direction_key] = (
            bucket_record["direction"].get(direction_key, 0) + 1
        )

    bucket_items = [bucket_map[key] for key in sorted(bucket_map.keys())]

    response_events = [
        {
            **event,
            "timestamp": event["timestamp"].isoformat(sep=" "),
        }
        for event in filtered_events[:limit]
    ]

    correlation = [
        {
            "id": event["id"],
            "timestamp": event["timestamp"].isoformat(sep=" "),
            "ultrasonic_cm": event["ultrasonic_cm"],
            "sharp_cm": event["sharp_cm"],
            "is_counted": event["is_counted"],
            "direction": event["direction"],
        }
        for event in filtered_events
        if event["ultrasonic_cm"] is not None and event["sharp_cm"] is not None
    ][:2000]

    return {
        "source": source,
        "filters": {
            "start_time": start_time.isoformat(sep=" ") if start_time else None,
            "end_time": end_time.isoformat(sep=" ") if end_time else None,
            "bucket": bucket,
            "direction": direction,
            "is_counted": is_counted,
            "board_temp_min": board_temp_min,
            "board_temp_max": board_temp_max,
            "ultrasonic_min": ultrasonic_min,
            "ultrasonic_max": ultrasonic_max,
            "sharp_min": sharp_min,
            "sharp_max": sharp_max,
            "search_id": search_id,
            "limit": limit,
        },
        "kpis": {
            "total_events": total_events,
            "counted_events": counted_events,
            "count_rate": (counted_events / total_events) if total_events else 0,
            "avg_ultrasonic_cm": _avg([event["ultrasonic_cm"] for event in filtered_events]),
            "avg_sharp_cm": _avg([event["sharp_cm"] for event in filtered_events]),
            "avg_board_temp": _avg([event["board_temp"] for event in filtered_events]),
        },
        "direction_breakdown": direction_counts,
        "event_count_over_time": [
            {
                "timestamp": item["timestamp"],
                "total": item["total"],
                "direction": item["direction"],
            }
            for item in bucket_items
        ],
        "counted_vs_uncounted_over_time": [
            {
                "timestamp": item["timestamp"],
                "counted": item["counted"],
                "uncounted": item["uncounted"],
            }
            for item in bucket_items
        ],
        "correlation_points": correlation,
        "events": response_events,
        "total_filtered_events": total_events,
        "returned_events": len(response_events),
    }


@app.exception_handler(Exception)
async def exception_handler(request, exc):
    """Global exception handler"""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
