"""Unit tests for prediction service logic (model-independent)."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub out DB/ML dependencies so tests run without Docker
from unittest.mock import MagicMock
sys.modules.setdefault("sqlalchemy", MagicMock())
sys.modules.setdefault("sqlalchemy.orm", MagicMock())
sys.modules.setdefault("app.database", MagicMock())
sys.modules.setdefault("lightgbm", MagicMock())
sys.modules.setdefault("joblib", MagicMock())

from datetime import datetime

import pytest

from app.services import prediction as pred
from tests.fixtures import make_log


# ─── Internal helpers ─────────────────────────────────────────────────────────

class TestTailAvg:
    def test_last_3(self):
        result = pred._tail_avg([10.0, 20.0, 30.0, 40.0], 3)
        assert result == pytest.approx(30.0)

    def test_all_none_returns_zero(self):
        result = pred._tail_avg([None, None], 3)
        assert result == pytest.approx(0.0)

    def test_skips_none(self):
        result = pred._tail_avg([None, 20.0, 40.0], 3)
        assert result == pytest.approx(30.0)

    def test_empty_returns_zero(self):
        assert pred._tail_avg([], 3) == pytest.approx(0.0)

    def test_n_larger_than_list(self):
        result = pred._tail_avg([10.0, 20.0], 5)
        assert result == pytest.approx(15.0)


class TestTailSum:
    def test_last_3(self):
        result = pred._tail_sum([1.0, 2.0, 3.0, 4.0], 3)
        assert result == pytest.approx(9.0)

    def test_skips_none(self):
        result = pred._tail_sum([None, 2.0, 4.0], 3)
        assert result == pytest.approx(6.0)

    def test_empty_returns_zero(self):
        assert pred._tail_sum([], 3) == pytest.approx(0.0)


# ─── predict_30min when model is absent ───────────────────────────────────────

class TestPredict30MinNoModel:
    """These tests verify the graceful fallback path when no model file is present."""

    def _make_logs(self, n: int = 5):
        return [
            make_log(
                id=i + 1,
                timestamp=datetime(2026, 4, 14, i % 24, (i % 6) * 10),
                current_vehicles=50 + i,
                parking_percentage=22.5 + i,
                net_flow=2,
                in_count=5,
                out_count=3,
                api_temperature=28.0,
                api_humidity=60.0,
                pir_in_trigger=1,
                ultrasonic_in_cm=50.0,
                ultrasonic_out_cm=45.0,
            )
            for i in range(n)
        ]

    def test_returns_dict(self):
        logs = self._make_logs()
        result = pred.predict_30min(logs, len(logs) - 1)
        assert isinstance(result, dict)

    def test_has_model_available_key(self):
        logs = self._make_logs()
        result = pred.predict_30min(logs, len(logs) - 1)
        assert "model_available" in result

    def test_graceful_fallback_when_no_model(self, monkeypatch):
        monkeypatch.setattr(pred, "_model", None)
        monkeypatch.setattr(pred, "_initialized", True)
        monkeypatch.setattr(pred, "_model_error", "test error")

        logs = self._make_logs()
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["model_available"] is False
        assert "error" in result

    def test_feature_count_matches_spec(self, monkeypatch):
        """Verify that exactly SPEC_FEATURE_COLUMNS features are built."""
        captured = []

        class FakeModel:
            def predict(self, X):
                captured.append(X)
                return [50.0]

        monkeypatch.setattr(pred, "_model", FakeModel())
        monkeypatch.setattr(pred, "_feature_columns", None)
        monkeypatch.setattr(pred, "_initialized", True)

        logs = self._make_logs(15)
        pred.predict_30min(logs, len(logs) - 1)

        assert len(captured) == 1
        assert len(captured[0][0]) == len(pred.SPEC_FEATURE_COLUMNS)

    def test_prediction_clamped_to_0_100(self, monkeypatch):
        class FakeModelHigh:
            def predict(self, X):
                return [999.0]

        class FakeModelLow:
            def predict(self, X):
                return [-50.0]

        logs = self._make_logs(5)

        monkeypatch.setattr(pred, "_model", FakeModelHigh())
        monkeypatch.setattr(pred, "_initialized", True)
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["predicted_pct"] == pytest.approx(100.0)

        monkeypatch.setattr(pred, "_model", FakeModelLow())
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["predicted_pct"] == pytest.approx(0.0)

    def test_direction_up(self, monkeypatch):
        class FakeModel:
            def predict(self, X):
                return [80.0]  # current is ~22.5

        logs = self._make_logs(5)
        monkeypatch.setattr(pred, "_model", FakeModel())
        monkeypatch.setattr(pred, "_initialized", True)
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["direction"] == "UP"

    def test_direction_down(self, monkeypatch):
        class FakeModel:
            def predict(self, X):
                return [5.0]  # current is ~26.5

        logs = self._make_logs(5)
        # Make current higher
        for log in logs:
            log["parking_percentage"] = 60.0
        monkeypatch.setattr(pred, "_model", FakeModel())
        monkeypatch.setattr(pred, "_initialized", True)
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["direction"] == "DOWN"

    def test_direction_flat(self, monkeypatch):
        class FakeModel:
            def predict(self, X):
                return [50.0]

        logs = self._make_logs(5)
        for log in logs:
            log["parking_percentage"] = 50.0
        monkeypatch.setattr(pred, "_model", FakeModel())
        monkeypatch.setattr(pred, "_initialized", True)
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["direction"] == "FLAT"

    def test_is_near_full_flag(self, monkeypatch):
        class FakeModel:
            def predict(self, X):
                return [85.0]

        logs = self._make_logs(5)
        monkeypatch.setattr(pred, "_model", FakeModel())
        monkeypatch.setattr(pred, "_initialized", True)
        result = pred.predict_30min(logs, len(logs) - 1)
        assert result["is_near_full"] is True

    def test_predicted_vehicles_calculated(self, monkeypatch):
        class FakeModel:
            def predict(self, X):
                return [50.0]

        logs = self._make_logs(5)
        monkeypatch.setattr(pred, "_model", FakeModel())
        monkeypatch.setattr(pred, "_initialized", True)
        result = pred.predict_30min(logs, len(logs) - 1)
        # 50% of 222 = 111
        assert result["predicted_vehicles"] == 111
