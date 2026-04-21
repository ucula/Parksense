import calendar
from datetime import datetime, timedelta

from fastapi import APIRouter, Query

from app.services import park_logs_service
from app.services import prediction as prediction_service


router = APIRouter(prefix="/api")


def _build_reports_response(
    preset: str,
    start_time: datetime | None,
    end_time: datetime | None,
    sort: str,
) -> dict:
    logs, source = park_logs_service.get_log_source()

    filtered_logs = [
        log
        for log in logs
        if (start_time is None or log["timestamp"] >= start_time)
        and (end_time is None or log["timestamp"] <= end_time)
    ]

    derived_logs = park_logs_service.with_derived_metrics(filtered_logs)
    logs_desc = sorted(derived_logs, key=lambda row: row["timestamp"], reverse=True)

    report_rows = park_logs_service.build_report_rows(logs_desc, preset)
    if sort == "desc":
        report_rows = list(reversed(report_rows))

    return {
        "source": source,
        "preset": preset,
        "rows": report_rows,
    }


def _subtract_months(value: datetime, months: int) -> datetime:
    total_months = value.year * 12 + (value.month - 1) - months
    year = total_months // 12
    month = total_months % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    day = min(value.day, max_day)
    return value.replace(year=year, month=month, day=day)


def _subtract_years(value: datetime, years: int) -> datetime:
    try:
        return value.replace(year=value.year - years)
    except ValueError:
        # Handle leap day for non-leap target years.
        return value.replace(year=value.year - years, day=28)


def _resolve_unit_range(unit: str, count: int) -> tuple[datetime, datetime]:
    now = datetime.now()

    if unit == "day":
        return now - timedelta(days=count), now

    if unit == "week":
        return now - timedelta(weeks=count), now

    if unit == "month":
        return _subtract_months(now, count), now

    return _subtract_years(now, count), now


@router.get("/parkinglogs")
async def get_parkinglogs(
    limit: int = Query(
        default=2000,
        ge=1,
        le=10000,
        description="Number of rows to return",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Rows to skip for pagination",
    ),
    sort: str = Query(
        default="asc",
        pattern="^(asc|desc)$",
        description="Sort by timestamp",
    ),
):
    logs, _ = park_logs_service.get_log_source()
    sorted_logs = sorted(logs, key=lambda item: item["timestamp"], reverse=(sort == "desc"))
    return [park_logs_service.serialize_log(row) for row in sorted_logs[offset : offset + limit]]


@router.get("/park-logs/reports")
async def get_park_logs_reports(
    time_unit: str = Query(
        default="month",
        alias="unit",
        pattern="^(day|week|month|year)$",
        description="Lookback unit",
    ),
    unit_count: int = Query(
        default=1,
        alias="count",
        ge=1,
        le=120,
        description="Number of units to look back",
    ),
    sort: str = Query(
        default="asc",
        pattern="^(asc|desc)$",
        description="Sort order for report periods",
    ),
):
    preset = "daily"
    start_time, end_time = _resolve_unit_range(time_unit, unit_count)
    payload = _build_reports_response(
        preset=preset,
        start_time=start_time,
        end_time=end_time,
        sort=sort,
    )

    return {
        **payload,
        "unit": time_unit,
        "count": unit_count,
        "sort": sort,
        "start_time": start_time.isoformat(sep=" "),
        "end_time": end_time.isoformat(sep=" "),
    }


@router.get("/park-logs/dashboard")
async def get_park_logs_dashboard(
    start_time: datetime | None = Query(
        default=None,
        description="Start datetime (ISO), e.g. 2026-04-20T00:00:00",
    ),
    end_time: datetime | None = Query(
        default=None,
        description="End datetime (ISO), e.g. 2026-04-20T23:59:59",
    ),
    bucket: str = Query(
        default="hour",
        pattern="^(minute|hour|day)$",
        description="Time aggregation bucket",
    ),
    direction_view: str | None = Query(
        default=None,
        pattern="^(ALL|IN|OUT|FLAT)$",
        description="Direction filter (ALL, IN, OUT, FLAT)",
    ),
    is_raining: bool | None = Query(
        default=None,
        description="Filter by rain flag: true/false",
    ),
    board_temperature_min: float | None = Query(
        default=None,
        description="Minimum board temperature",
    ),
    board_temperature_max: float | None = Query(
        default=None,
        description="Maximum board temperature",
    ),
    ultrasonic_in_min: float | None = Query(
        default=None,
        ge=0,
        description="Minimum inbound ultrasonic distance (cm)",
    ),
    ultrasonic_in_max: float | None = Query(
        default=None,
        ge=0,
        description="Maximum inbound ultrasonic distance (cm)",
    ),
    ultrasonic_out_min: float | None = Query(
        default=None,
        ge=0,
        description="Minimum outbound ultrasonic distance (cm)",
    ),
    ultrasonic_out_max: float | None = Query(
        default=None,
        ge=0,
        description="Maximum outbound ultrasonic distance (cm)",
    ),
    lidar_in_min: float | None = Query(
        default=None,
        ge=0,
        description="Minimum inbound lidar distance (cm)",
    ),
    lidar_in_max: float | None = Query(
        default=None,
        ge=0,
        description="Maximum inbound lidar distance (cm)",
    ),
    lidar_out_min: float | None = Query(
        default=None,
        ge=0,
        description="Minimum outbound lidar distance (cm)",
    ),
    lidar_out_max: float | None = Query(
        default=None,
        ge=0,
        description="Maximum outbound lidar distance (cm)",
    ),
    search_id: str | None = Query(
        default=None,
        pattern="^\\d+$",
        description="Search by numeric id (partial digits allowed)",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Rows to skip for logs table pagination",
    ),
    sort: str = Query(
        default="asc",
        pattern="^(asc|desc)$",
        description="Sort order for logs table",
    ),
    anomaly_gap_in: float | None = Query(
        default=None,
        ge=0,
        description="Override sensor_gap_in threshold for anomaly detection",
    ),
    anomaly_gap_out: float | None = Query(
        default=None,
        ge=0,
        description="Override sensor_gap_out threshold for anomaly detection",
    ),
    anomaly_occ_change: float | None = Query(
        default=None,
        ge=0,
        description="Override occupancy_change threshold for anomaly detection",
    ),
):
    logs, source = park_logs_service.get_log_source()

    filtered_logs = [
        log
        for log in logs
        if park_logs_service.matches_filters(
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

    derived_logs_asc = park_logs_service.with_derived_metrics(filtered_logs)
    derived_logs_desc = sorted(derived_logs_asc, key=lambda row: row["timestamp"], reverse=True)
    trend_rows = park_logs_service.build_trends(derived_logs_asc, bucket)

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

    sensor_baselines = park_logs_service.build_sensor_baselines(derived_logs_desc)

    # Allow caller to override computed p95 thresholds
    if anomaly_gap_in is not None:
        sensor_baselines["sensor_gap_in"]["p95"] = anomaly_gap_in
    if anomaly_gap_out is not None:
        sensor_baselines["sensor_gap_out"]["p95"] = anomaly_gap_out
    if anomaly_occ_change is not None:
        sensor_baselines["occupancy_change_abs"]["p95"] = anomaly_occ_change

    anomaly_flags = park_logs_service.build_anomaly_flags(derived_logs_desc, sensor_baselines)
    correlation_matrix = park_logs_service.build_correlation_matrix(derived_logs_desc)

    all_logs_for_table = sorted(
        derived_logs_asc,
        key=lambda row: row["timestamp"],
        reverse=(sort == "desc"),
    )
    paginated_logs = all_logs_for_table[offset:]

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
            "offset": offset,
            "sort": sort,
        },
        "kpis": {
            "total_logs": total_logs,
            "current_vehicles_latest": latest_row["current_vehicles"] if latest_row else 0,
            "avg_parking_percentage": park_logs_service.avg(
                [row["parking_percentage"] for row in derived_logs_desc]
            ),
            "total_in": total_in,
            "total_out": total_out,
            "latest_net_flow": latest_row["net_flow"] if latest_row else 0,
            "rain_ratio": (len(rainy_logs) / total_logs) if total_logs else 0,
            "avg_board_temperature": park_logs_service.avg(
                [row["board_temperature"] for row in derived_logs_desc]
            ),
        },
        "direction_breakdown": direction_breakdown,
        "trends": trend_rows,
        "rain_vs_occupancy": {
            "raining_logs": len(rainy_logs),
            "dry_logs": len(dry_logs),
            "raining_avg_current_vehicles": park_logs_service.avg(
                [park_logs_service.to_float(row["current_vehicles"]) for row in rainy_logs]
            ),
            "dry_avg_current_vehicles": park_logs_service.avg(
                [park_logs_service.to_float(row["current_vehicles"]) for row in dry_logs]
            ),
        },
        "temp_vs_parking_scatter": temp_vs_parking_scatter,
        "raw_vs_converted_checks": park_logs_service.build_raw_vs_converted(derived_logs_desc),
        "board_temp_sensor_scatter": park_logs_service.build_board_temp_sensor_scatter(
            derived_logs_desc
        ),
        "sensor_baselines": sensor_baselines,
        "anomaly_flags": anomaly_flags,
        "correlation_matrix": correlation_matrix,
        "logs": [park_logs_service.serialize_log(row) for row in paginated_logs],
        "total_available_logs": len(all_logs_for_table),
        "total_filtered_logs": total_logs,
        "returned_logs": len(paginated_logs),
    }


@router.get("/park-logs/analytics")
async def get_park_logs_analytics():
    """Return ML prediction, heatmap, daily summary, day-of-week stats, temp buckets."""
    logs, _ = park_logs_service.get_log_source()
    derived_asc = park_logs_service.with_derived_metrics(logs)
    derived_asc_sorted = sorted(derived_asc, key=lambda r: r["timestamp"])

    pred_result = None
    if derived_asc_sorted:
        pred_result = prediction_service.predict_30min(derived_asc_sorted, len(derived_asc_sorted) - 1)

    return {
        "prediction": pred_result,
        "heatmap": park_logs_service.build_heatmap(derived_asc_sorted),
        "daily_summary": park_logs_service.build_daily_summary(derived_asc_sorted, days=7),
        "day_of_week": park_logs_service.build_day_of_week_stats(derived_asc_sorted),
        "temp_buckets": park_logs_service.build_temp_buckets(derived_asc_sorted),
    }


@router.get("/park-logs/ml-inference")
async def get_ml_inference():
    """Run ML model on test set (chronological 80/20 split) and return accuracy metrics."""
    logs, _ = park_logs_service.get_log_source()
    derived_asc = park_logs_service.with_derived_metrics(logs)
    derived_sorted = sorted(derived_asc, key=lambda r: r["timestamp"])

    total = len(derived_sorted)
    if total == 0:
        return {"model_available": False, "error": "No data"}

    split_idx = int(total * 0.8)
    train_rows = derived_sorted[:split_idx]
    test_rows = derived_sorted[split_idx:]

    test_points = []
    for i in range(split_idx, total):
        pred = prediction_service.predict_30min(derived_sorted, i)
        if not pred.get("model_available"):
            break
        row = derived_sorted[i]
        actual_pct = row.get("parking_percentage")
        if actual_pct is not None:
            test_points.append({
                "timestamp": row["timestamp"].isoformat(sep=" "),
                "actual_pct": round(float(actual_pct), 2),
                "predicted_pct": pred["predicted_pct"],
            })

    if not test_points:
        return {
            "model_available": False,
            "error": "Model unavailable or no test predictions generated",
            "train_count": len(train_rows),
            "test_count": len(test_rows),
        }

    errors = [abs(p["predicted_pct"] - p["actual_pct"]) for p in test_points]
    n = len(errors)
    rmse = (sum(e ** 2 for e in errors) / n) ** 0.5 if n else 0.0
    mae = sum(errors) / n if n else 0.0
    lt2 = sum(1 for e in errors if e < 2) / n * 100 if n else 0.0
    mid = sum(1 for e in errors if 2 <= e < 5) / n * 100 if n else 0.0
    gt5 = sum(1 for e in errors if e >= 5) / n * 100 if n else 0.0

    return {
        "model_available": True,
        "split_idx": split_idx,
        "train_count": len(train_rows),
        "test_count": len(test_rows),
        "train_start": train_rows[0]["timestamp"].isoformat(sep=" ") if train_rows else None,
        "train_end": train_rows[-1]["timestamp"].isoformat(sep=" ") if train_rows else None,
        "test_start": test_rows[0]["timestamp"].isoformat(sep=" ") if test_rows else None,
        "test_end": test_rows[-1]["timestamp"].isoformat(sep=" ") if test_rows else None,
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "error_distribution": {
            "lt2_pct": round(lt2, 1),
            "between_2_5_pct": round(mid, 1),
            "gt5_pct": round(gt5, 1),
        },
        "test_points": test_points,
    }


@router.get("/park-logs/sensor-health")
async def get_sensor_health():
    """Return sensor health scorecard for the 4 distance sensors."""
    logs, _ = park_logs_service.get_log_source()
    return park_logs_service.build_sensor_health(logs)
