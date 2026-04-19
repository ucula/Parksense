import csv
import math
import os
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import SessionLocal


LOG_TABLE_CANDIDATES = ("parking_logs", "park_logs")
REQUIRED_COLUMNS = (
    "id",
    "timestamp",
    "in_count",
    "out_count",
    "net_flow",
    "current_vehicles",
    "parking_percentage",
)


app = FastAPI(
    title="ParkSense API",
    description="Intelligent car parking availability monitoring system",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "ParkSense API is running", "version": "1.0.0"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    number = _to_float(value)
    if number is None:
        return None
    return int(number)


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y"}
    return False


def _to_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _direction_view(net_flow: int) -> str:
    if net_flow > 0:
        return "IN"
    if net_flow < 0:
        return "OUT"
    return "FLAT"


def _avg(values: list[float | None]) -> float | None:
    valid = [value for value in values if value is not None]
    if not valid:
        return None
    return sum(valid) / len(valid)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None

    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return sorted_values[0]

    rank = (len(sorted_values) - 1) * percentile
    lower = int(math.floor(rank))
    upper = int(math.ceil(rank))

    if lower == upper:
        return sorted_values[lower]

    weight = rank - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * weight


def _pearson(values_x: list[float], values_y: list[float]) -> float | None:
    if len(values_x) < 3 or len(values_x) != len(values_y):
        return None

    mean_x = sum(values_x) / len(values_x)
    mean_y = sum(values_y) / len(values_y)

    numerator = 0.0
    denominator_x = 0.0
    denominator_y = 0.0

    for x_value, y_value in zip(values_x, values_y):
        dx = x_value - mean_x
        dy = y_value - mean_y
        numerator += dx * dy
        denominator_x += dx * dx
        denominator_y += dy * dy

    if denominator_x == 0 or denominator_y == 0:
        return None

    return numerator / math.sqrt(denominator_x * denominator_y)


def _serialize_log(row: dict[str, Any]) -> dict[str, Any]:
    serialized: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, datetime):
            serialized[key] = value.isoformat(sep=" ")
        else:
            serialized[key] = value
    return serialized


def _normalize_log(row: dict[str, Any]) -> dict[str, Any]:
    timestamp = _to_datetime(row.get("timestamp"))
    row_id = _to_int(row.get("id"))

    if row_id is None or timestamp is None:
        raise ValueError("Missing required id/timestamp")

    in_count = _to_int(row.get("in_count")) or 0
    out_count = _to_int(row.get("out_count")) or 0
    net_flow = _to_int(row.get("net_flow")) or 0
    current_vehicles = _to_int(row.get("current_vehicles")) or 0

    normalized = {
        "id": row_id,
        "timestamp": timestamp,
        "in_count": in_count,
        "out_count": out_count,
        "net_flow": net_flow,
        "current_vehicles": current_vehicles,
        "parking_percentage": _to_float(row.get("parking_percentage")),
        "api_feels_like": _to_float(row.get("api_feels_like")),
        "api_humidity": _to_float(row.get("api_humidity")),
        "api_clouds": _to_float(row.get("api_clouds")),
        "api_temperature": _to_float(row.get("api_temperature")),
        "board_temperature": _to_float(row.get("board_temperature")),
        "is_raining": _to_bool(row.get("is_raining")),
        "pir_in_trigger": _to_int(row.get("pir_in_trigger")) or 0,
        "raw_ultrasonic_in_us": _to_float(row.get("raw_ultrasonic_in_us")),
        "ultrasonic_in_cm": _to_float(row.get("ultrasonic_in_cm")),
        "raw_lidar_in_analog": _to_float(row.get("raw_lidar_in_analog")),
        "pir_out_trigger": _to_int(row.get("pir_out_trigger")) or 0,
        "raw_ultrasonic_out_us": _to_float(row.get("raw_ultrasonic_out_us")),
        "ultrasonic_out_cm": _to_float(row.get("ultrasonic_out_cm")),
        "raw_lidar_out_analog": _to_float(row.get("raw_lidar_out_analog")),
        "lidar_in_cm": _to_float(row.get("lidar_in_cm")),
        "lidar_out_cm": _to_float(row.get("lidar_out_cm")),
    }

    normalized["direction_view"] = _direction_view(net_flow)
    return normalized


def _load_logs_from_db() -> tuple[list[dict[str, Any]], str]:
    db = SessionLocal()
    try:
        errors: list[str] = []
        for table_name in LOG_TABLE_CANDIDATES:
            try:
                result = db.execute(text(f"SELECT * FROM {table_name} ORDER BY timestamp DESC"))
                columns = set(result.keys())
                if not all(column in columns for column in REQUIRED_COLUMNS):
                    errors.append(
                        f"{table_name} is missing required columns ({', '.join(REQUIRED_COLUMNS)})"
                    )
                    continue

                rows = result.fetchall()
                normalized_rows = []
                for row in rows:
                    row_dict = dict(zip(result.keys(), row))
                    normalized_rows.append(_normalize_log(row_dict))
                return normalized_rows, table_name
            except Exception as exc:
                errors.append(f"{table_name}: {exc}")

        raise Exception("; ".join(errors) if errors else "No compatible logs table found")
    finally:
        db.close()


def _load_logs_from_csv(csv_path: str) -> list[dict[str, Any]]:
    logs: list[dict[str, Any]] = []
    with open(csv_path, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            if not row:
                continue
            try:
                logs.append(_normalize_log(row))
            except ValueError:
                continue

    logs.sort(key=lambda item: item["timestamp"], reverse=True)
    return logs


def _get_log_source() -> tuple[list[dict[str, Any]], str]:
    csv_path = os.getenv(
        "PARK_LOGS_CSV",
        os.getenv("PARKING_LOGS_CSV", "/Users/cherio/Downloads/park_logs.csv"),
    )

    db_error = None
    try:
        logs, table_name = _load_logs_from_db()
        return logs, f"db:{table_name}"
    except Exception as exc:
        db_error = str(exc)

    if os.path.exists(csv_path):
        return _load_logs_from_csv(csv_path), f"csv:{csv_path}"

    raise HTTPException(
        status_code=500,
        detail=f"Unable to load parking_logs data from DB or CSV. DB error: {db_error}",
    )


def _bucket_timestamp(timestamp: datetime, bucket: str) -> str:
    if bucket == "minute":
        return timestamp.replace(second=0, microsecond=0).isoformat(sep=" ")
    if bucket == "day":
        return timestamp.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(sep=" ")
    return timestamp.replace(minute=0, second=0, microsecond=0).isoformat(sep=" ")


def _calendar_bucket(timestamp: datetime, preset: str) -> str:
    if preset == "weekly":
        iso_year, iso_week, _ = timestamp.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return timestamp.strftime("%Y-%m-%d")


def _in_range(value: float | None, min_value: float | None, max_value: float | None) -> bool:
    if value is None:
        return False
    if min_value is not None and value < min_value:
        return False
    if max_value is not None and value > max_value:
        return False
    return True


def _matches_filters(
    log: dict[str, Any],
    start_time: datetime | None,
    end_time: datetime | None,
    direction_view: str | None,
    is_raining: bool | None,
    board_temperature_min: float | None,
    board_temperature_max: float | None,
    ultrasonic_in_min: float | None,
    ultrasonic_in_max: float | None,
    ultrasonic_out_min: float | None,
    ultrasonic_out_max: float | None,
    lidar_in_min: float | None,
    lidar_in_max: float | None,
    lidar_out_min: float | None,
    lidar_out_max: float | None,
    search_id: str | None,
) -> bool:
    timestamp = log["timestamp"]
    if start_time and timestamp < start_time:
        return False
    if end_time and timestamp > end_time:
        return False

    if direction_view and direction_view.upper() != "ALL":
        if log["direction_view"] != direction_view.upper():
            return False

    if is_raining is not None and log["is_raining"] != is_raining:
        return False

    if board_temperature_min is not None or board_temperature_max is not None:
        if not _in_range(log["board_temperature"], board_temperature_min, board_temperature_max):
            return False

    if ultrasonic_in_min is not None or ultrasonic_in_max is not None:
        if not _in_range(log["ultrasonic_in_cm"], ultrasonic_in_min, ultrasonic_in_max):
            return False

    if ultrasonic_out_min is not None or ultrasonic_out_max is not None:
        if not _in_range(log["ultrasonic_out_cm"], ultrasonic_out_min, ultrasonic_out_max):
            return False

    if lidar_in_min is not None or lidar_in_max is not None:
        if not _in_range(log["lidar_in_cm"], lidar_in_min, lidar_in_max):
            return False

    if lidar_out_min is not None or lidar_out_max is not None:
        if not _in_range(log["lidar_out_cm"], lidar_out_min, lidar_out_max):
            return False

    if search_id and search_id.strip() not in str(log["id"]):
        return False

    return True


def _with_derived_metrics(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    derived: list[dict[str, Any]] = []
    previous_occupancy: float | None = None

    for row in sorted(logs, key=lambda item: item["timestamp"]):
        current_occupancy = _to_float(row["current_vehicles"])
        out_count = row["out_count"] if row["out_count"] is not None else 0

        occupancy_change = None
        if current_occupancy is not None and previous_occupancy is not None:
            occupancy_change = current_occupancy - previous_occupancy

        if current_occupancy is not None:
            previous_occupancy = current_occupancy

        in_out_ratio = row["in_count"] / max(out_count, 1)

        sensor_gap_in = None
        if row["ultrasonic_in_cm"] is not None and row["lidar_in_cm"] is not None:
            sensor_gap_in = abs(row["ultrasonic_in_cm"] - row["lidar_in_cm"])

        sensor_gap_out = None
        if row["ultrasonic_out_cm"] is not None and row["lidar_out_cm"] is not None:
            sensor_gap_out = abs(row["ultrasonic_out_cm"] - row["lidar_out_cm"])

        derived.append(
            {
                **row,
                "occupancy_change": occupancy_change,
                "in_out_ratio": in_out_ratio,
                "sensor_gap_in": sensor_gap_in,
                "sensor_gap_out": sensor_gap_out,
            }
        )

    return derived


def _build_trends(logs_ascending: list[dict[str, Any]], bucket: str) -> list[dict[str, Any]]:
    bucket_map: dict[str, dict[str, Any]] = {}

    for row in logs_ascending:
        bucket_key = _bucket_timestamp(row["timestamp"], bucket)
        if bucket_key not in bucket_map:
            bucket_map[bucket_key] = {
                "timestamp": bucket_key,
                "rows": 0,
                "current_vehicles_values": [],
                "parking_percentage_values": [],
                "api_temperature_values": [],
                "api_feels_like_values": [],
                "api_humidity_values": [],
                "api_clouds_values": [],
                "board_temperature_values": [],
                "ultrasonic_in_values": [],
                "lidar_in_values": [],
                "ultrasonic_out_values": [],
                "lidar_out_values": [],
                "in_count": 0,
                "out_count": 0,
                "net_flow": 0,
                "pir_in_trigger": 0,
                "pir_out_trigger": 0,
                "raining_count": 0,
            }

        bucket_record = bucket_map[bucket_key]
        bucket_record["rows"] += 1
        bucket_record["in_count"] += row["in_count"]
        bucket_record["out_count"] += row["out_count"]
        bucket_record["net_flow"] += row["net_flow"]
        bucket_record["pir_in_trigger"] += row["pir_in_trigger"]
        bucket_record["pir_out_trigger"] += row["pir_out_trigger"]
        bucket_record["raining_count"] += 1 if row["is_raining"] else 0

        bucket_record["current_vehicles_values"].append(_to_float(row["current_vehicles"]))
        bucket_record["parking_percentage_values"].append(row["parking_percentage"])
        bucket_record["api_temperature_values"].append(row["api_temperature"])
        bucket_record["api_feels_like_values"].append(row["api_feels_like"])
        bucket_record["api_humidity_values"].append(row["api_humidity"])
        bucket_record["api_clouds_values"].append(row["api_clouds"])
        bucket_record["board_temperature_values"].append(row["board_temperature"])
        bucket_record["ultrasonic_in_values"].append(row["ultrasonic_in_cm"])
        bucket_record["lidar_in_values"].append(row["lidar_in_cm"])
        bucket_record["ultrasonic_out_values"].append(row["ultrasonic_out_cm"])
        bucket_record["lidar_out_values"].append(row["lidar_out_cm"])

    trend_rows: list[dict[str, Any]] = []
    for key in sorted(bucket_map.keys()):
        item = bucket_map[key]
        trend_rows.append(
            {
                "timestamp": item["timestamp"],
                "rows": item["rows"],
                "current_vehicles": _avg(item["current_vehicles_values"]),
                "parking_percentage": _avg(item["parking_percentage_values"]),
                "in_count": item["in_count"],
                "out_count": item["out_count"],
                "net_flow": item["net_flow"],
                "api_temperature": _avg(item["api_temperature_values"]),
                "api_feels_like": _avg(item["api_feels_like_values"]),
                "api_humidity": _avg(item["api_humidity_values"]),
                "api_clouds": _avg(item["api_clouds_values"]),
                "board_temperature": _avg(item["board_temperature_values"]),
                "ultrasonic_in_cm": _avg(item["ultrasonic_in_values"]),
                "lidar_in_cm": _avg(item["lidar_in_values"]),
                "pir_in_trigger": item["pir_in_trigger"],
                "ultrasonic_out_cm": _avg(item["ultrasonic_out_values"]),
                "lidar_out_cm": _avg(item["lidar_out_values"]),
                "pir_out_trigger": item["pir_out_trigger"],
                "rain_ratio": (item["raining_count"] / item["rows"]) if item["rows"] else 0,
            }
        )

    return trend_rows


def _build_raw_vs_converted(
    logs_descending: list[dict[str, Any]],
    max_points: int = 800,
) -> dict[str, list[dict[str, Any]]]:
    checks = {
        "ultrasonic_in": [],
        "ultrasonic_out": [],
        "lidar_in": [],
        "lidar_out": [],
    }

    for row in logs_descending:
        if (
            row["raw_ultrasonic_in_us"] is not None
            and row["ultrasonic_in_cm"] is not None
            and len(checks["ultrasonic_in"]) < max_points
        ):
            checks["ultrasonic_in"].append(
                {
                    "id": row["id"],
                    "timestamp": row["timestamp"].isoformat(sep=" "),
                    "raw": row["raw_ultrasonic_in_us"],
                    "converted": row["ultrasonic_in_cm"],
                }
            )

        if (
            row["raw_ultrasonic_out_us"] is not None
            and row["ultrasonic_out_cm"] is not None
            and len(checks["ultrasonic_out"]) < max_points
        ):
            checks["ultrasonic_out"].append(
                {
                    "id": row["id"],
                    "timestamp": row["timestamp"].isoformat(sep=" "),
                    "raw": row["raw_ultrasonic_out_us"],
                    "converted": row["ultrasonic_out_cm"],
                }
            )

        if (
            row["raw_lidar_in_analog"] is not None
            and row["lidar_in_cm"] is not None
            and len(checks["lidar_in"]) < max_points
        ):
            checks["lidar_in"].append(
                {
                    "id": row["id"],
                    "timestamp": row["timestamp"].isoformat(sep=" "),
                    "raw": row["raw_lidar_in_analog"],
                    "converted": row["lidar_in_cm"],
                }
            )

        if (
            row["raw_lidar_out_analog"] is not None
            and row["lidar_out_cm"] is not None
            and len(checks["lidar_out"]) < max_points
        ):
            checks["lidar_out"].append(
                {
                    "id": row["id"],
                    "timestamp": row["timestamp"].isoformat(sep=" "),
                    "raw": row["raw_lidar_out_analog"],
                    "converted": row["lidar_out_cm"],
                }
            )

    return checks


def _build_board_temp_sensor_scatter(
    logs_descending: list[dict[str, Any]],
    max_points: int = 1200,
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for row in logs_descending:
        if row["board_temperature"] is None:
            continue
        points.append(
            {
                "id": row["id"],
                "timestamp": row["timestamp"].isoformat(sep=" "),
                "board_temperature": row["board_temperature"],
                "ultrasonic_in_cm": row["ultrasonic_in_cm"],
                "ultrasonic_out_cm": row["ultrasonic_out_cm"],
                "lidar_in_cm": row["lidar_in_cm"],
                "lidar_out_cm": row["lidar_out_cm"],
            }
        )
        if len(points) >= max_points:
            break
    return points


def _build_sensor_baselines(logs_descending: list[dict[str, Any]]) -> dict[str, Any]:
    sensor_gap_in_values = [
        row["sensor_gap_in"] for row in logs_descending if row["sensor_gap_in"] is not None
    ]
    sensor_gap_out_values = [
        row["sensor_gap_out"] for row in logs_descending if row["sensor_gap_out"] is not None
    ]
    occupancy_jump_values = [
        abs(row["occupancy_change"])
        for row in logs_descending
        if row["occupancy_change"] is not None
    ]

    return {
        "sensor_gap_in": {
            "p50": _percentile(sensor_gap_in_values, 0.50),
            "p95": _percentile(sensor_gap_in_values, 0.95),
        },
        "sensor_gap_out": {
            "p50": _percentile(sensor_gap_out_values, 0.50),
            "p95": _percentile(sensor_gap_out_values, 0.95),
        },
        "occupancy_change_abs": {
            "p95": _percentile(occupancy_jump_values, 0.95),
        },
    }


def _build_correlation_matrix(logs_descending: list[dict[str, Any]]) -> dict[str, Any]:
    metrics = [
        "current_vehicles",
        "parking_percentage",
        "in_count",
        "out_count",
        "net_flow",
        "api_temperature",
        "api_humidity",
        "api_clouds",
        "board_temperature",
        "ultrasonic_in_cm",
        "ultrasonic_out_cm",
        "lidar_in_cm",
        "lidar_out_cm",
        "sensor_gap_in",
        "sensor_gap_out",
    ]

    pairs: list[dict[str, Any]] = []

    for metric_x in metrics:
        for metric_y in metrics:
            if metric_x == metric_y:
                pairs.append({"x": metric_x, "y": metric_y, "value": 1.0})
                continue

            values_x: list[float] = []
            values_y: list[float] = []

            for row in logs_descending:
                value_x = _to_float(row.get(metric_x))
                value_y = _to_float(row.get(metric_y))
                if value_x is None or value_y is None:
                    continue
                values_x.append(value_x)
                values_y.append(value_y)

            pairs.append(
                {
                    "x": metric_x,
                    "y": metric_y,
                    "value": _pearson(values_x, values_y),
                }
            )

    return {
        "metrics": metrics,
        "pairs": pairs,
    }


def _build_anomaly_flags(
    logs_descending: list[dict[str, Any]],
    baselines: dict[str, Any],
    max_items: int = 200,
) -> list[dict[str, Any]]:
    sensor_gap_in_p95 = _to_float(baselines.get("sensor_gap_in", {}).get("p95"))
    sensor_gap_out_p95 = _to_float(baselines.get("sensor_gap_out", {}).get("p95"))
    occupancy_jump_p95 = _to_float(baselines.get("occupancy_change_abs", {}).get("p95"))

    in_threshold = sensor_gap_in_p95 if sensor_gap_in_p95 is not None else 45.0
    out_threshold = sensor_gap_out_p95 if sensor_gap_out_p95 is not None else 45.0
    jump_threshold = occupancy_jump_p95 if occupancy_jump_p95 is not None else 12.0

    anomalies: list[dict[str, Any]] = []
    for row in logs_descending:
        reasons: list[str] = []

        if row["net_flow"] != row["in_count"] - row["out_count"]:
            reasons.append("net_flow_mismatch")

        parking_percentage = _to_float(row.get("parking_percentage"))
        if parking_percentage is not None and (parking_percentage < 0 or parking_percentage > 100):
            reasons.append("parking_percentage_out_of_range")

        if row["current_vehicles"] < 0:
            reasons.append("current_vehicles_negative")

        if row["sensor_gap_in"] is not None and row["sensor_gap_in"] > in_threshold:
            reasons.append("sensor_gap_in_outlier")

        if row["sensor_gap_out"] is not None and row["sensor_gap_out"] > out_threshold:
            reasons.append("sensor_gap_out_outlier")

        occupancy_change = _to_float(row.get("occupancy_change"))
        if occupancy_change is not None and abs(occupancy_change) > jump_threshold:
            reasons.append("occupancy_jump")

        if not reasons:
            continue

        severity = "LOW"
        if len(reasons) >= 3:
            severity = "HIGH"
        elif len(reasons) == 2:
            severity = "MEDIUM"

        anomalies.append(
            {
                "id": row["id"],
                "timestamp": row["timestamp"].isoformat(sep=" "),
                "severity": severity,
                "reasons": reasons,
                "direction_view": row["direction_view"],
                "current_vehicles": row["current_vehicles"],
                "net_flow": row["net_flow"],
                "sensor_gap_in": row["sensor_gap_in"],
                "sensor_gap_out": row["sensor_gap_out"],
            }
        )

        if len(anomalies) >= max_items:
            break

    return anomalies


def _build_report_rows(logs_descending: list[dict[str, Any]], preset: str) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for row in logs_descending:
        key = _calendar_bucket(row["timestamp"], preset)
        if key not in buckets:
            buckets[key] = {
                "period": key,
                "rows": 0,
                "total_in": 0,
                "total_out": 0,
                "net_flow": 0,
                "raining_rows": 0,
                "avg_current_vehicles_values": [],
                "avg_parking_percentage_values": [],
                "avg_board_temperature_values": [],
            }

        bucket = buckets[key]
        bucket["rows"] += 1
        bucket["total_in"] += row["in_count"]
        bucket["total_out"] += row["out_count"]
        bucket["net_flow"] += row["net_flow"]
        bucket["raining_rows"] += 1 if row["is_raining"] else 0
        bucket["avg_current_vehicles_values"].append(_to_float(row["current_vehicles"]))
        bucket["avg_parking_percentage_values"].append(row["parking_percentage"])
        bucket["avg_board_temperature_values"].append(row["board_temperature"])

    rows: list[dict[str, Any]] = []
    for key in sorted(buckets.keys()):
        item = buckets[key]
        rows.append(
            {
                "period": item["period"],
                "rows": item["rows"],
                "total_in": item["total_in"],
                "total_out": item["total_out"],
                "net_flow": item["net_flow"],
                "rain_ratio": (item["raining_rows"] / item["rows"]) if item["rows"] else 0,
                "avg_current_vehicles": _avg(item["avg_current_vehicles_values"]),
                "avg_parking_percentage": _avg(item["avg_parking_percentage_values"]),
                "avg_board_temperature": _avg(item["avg_board_temperature_values"]),
            }
        )

    return rows


@app.get("/api/parkinglogs")
async def get_parkinglogs(
    limit: int = Query(default=2000, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
):
    logs, _ = _get_log_source()
    logs_desc = sorted(logs, key=lambda item: item["timestamp"], reverse=True)
    return [_serialize_log(row) for row in logs_desc[offset : offset + limit]]


@app.get("/api/park-logs/reports")
async def get_park_logs_reports(
    preset: str = Query(default="daily", pattern="^(daily|weekly)$"),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
):
    logs, source = _get_log_source()

    filtered_logs = [
        log
        for log in logs
        if (start_time is None or log["timestamp"] >= start_time)
        and (end_time is None or log["timestamp"] <= end_time)
    ]

    derived_logs = _with_derived_metrics(filtered_logs)
    logs_desc = sorted(derived_logs, key=lambda row: row["timestamp"], reverse=True)

    return {
        "source": source,
        "preset": preset,
        "rows": _build_report_rows(logs_desc, preset),
    }


@app.get("/api/park-logs/dashboard")
async def get_park_logs_dashboard(
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    bucket: str = Query(default="hour", pattern="^(minute|hour|day)$"),
    direction_view: str | None = Query(default=None),
    is_raining: bool | None = Query(default=None),
    board_temperature_min: float | None = Query(default=None),
    board_temperature_max: float | None = Query(default=None),
    ultrasonic_in_min: float | None = Query(default=None),
    ultrasonic_in_max: float | None = Query(default=None),
    ultrasonic_out_min: float | None = Query(default=None),
    ultrasonic_out_max: float | None = Query(default=None),
    lidar_in_min: float | None = Query(default=None),
    lidar_in_max: float | None = Query(default=None),
    lidar_out_min: float | None = Query(default=None),
    lidar_out_max: float | None = Query(default=None),
    search_id: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    logs, source = _get_log_source()

    filtered_logs = [
        log
        for log in logs
        if _matches_filters(
            log=log,
            start_time=start_time,
            end_time=end_time,
            direction_view=direction_view,
            is_raining=is_raining,
            board_temperature_min=board_temperature_min,
            board_temperature_max=board_temperature_max,
            ultrasonic_in_min=ultrasonic_in_min,
            ultrasonic_in_max=ultrasonic_in_max,
            ultrasonic_out_min=ultrasonic_out_min,
            ultrasonic_out_max=ultrasonic_out_max,
            lidar_in_min=lidar_in_min,
            lidar_in_max=lidar_in_max,
            lidar_out_min=lidar_out_min,
            lidar_out_max=lidar_out_max,
            search_id=search_id,
        )
    ]

    derived_logs_asc = _with_derived_metrics(filtered_logs)
    derived_logs_desc = sorted(derived_logs_asc, key=lambda row: row["timestamp"], reverse=True)
    trend_rows = _build_trends(derived_logs_asc, bucket)

    latest_row = derived_logs_desc[0] if derived_logs_desc else None
    total_logs = len(derived_logs_desc)
    total_in = sum(row["in_count"] for row in derived_logs_desc)
    total_out = sum(row["out_count"] for row in derived_logs_desc)
    rainy_logs = [row for row in derived_logs_desc if row["is_raining"]]
    dry_logs = [row for row in derived_logs_desc if not row["is_raining"]]

    direction_breakdown = {"IN": 0, "OUT": 0, "FLAT": 0}
    for row in derived_logs_desc:
        direction_breakdown[row["direction_view"]] += 1

    temp_vs_parking_scatter = [
        {
            "id": row["id"],
            "timestamp": row["timestamp"].isoformat(sep=" "),
            "api_temperature": row["api_temperature"],
            "parking_percentage": row["parking_percentage"],
            "is_raining": row["is_raining"],
        }
        for row in derived_logs_desc
        if row["api_temperature"] is not None and row["parking_percentage"] is not None
    ][:1500]

    sensor_baselines = _build_sensor_baselines(derived_logs_desc)
    anomaly_flags = _build_anomaly_flags(derived_logs_desc, sensor_baselines)
    correlation_matrix = _build_correlation_matrix(derived_logs_desc)

    paginated_logs = derived_logs_desc[offset : offset + limit]

    return {
        "source": source,
        "filters": {
            "start_time": start_time.isoformat(sep=" ") if start_time else None,
            "end_time": end_time.isoformat(sep=" ") if end_time else None,
            "bucket": bucket,
            "direction_view": direction_view,
            "is_raining": is_raining,
            "board_temperature_min": board_temperature_min,
            "board_temperature_max": board_temperature_max,
            "ultrasonic_in_min": ultrasonic_in_min,
            "ultrasonic_in_max": ultrasonic_in_max,
            "ultrasonic_out_min": ultrasonic_out_min,
            "ultrasonic_out_max": ultrasonic_out_max,
            "lidar_in_min": lidar_in_min,
            "lidar_in_max": lidar_in_max,
            "lidar_out_min": lidar_out_min,
            "lidar_out_max": lidar_out_max,
            "search_id": search_id,
            "limit": limit,
            "offset": offset,
        },
        "kpis": {
            "total_logs": total_logs,
            "current_vehicles_latest": latest_row["current_vehicles"] if latest_row else 0,
            "avg_parking_percentage": _avg([row["parking_percentage"] for row in derived_logs_desc]),
            "total_in": total_in,
            "total_out": total_out,
            "latest_net_flow": latest_row["net_flow"] if latest_row else 0,
            "rain_ratio": (len(rainy_logs) / total_logs) if total_logs else 0,
            "avg_board_temperature": _avg([row["board_temperature"] for row in derived_logs_desc]),
        },
        "direction_breakdown": direction_breakdown,
        "trends": trend_rows,
        "rain_vs_occupancy": {
            "raining_logs": len(rainy_logs),
            "dry_logs": len(dry_logs),
            "raining_avg_current_vehicles": _avg(
                [_to_float(row["current_vehicles"]) for row in rainy_logs]
            ),
            "dry_avg_current_vehicles": _avg([_to_float(row["current_vehicles"]) for row in dry_logs]),
        },
        "temp_vs_parking_scatter": temp_vs_parking_scatter,
        "raw_vs_converted_checks": _build_raw_vs_converted(derived_logs_desc),
        "board_temp_sensor_scatter": _build_board_temp_sensor_scatter(derived_logs_desc),
        "sensor_baselines": sensor_baselines,
        "anomaly_flags": anomaly_flags,
        "correlation_matrix": correlation_matrix,
        "logs": [_serialize_log(row) for row in paginated_logs],
        "total_filtered_logs": total_logs,
        "returned_logs": len(paginated_logs),
    }


@app.exception_handler(Exception)
async def exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
