"""Unit tests for park_logs_service logic functions."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub out DB dependencies so tests run without Docker
from unittest.mock import MagicMock
sys.modules.setdefault("sqlalchemy", MagicMock())
sys.modules.setdefault("sqlalchemy.orm", MagicMock())
sys.modules.setdefault("app.database", MagicMock())

import math
from datetime import datetime

import pytest

from app.services import park_logs_service as svc
from tests.fixtures import make_log


# ─── Private helper unit tests ────────────────────────────────────────────────

class TestToFloat:
    def test_int(self):
        assert svc._to_float(5) == 5.0

    def test_string(self):
        assert svc._to_float("3.14") == pytest.approx(3.14)

    def test_none(self):
        assert svc._to_float(None) is None

    def test_invalid_string(self):
        assert svc._to_float("abc") is None


class TestToBool:
    def test_true_int(self):
        assert svc._to_bool(1) is True

    def test_false_int(self):
        assert svc._to_bool(0) is False

    def test_true_string(self):
        assert svc._to_bool("true") is True
        assert svc._to_bool("1") is True
        assert svc._to_bool("yes") is True

    def test_false_string(self):
        assert svc._to_bool("0") is False
        assert svc._to_bool("false") is False

    def test_bool_passthrough(self):
        assert svc._to_bool(True) is True
        assert svc._to_bool(False) is False


class TestToDatetime:
    def test_datetime_passthrough(self):
        dt = datetime(2026, 4, 14, 10, 0)
        assert svc._to_datetime(dt) == dt

    def test_iso_string(self):
        result = svc._to_datetime("2026-04-14T10:00:00")
        assert result == datetime(2026, 4, 14, 10, 0, 0)

    def test_invalid_returns_none(self):
        assert svc._to_datetime("not-a-date") is None

    def test_none_returns_none(self):
        assert svc._to_datetime(None) is None

    def test_z_suffix_stripped(self):
        result = svc._to_datetime("2026-04-14T10:00:00Z")
        assert result is not None
        assert result.tzinfo is None


class TestDirectionView:
    def test_positive_net_flow(self):
        assert svc._direction_view(5) == "IN"

    def test_negative_net_flow(self):
        assert svc._direction_view(-3) == "OUT"

    def test_zero_net_flow(self):
        assert svc._direction_view(0) == "FLAT"


class TestAvg:
    def test_basic(self):
        assert svc._avg([1.0, 2.0, 3.0]) == pytest.approx(2.0)

    def test_with_none(self):
        assert svc._avg([1.0, None, 3.0]) == pytest.approx(2.0)

    def test_all_none(self):
        assert svc._avg([None, None]) is None

    def test_empty(self):
        assert svc._avg([]) is None


class TestPercentile:
    def test_p50_odd(self):
        result = svc._percentile([1.0, 2.0, 3.0, 4.0, 5.0], 0.5)
        assert result == pytest.approx(3.0)

    def test_p95(self):
        values = list(range(1, 21))  # 1..20
        result = svc._percentile([float(v) for v in values], 0.95)
        assert result is not None
        assert 19.0 <= result <= 20.0

    def test_single_value(self):
        assert svc._percentile([42.0], 0.5) == pytest.approx(42.0)

    def test_empty_returns_none(self):
        assert svc._percentile([], 0.5) is None


class TestPearson:
    def test_perfect_positive(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [2.0, 4.0, 6.0, 8.0, 10.0]
        assert svc._pearson(x, y) == pytest.approx(1.0, abs=1e-9)

    def test_perfect_negative(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [10.0, 8.0, 6.0, 4.0, 2.0]
        assert svc._pearson(x, y) == pytest.approx(-1.0, abs=1e-9)

    def test_no_variance_returns_none(self):
        x = [5.0, 5.0, 5.0]
        y = [1.0, 2.0, 3.0]
        assert svc._pearson(x, y) is None

    def test_too_short_returns_none(self):
        assert svc._pearson([1.0, 2.0], [3.0, 4.0]) is None

    def test_mismatched_length_returns_none(self):
        assert svc._pearson([1.0, 2.0, 3.0], [1.0, 2.0]) is None


class TestInRange:
    def test_within_range(self):
        assert svc._in_range(5.0, 0.0, 10.0) is True

    def test_below_min(self):
        assert svc._in_range(1.0, 5.0, 10.0) is False

    def test_above_max(self):
        assert svc._in_range(15.0, 5.0, 10.0) is False

    def test_none_value_returns_false(self):
        assert svc._in_range(None, 0.0, 10.0) is False

    def test_no_min(self):
        assert svc._in_range(100.0, None, 200.0) is True

    def test_no_max(self):
        assert svc._in_range(100.0, 50.0, None) is True


# ─── Derived metrics ──────────────────────────────────────────────────────────

class TestWithDerivedMetrics:
    def _make_asc_logs(self):
        return [
            make_log(id=1, timestamp=datetime(2026, 4, 14, 10, 0), current_vehicles=40,
                     ultrasonic_in_cm=50.0, lidar_in_cm=60.0,
                     ultrasonic_out_cm=30.0, lidar_out_cm=45.0),
            make_log(id=2, timestamp=datetime(2026, 4, 14, 10, 10), current_vehicles=45,
                     ultrasonic_in_cm=50.0, lidar_in_cm=60.0,
                     ultrasonic_out_cm=30.0, lidar_out_cm=45.0),
            make_log(id=3, timestamp=datetime(2026, 4, 14, 10, 20), current_vehicles=50,
                     ultrasonic_in_cm=50.0, lidar_in_cm=60.0,
                     ultrasonic_out_cm=30.0, lidar_out_cm=45.0),
        ]

    def test_returns_correct_count(self):
        logs = self._make_asc_logs()
        result = svc._with_derived_metrics(logs)
        assert len(result) == 3

    def test_occupancy_change_computed(self):
        logs = self._make_asc_logs()
        result = svc._with_derived_metrics(logs)
        # first row has no prior → None
        assert result[0]["occupancy_change"] is None
        assert result[1]["occupancy_change"] == pytest.approx(5.0)
        assert result[2]["occupancy_change"] == pytest.approx(5.0)

    def test_sensor_gap_in_computed(self):
        logs = self._make_asc_logs()
        result = svc._with_derived_metrics(logs)
        # 10 minutes between the first two PIR inbound triggers
        assert result[1]["sensor_gap_in"] == pytest.approx(600.0)

    def test_sensor_gap_out_computed(self):
        logs = self._make_asc_logs()
        for row in logs:
            row["pir_out_trigger"] = 1
        result = svc._with_derived_metrics(logs)
        # 10 minutes between the first two PIR outbound triggers
        assert result[1]["sensor_gap_out"] == pytest.approx(600.0)

    def test_sensor_gap_none_when_missing(self):
        log = make_log(id=1, ultrasonic_in_cm=None, lidar_in_cm=None)
        result = svc._with_derived_metrics([log])
        assert result[0]["sensor_gap_in"] is None

    def test_output_sorted_ascending(self):
        logs = [
            make_log(id=2, timestamp=datetime(2026, 4, 14, 10, 20)),
            make_log(id=1, timestamp=datetime(2026, 4, 14, 10, 0)),
        ]
        result = svc._with_derived_metrics(logs)
        assert result[0]["id"] == 1
        assert result[1]["id"] == 2


# ─── Anomaly detection ────────────────────────────────────────────────────────

class TestBuildAnomalyFlags:
    def _baselines(self, gap_in=114.43, gap_out=114.0, occ=4.0):
        return {
            "sensor_gap_in": {"p95": gap_in},
            "sensor_gap_out": {"p95": gap_out},
            "occupancy_change_abs": {"p95": occ},
        }

    def test_no_anomaly_when_clean(self):
        log = make_log(
            net_flow=2, in_count=5, out_count=3,
            current_vehicles=50, parking_percentage=22.52,
            sensor_gap_in=10.0, sensor_gap_out=10.0,
            occupancy_change=1.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert result == []

    def test_sensor_gap_in_outlier(self):
        log = make_log(
            pir_in_trigger=1,
            sensor_gap_in=200.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert any("sensor_gap_in_outlier" in r["reasons"] for r in result)

    def test_sensor_gap_out_outlier(self):
        log = make_log(
            pir_out_trigger=1,
            sensor_gap_out=200.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert any("sensor_gap_out_outlier" in r["reasons"] for r in result)

    def test_occupancy_jump(self):
        log = make_log(
            occupancy_change=10.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert any("occupancy_jump" in r["reasons"] for r in result)

    def test_sensor_gap_ignored_without_pir_trigger(self):
        log = make_log(
            pir_in_trigger=0,
            sensor_gap_in=200.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert result == []

    def test_severity_low_one_reason(self):
        log = make_log(pir_in_trigger=1, sensor_gap_in=200.0)
        result = svc._build_anomaly_flags([log], self._baselines())
        assert result[0]["severity"] == "LOW"

    def test_severity_medium_two_reasons(self):
        log = make_log(
            pir_in_trigger=1,
            sensor_gap_in=200.0,
            occupancy_change=10.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert result[0]["severity"] == "MEDIUM"

    def test_severity_remains_low_for_single_reason(self):
        log = make_log(
            pir_in_trigger=1,
            sensor_gap_in=200.0,
        )
        result = svc._build_anomaly_flags([log], self._baselines())
        assert result[0]["severity"] == "LOW"

    def test_max_items_limit(self):
        logs = [
            make_log(id=i, pir_in_trigger=1, sensor_gap_in=200.0)
            for i in range(50)
        ]
        result = svc._build_anomaly_flags(logs, self._baselines(), max_items=10)
        assert len(result) == 10

    def test_result_contains_direction_field(self):
        log = make_log(pir_in_trigger=1, sensor_gap_in=200.0, direction_view="IN")
        result = svc._build_anomaly_flags([log], self._baselines())
        assert result[0]["direction"] == "IN"
        assert result[0]["direction_view"] == "IN"


# ─── Heatmap ──────────────────────────────────────────────────────────────────

class TestBuildHeatmap:
    def test_structure(self):
        logs = [
            make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=50.0),  # Monday
            make_log(id=2, timestamp=datetime(2026, 4, 14, 13, 0), parking_percentage=60.0),
        ]
        result = svc.build_heatmap(logs)
        assert "cells" in result
        assert "days" in result
        assert "hours" in result
        assert len(result["cells"]) == 7 * 24  # 168 cells total

    def test_avg_computed_correctly(self):
        # 2026-04-14 is a Tuesday
        logs = [
            make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=40.0),
            make_log(id=2, timestamp=datetime(2026, 4, 14, 12, 10), parking_percentage=60.0),
        ]
        result = svc.build_heatmap(logs)
        tuesday_12 = next(c for c in result["cells"] if c["day"] == "Tuesday" and c["hour"] == 12)
        assert tuesday_12["avg_pct"] == pytest.approx(50.0)
        assert tuesday_12["count"] == 2

    def test_empty_cell_is_none(self):
        # 2026-04-14 is a Tuesday; Monday hour 1 will be empty
        logs = [make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=50.0)]
        result = svc.build_heatmap(logs)
        monday_1am = next(c for c in result["cells"] if c["day"] == "Monday" and c["hour"] == 1)
        assert monday_1am["avg_pct"] is None
        assert monday_1am["count"] == 0

    def test_skips_none_pct(self):
        logs = [make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=None)]
        result = svc.build_heatmap(logs)
        monday_12 = next(c for c in result["cells"] if c["day"] == "Monday" and c["hour"] == 12)
        assert monday_12["avg_pct"] is None


# ─── Daily summary ────────────────────────────────────────────────────────────

class TestBuildDailySummary:
    def _logs(self):
        return [
            make_log(id=1, timestamp=datetime(2026, 4, 14, 10, 0), parking_percentage=30.0,
                     in_count=3, out_count=1),
            make_log(id=2, timestamp=datetime(2026, 4, 14, 14, 0), parking_percentage=70.0,
                     in_count=5, out_count=2),
            make_log(id=3, timestamp=datetime(2026, 4, 13, 10, 0), parking_percentage=20.0,
                     in_count=2, out_count=1),
        ]

    def test_returns_up_to_n_days(self):
        result = svc.build_daily_summary(self._logs(), days=2)
        assert len(result) == 2

    def test_sorted_most_recent_first(self):
        result = svc.build_daily_summary(self._logs(), days=7)
        dates = [r["date"] for r in result]
        assert dates == sorted(dates, reverse=True)

    def test_avg_and_max_pct(self):
        result = svc.build_daily_summary(self._logs(), days=7)
        apr14 = next(r for r in result if r["date"] == "2026-04-14")
        assert apr14["avg_pct"] == pytest.approx(50.0)
        assert apr14["max_pct"] == pytest.approx(70.0)

    def test_total_in_out(self):
        result = svc.build_daily_summary(self._logs(), days=7)
        apr14 = next(r for r in result if r["date"] == "2026-04-14")
        assert apr14["total_in"] == 8
        assert apr14["total_out"] == 3

    def test_sparkline_length(self):
        result = svc.build_daily_summary(self._logs(), days=7)
        for row in result:
            assert len(row["sparkline"]) == 24


# ─── Sensor health ────────────────────────────────────────────────────────────

class TestBuildSensorHealth:
    def test_empty_logs(self):
        assert svc.build_sensor_health([]) == {}

    def test_all_sensors_active(self):
        logs = [
            make_log(id=i, ultrasonic_in_cm=50.0, ultrasonic_out_cm=45.0,
                     lidar_in_cm=55.0, lidar_out_cm=48.0)
            for i in range(10)
        ]
        result = svc.build_sensor_health(logs)
        for name in ["Ultrasonic In", "Ultrasonic Out", "Lidar In", "Lidar Out"]:
            assert result[name]["active_rate"] == 100.0
            assert result[name]["status"] == "OK"

    def test_all_sensors_zero(self):
        logs = [
            make_log(id=i, ultrasonic_in_cm=0.0, ultrasonic_out_cm=0.0,
                     lidar_in_cm=0.0, lidar_out_cm=0.0)
            for i in range(10)
        ]
        result = svc.build_sensor_health(logs)
        for name in ["Ultrasonic In", "Ultrasonic Out", "Lidar In", "Lidar Out"]:
            assert result[name]["active_rate"] == 0.0
            assert result[name]["status"] == "CRITICAL"

    def test_status_warn_threshold(self):
        # 3 active out of 10 = 30% → WARN (>20% but ≤50%)
        logs = (
            [make_log(id=i, ultrasonic_in_cm=50.0) for i in range(3)]
            + [make_log(id=i + 3, ultrasonic_in_cm=0.0) for i in range(7)]
        )
        result = svc.build_sensor_health(logs)
        assert result["Ultrasonic In"]["status"] == "WARN"


# ─── Day of week stats ────────────────────────────────────────────────────────

class TestBuildDayOfWeekStats:
    def test_structure(self):
        logs = [make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=50.0)]
        result = svc.build_day_of_week_stats(logs)
        assert "days" in result
        assert "overall_avg" in result
        assert len(result["days"]) == 7

    def test_day_order(self):
        logs = [make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=50.0)]
        result = svc.build_day_of_week_stats(logs)
        day_names = [d["day"] for d in result["days"]]
        expected = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        assert day_names == expected

    def test_avg_computed(self):
        # 2026-04-14 is a Tuesday
        logs = [
            make_log(id=1, timestamp=datetime(2026, 4, 14, 10, 0), parking_percentage=40.0),
            make_log(id=2, timestamp=datetime(2026, 4, 14, 11, 0), parking_percentage=60.0),
        ]
        result = svc.build_day_of_week_stats(logs)
        tuesday = next(d for d in result["days"] if d["day"] == "Tuesday")
        assert tuesday["avg_pct"] == pytest.approx(50.0)
        assert tuesday["count"] == 2

    def test_empty_day_is_none(self):
        logs = [make_log(id=1, timestamp=datetime(2026, 4, 14, 12, 0), parking_percentage=50.0)]
        result = svc.build_day_of_week_stats(logs)
        monday = next(d for d in result["days"] if d["day"] == "Monday")
        assert monday["avg_pct"] is None

    def test_overall_avg(self):
        logs = [
            make_log(id=1, timestamp=datetime(2026, 4, 14, 10, 0), parking_percentage=40.0),
            make_log(id=2, timestamp=datetime(2026, 4, 15, 10, 0), parking_percentage=60.0),
        ]
        result = svc.build_day_of_week_stats(logs)
        assert result["overall_avg"] == pytest.approx(50.0)


# ─── Temp buckets ─────────────────────────────────────────────────────────────

class TestBuildTempBuckets:
    def test_basic_bucketing(self):
        logs = [
            make_log(id=1, api_temperature=20.5, parking_percentage=30.0),
            make_log(id=2, api_temperature=21.0, parking_percentage=40.0),
            make_log(id=3, api_temperature=25.0, parking_percentage=70.0),
        ]
        result = svc.build_temp_buckets(logs, bucket_size=2.0)
        assert len(result) >= 2
        floors = [b["temp_floor"] for b in result]
        assert 20.0 in floors
        assert 24.0 in floors

    def test_avg_pct_in_bucket(self):
        logs = [
            make_log(id=1, api_temperature=20.0, parking_percentage=30.0),
            make_log(id=2, api_temperature=20.5, parking_percentage=50.0),
        ]
        result = svc.build_temp_buckets(logs, bucket_size=2.0)
        bucket = next(b for b in result if b["temp_floor"] == 20.0)
        assert bucket["avg_pct"] == pytest.approx(40.0)

    def test_skips_none_temperature(self):
        logs = [
            make_log(id=1, api_temperature=None, parking_percentage=50.0),
            make_log(id=2, api_temperature=20.0, parking_percentage=50.0),
        ]
        result = svc.build_temp_buckets(logs, bucket_size=2.0)
        assert len(result) == 1

    def test_empty_logs(self):
        assert svc.build_temp_buckets([]) == []


# ─── Sensor baselines ─────────────────────────────────────────────────────────

class TestBuildSensorBaselines:
    def test_structure(self):
        logs = [
            make_log(id=i, sensor_gap_in=float(i * 10), sensor_gap_out=float(i * 5),
                     occupancy_change=float(i))
            for i in range(1, 11)
        ]
        result = svc._build_sensor_baselines(logs)
        assert "sensor_gap_in" in result
        assert "sensor_gap_out" in result
        assert "occupancy_change_abs" in result
        assert "p95" in result["sensor_gap_in"]
        assert "p50" in result["sensor_gap_in"]

    def test_p95_greater_than_p50(self):
        logs = [
            make_log(id=i, sensor_gap_in=float(i), sensor_gap_out=float(i))
            for i in range(1, 21)
        ]
        result = svc._build_sensor_baselines(logs)
        assert result["sensor_gap_in"]["p95"] > result["sensor_gap_in"]["p50"]

    def test_none_gaps_excluded(self):
        logs = [
            make_log(id=1, sensor_gap_in=None, sensor_gap_out=None, occupancy_change=None),
        ]
        result = svc._build_sensor_baselines(logs)
        assert result["sensor_gap_in"]["p95"] is None


# ─── Matches filters ──────────────────────────────────────────────────────────

class TestMatchesFilters:
    def _base_log(self):
        return make_log(
            id=1,
            timestamp=datetime(2026, 4, 14, 12, 0),
            direction_view="IN",
            is_raining=False,
            board_temperature=35.0,
            ultrasonic_in_cm=50.0,
            ultrasonic_out_cm=45.0,
            lidar_in_cm=55.0,
            lidar_out_cm=48.0,
        )

    def _call(self, log, **kwargs):
        defaults = dict(
            start_time=None, end_time=None, direction_view=None, is_raining=None,
            board_temperature_min=None, board_temperature_max=None,
            ultrasonic_in_min=None, ultrasonic_in_max=None,
            ultrasonic_out_min=None, ultrasonic_out_max=None,
            lidar_in_min=None, lidar_in_max=None,
            lidar_out_min=None, lidar_out_max=None,
            search_id=None,
        )
        defaults.update(kwargs)
        return svc._matches_filters(log=log, **defaults)

    def test_no_filters_passes(self):
        assert self._call(self._base_log()) is True

    def test_start_time_filter(self):
        log = self._base_log()
        too_early = datetime(2026, 4, 14, 13, 0)
        assert self._call(log, start_time=too_early) is False
        assert self._call(log, start_time=datetime(2026, 4, 14, 11, 0)) is True

    def test_end_time_filter(self):
        log = self._base_log()
        too_late = datetime(2026, 4, 14, 11, 0)
        assert self._call(log, end_time=too_late) is False
        assert self._call(log, end_time=datetime(2026, 4, 14, 13, 0)) is True

    def test_direction_filter(self):
        log = self._base_log()
        assert self._call(log, direction_view="IN") is True
        assert self._call(log, direction_view="OUT") is False
        assert self._call(log, direction_view="ALL") is True

    def test_is_raining_filter(self):
        log = self._base_log()
        assert self._call(log, is_raining=False) is True
        assert self._call(log, is_raining=True) is False

    def test_board_temp_range(self):
        log = self._base_log()
        assert self._call(log, board_temperature_min=30.0, board_temperature_max=40.0) is True
        assert self._call(log, board_temperature_min=36.0) is False

    def test_search_id_partial(self):
        log = self._base_log()
        assert self._call(log, search_id="1") is True
        assert self._call(log, search_id="99") is False

    def test_ultrasonic_in_range(self):
        log = self._base_log()
        assert self._call(log, ultrasonic_in_min=40.0, ultrasonic_in_max=60.0) is True
        assert self._call(log, ultrasonic_in_min=60.0) is False
