"""LightGBM 30-minute occupancy prediction service."""
from __future__ import annotations

import os
from typing import Any

PARKING_CAPACITY = 222

SPEC_FEATURE_COLUMNS = [
    "hour", "day_of_week", "is_weekend", "is_peak_hour", "minute",
    "current_vehicles", "parking_percentage", "net_flow", "in_count", "out_count",
    "rolling_avg_pct_3", "rolling_net_flow_3", "rolling_in_3", "rolling_out_3",
    "rolling_avg_pct_6",
    "lag1_pct", "lag3_pct", "lag6_pct", "lag1_net_flow",
    "api_temperature", "api_humidity",
    "pir_in_trigger", "ultrasonic_in_cm", "ultrasonic_out_cm",
]

_model: Any = None
_feature_columns: list[str] | None = None
_model_error: str | None = None
_initialized = False


def _resolve_path(env_key: str, default_relative: str) -> str:
    explicit = os.getenv(env_key)
    if explicit:
        return explicit
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(base, "..", "..", "model", default_relative))


def _init() -> None:
    global _model, _feature_columns, _model_error, _initialized
    if _initialized:
        return
    _initialized = True

    model_path = _resolve_path("MODEL_PATH", "lightgbm_finetuned_optuna.pkl")
    features_path = _resolve_path("FEATURES_PATH", "model_features.pkl")

    try:
        import joblib  # type: ignore
        _model = joblib.load(model_path)
    except Exception as exc:
        try:
            import lightgbm as lgb  # type: ignore
            _model = lgb.Booster(model_file=model_path)
        except Exception as exc2:
            _model_error = f"joblib: {exc}; lgb: {exc2}"
            return

    try:
        import joblib  # type: ignore
        loaded = joblib.load(features_path)
        _feature_columns = list(loaded)
    except Exception:
        _feature_columns = None


def _tail_avg(lst: list, n: int) -> float:
    sl = [v for v in lst[-n:] if v is not None]
    return sum(sl) / len(sl) if sl else 0.0


def _tail_sum(lst: list, n: int) -> float:
    return float(sum(v for v in lst[-n:] if v is not None))


def predict_30min(logs_ascending: list[dict[str, Any]], current_idx: int) -> dict[str, Any]:
    """Run 30-min prediction on the given row. Returns dict with 'model_available' key."""
    _init()

    if _model is None:
        return {"model_available": False, "error": _model_error or "Model not loaded"}

    window = logs_ascending[max(0, current_idx - 10): current_idx + 1]
    row = logs_ascending[current_idx]
    ts = row["timestamp"]

    pct_series = [r["parking_percentage"] for r in window]
    nf_series = [r["net_flow"] for r in window]
    in_series = [r["in_count"] for r in window]
    out_series = [r["out_count"] for r in window]

    def safe_lag(series: list, offset: int) -> float:
        idx = len(series) - offset
        if idx >= 0 and series[idx] is not None:
            return float(series[idx])
        return float(series[-1]) if series and series[-1] is not None else 0.0

    features: dict[str, float] = {
        "hour": float(ts.hour),
        "day_of_week": float(ts.weekday()),
        "is_weekend": float(int(ts.weekday() >= 5)),
        "is_peak_hour": float(int(12 <= ts.hour < 16)),
        "minute": float(ts.minute),
        "current_vehicles": float(row["current_vehicles"]),
        "parking_percentage": float(row["parking_percentage"] or 0.0),
        "net_flow": float(row["net_flow"]),
        "in_count": float(row["in_count"]),
        "out_count": float(row["out_count"]),
        "rolling_avg_pct_3": _tail_avg(pct_series, 3),
        "rolling_net_flow_3": _tail_sum(nf_series, 3),
        "rolling_in_3": _tail_sum(in_series, 3),
        "rolling_out_3": _tail_sum(out_series, 3),
        "rolling_avg_pct_6": _tail_avg(pct_series, 6),
        "lag1_pct": safe_lag(pct_series, 2),
        "lag3_pct": safe_lag(pct_series, 4),
        "lag6_pct": safe_lag(pct_series, 7),
        "lag1_net_flow": float(nf_series[-2]) if len(nf_series) >= 2 else 0.0,
        "api_temperature": float(row["api_temperature"] or 0.0),
        "api_humidity": float(row["api_humidity"] or 0.0),
        "pir_in_trigger": float(row["pir_in_trigger"]),
        "ultrasonic_in_cm": float(row["ultrasonic_in_cm"] or 0.0),
        "ultrasonic_out_cm": float(row["ultrasonic_out_cm"] or 0.0),
    }

    feature_cols = _feature_columns if _feature_columns is not None else SPEC_FEATURE_COLUMNS

    try:
        import pandas as pd
        X = pd.DataFrame([{col: features.get(col, 0.0) for col in feature_cols}])
        pred_raw = _model.predict(X)
        predicted_pct = float(max(0.0, min(100.0, float(pred_raw[0]))))
        current_pct = float(row["parking_percentage"] or 0.0)
        delta = predicted_pct - current_pct

        return {
            "model_available": True,
            "predicted_pct": round(predicted_pct, 2),
            "current_pct": round(current_pct, 2),
            "delta": round(delta, 2),
            "direction": "UP" if delta > 2 else ("DOWN" if delta < -2 else "FLAT"),
            "predicted_vehicles": round(predicted_pct * PARKING_CAPACITY / 100),
            "is_near_full": predicted_pct >= 80,
        }
    except Exception as exc:
        return {"model_available": False, "error": str(exc)}
