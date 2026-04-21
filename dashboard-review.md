# Dashboard Review — Parking Occupancy, Weather & Sensor Diagnostics
**Review date**: 21 April 2026  
**Reviewer**: Senior Data Analyst  
**Version reviewed**: Post Claude Code rebuild (v2)  
**Reference specs**: `CLAUDE.md`, `skills/dashboard-structure.md`, `skills/ml-prediction.md`, `skills/anomaly-detection.md`

---

## Overall Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Data coverage & completeness | 9/10 | ครบทุก column ที่ต้องการ |
| Visual clarity & readability | 7.5/10 | ดีขึ้นจากเดิมมาก แต่ยังมีจุดเล็กน้อย |
| Operational actionability | 8/10 | structure ชัดเจน ใช้งานได้จริง |
| ML prediction integration | 5.5/10 | feature มีแต่ตัวเลขยังผิด — ต้องแก้ด่วน |
| Anomaly detection UX | 8/10 | filter ครบ badge ชัดเจน |
| Analytics depth (Tab 2) | 8.5/10 | Heatmap ดีมาก |
| Sensor diagnostics (Tab 3) | 7/10 | ขาด Sensor Health Scorecard |
| Plan compliance vs skills files | 8.7/10 | implement ได้ 87% ของ spec |
| **Overall** | **7.6 / 10** | **+2.1 จาก version เดิม (5.5)** |

---

## สิ่งที่ทำได้ดี — ห้ามแตะ

### 1. 3-tab structure + anomaly banner ครบถ้วนตาม spec
Tab Live Monitor / Analytics / Diagnostics + Data แบ่งชัดเจน anomaly banner แสดง severity count ถูกต้อง ("0 MEDIUM, 1 LOW") dismissible ได้ผ่าน ✕ และ "View all" scroll ไปยัง anomaly table ได้ ถือว่า implement ตาม `skills/dashboard-structure.md` ได้ครบทุก requirement ในส่วน Global Layout

### 2. Hourly Occupancy Heatmap (Day × Hour) — highlight ของ Tab 2
นี่คือ component ที่มี insight value สูงที่สุดใน Dashboard ทั้งหมด pattern Thu/Fri peak มองเห็นได้ทันที ช่วง 12–15h สีเข้ม cell label แสดงค่า avg% ชัดเจน color scale green→amber ถูกต้องตาม spec ขอยกย่องเป็นพิเศษ เพราะนี่คือ P1 ที่ทีมส่งมอบได้สมบูรณ์

### 3. Daily Summary Strip — 7 วัน sparklines
Layout ดี มี avg%, peak%, total IN/OUT ครบ sparkline shape แสดง trend ได้ color coding ถูกต้อง (amber เมื่อ avg สูง เช่น Mon 13 Apr แสดง avg 50.3% เป็น amber) เรียง recent-first ตรงตาม spec

### 4. Anomaly Flags Table — filter ครบ badges ชัดเจน
Filter severity/direction/time range ทำงานได้ summary count ด้านบน "1 flags — 0 MEDIUM, 1 LOW" ถูกต้อง badge สี LOW=amber reason pill `occupancy_jump` อ่านง่าย ปรับปรุงจาก version เดิมได้มากมาก

### 5. In/Out Net Flow — toggle hide/show ทำงานได้
"Hide Net Flow" button functional สีแยก IN (teal) / OUT (pink) / Net Flow (purple) ชัดเจน ตรงกับ `COLORS` dict ใน constants

### 6. Temperature vs Occupancy — แปลงจาก scatter เป็น bucket chart สำเร็จ
การตัดสินใจเปลี่ยนจาก noisy raw scatter เป็น 2°C bucket bar chart พร้อม error bars ±1 std ถูกต้องตาม spec และทำให้ insight อ่านได้ชัดขึ้นมาก

### 7. Weather Trend — ตัด Clouds series ออกแล้ว
เหลือแค่ Temperature + Humidity dual-axis ตาม spec ไม่มี clouds ที่ correlation = -0.00 เกลื่อนอยู่แล้ว

---

## สิ่งที่ต้องแก้ไข — เรียงตาม priority

---

### 🔴 P1 Critical — แก้ก่อนทุกอย่าง

#### [BUG-01] ML Prediction card — ตัวเลขผิด logic
**ที่เห็น**: แสดง `5.11% → -0.75%` และ `~11 vehicles`  
**ที่คาดหวัง**: current vehicles = 13, current occupancy = 5.86% ตัวเลข predicted ควร consistent กัน

**วิเคราะห์ปัญหา**:
ตัวเลข `~11 vehicles` แสดงว่า `predicted_pct * 222 / 100 = 11` → `predicted_pct ≈ 4.95%` แต่ card แสดง `5.11%` ซึ่งไม่ตรงกัน แสดงว่ามี rounding หรือ calculation mismatch อยู่ที่ใดที่หนึ่ง

**จุดที่ต้องตรวจสอบ** (อ้างอิง `skills/ml-prediction.md`):
1. ตรวจสอบ `predict_30min()` ว่า feature ที่ส่งเข้า model ครบ `FEATURE_COLUMNS` 23 columns หรือไม่ โดยเฉพาะ rolling window features ที่ต้องการ history ≥6 rows
2. ตรวจสอบ `delta = predicted_pct - current_pct` ว่าคำนวณจาก `parking_percentage` ตัวเดียวกัน ไม่ใช่ mix กับ `current_vehicles` ที่ยังไม่ normalized
3. ตรวจสอบ `predicted_vehicles = round(predicted_pct * PARKING_CAPACITY / 100)` ว่าใช้ `PARKING_CAPACITY = 222` ไม่ใช่ค่า hardcode
4. ถ้า model ยังไม่ถูก connect กับ live data ให้แสดง fallback "Model unavailable" แทนการแสดงตัวเลขที่อาจผิด

**ไฟล์ที่ต้องแก้**: `logic/prediction.py` → function `predict_30min()` และ component `prediction_card`

---

#### [BUG-02] Prediction dashed line ไม่แสดงบน Occupancy Trend chart
**ที่เห็น**: chart แสดง legend "Parking %" เส้นเดียว ไม่มี predicted overlay  
**ที่คาดหวัง**: ต้องมี 2 series ตาม `skills/dashboard-structure.md` Section 1.3

**spec ที่ต้องทำ**:
```
Series 1 (solid): historical parking_percentage — สี #1D9E75 (teal)
Series 2 (dashed): predicted values — สี #378ADD (blue), borderDash: [6, 3]
Legend: "Parking %" + "Predicted"
```

ถ้า `predict_all_historical()` ยังไม่ถูก implement ให้ใช้ point prediction ล่าสุดเป็น single dot แทนก่อน แล้ว extend เป็น line ทีหลัง

**ไฟล์ที่ต้องแก้**: `tabs/tab_live.py` → Occupancy Trend chart component

---

### 🟡 P2 — แก้ใน sprint นี้

#### [IMPROVE-01] Live Occupancy Gauge — ขาด threshold markers ที่ 50% และ 80%
**ที่เห็น**: progress bar แสดง fill สีเขียว แต่ไม่มี visual marker บอก boundary  
**ที่คาดหวัง**: มีเส้นขีดหรือ tick mark ที่ตำแหน่ง 50% และ 80% บน gauge bar

**วิธีทำ (HTML/CSS)**:
```html
<div style="position: relative;">
  <!-- gauge bar -->
  <div style="position: absolute; left: 50%; top: 0; height: 100%; width: 1px; background: #EF9F27;" title="Caution: 50%"></div>
  <div style="position: absolute; left: 80%; top: 0; height: 100%; width: 1px; background: #E24B4A;" title="Critical: 80%"></div>
</div>
```

ไม่ต้องทำซับซ้อน แค่เส้นขีดสีก็พอ ผู้ใช้จะเข้าใจทันทีว่า fill เขียวอยู่ไกลจาก warning zone มากแค่ไหน

**ไฟล์ที่ต้องแก้**: `components/occupancy_gauge` (หรือ equivalent)

---

#### [IMPROVE-02] In/Out chart — ขาด red highlight สำหรับ anomaly net flow
**ที่เห็น**: chart แสดงเส้น IN/OUT/Net Flow เรียบปกติทุก point  
**ที่คาดหวัง**: จุดที่ `|net_flow| > ANOMALY_THRESHOLDS['occupancyChange']` (= 4.0) ต้องโชว์ marker พิเศษ

**วิธีทำ (Chart.js)**:
```javascript
// เพิ่ม dataset ที่ 4 เป็น scatter สีแดงเฉพาะ anomaly points
{
  type: 'scatter',
  data: netFlowData.filter(d => Math.abs(d.y) > ANOMALY_THRESHOLDS.occupancyChange),
  pointBackgroundColor: '#E24B4A',
  pointRadius: 6,
  label: 'Anomaly'
}
```

สำคัญมาก: ใน 14 วันของ data มีเหตุการณ์ surge 8 เม.ย. ที่ net_flow > 5 ถึง 10 จุด ถ้าไม่ highlight ผู้ใช้จะมองไม่เห็น event สำคัญนี้เลย

**ไฟล์ที่ต้องแก้**: `tabs/tab_live.py` → In/Out Net Flow chart

---

#### [MISSING-01] Sensor Health Scorecard ยังไม่มีใน Tab 3
**ที่เห็น**: Tab 3 มีแค่ Sensor Debug Charts (8 mini-charts) แต่ไม่มี health summary  
**ที่คาดหวัง**: 4 cards ที่ด้านบนของ Tab 3 ก่อน debug charts ตาม `skills/dashboard-structure.md` Section 3.1

**spec ที่ต้องสร้าง**:

| Sensor | Active rate | Avg (cm) | Status |
|---|---|---|---|
| Ultrasonic In | 34.1% | ค่าเฉลี่ยเมื่อ > 0 | WARN |
| Ultrasonic Out | 35.2% | ค่าเฉลี่ยเมื่อ > 0 | WARN |
| Lidar In | 34.1% | ค่าเฉลี่ยเมื่อ > 0 | WARN |
| Lidar Out | 35.2% | ค่าเฉลี่ยเมื่อ > 0 | WARN |

**Status logic** (อ้างอิง `skills/data-layer.md`):
- OK: active_rate > 50%
- WARN: 20% ≤ active_rate ≤ 50%  
- CRITICAL: active_rate < 20%

⚠️ หมายเหตุสำคัญ: ข้อมูลปัจจุบัน zero rate = 65.9% ทุก sensor จะแสดง **WARN** ทั้งหมด — นี่คือพฤติกรรมที่คาดไว้แล้ว ห้ามซ่อน ต้องแสดงให้เห็นเพื่อให้ทีม hardware รู้ว่าต้องตรวจสอบ sensor threshold

**ไฟล์ที่ต้องสร้าง/แก้**: `tabs/tab_diagnostics.py` → เพิ่ม section ก่อน debug charts

---

#### [MISSING-02] Sensor Baseline Config ยัง display-only
**ที่เห็น**: ถ้า config panel ยังเป็นแค่ read-only display (แสดงค่า threshold แต่แก้ไม่ได้)  
**ที่คาดหวัง**: editable input fields พร้อม "Save & Recompute" button ตาม Section 3.2

**spec ที่ต้องทำ**:
```
┌─────────────────────────────────────────────────┐
│ Sensor Baseline Configuration                   │
├───────────────────────────┬─────────────────────┤
│ Sensor Gap In P95         │ [  114.43  ]        │
│ Sensor Gap Out P95        │ [  114.00  ]        │
│ Occupancy Change P95      │ [   4.00   ]        │
├───────────────────────────┴─────────────────────┤
│ [Save & Recompute anomalies]                    │
│ "Changing this will affect X anomaly flags"     │
└─────────────────────────────────────────────────┘
```

คำนวณ impact count ก่อน save จาก `compute_anomaly_flags(df, new_thresholds)` แล้วแสดงตัวเลขให้ผู้ใช้เห็นว่าการเปลี่ยน threshold ส่งผลอะไรบ้าง

**ไฟล์ที่ต้องแก้**: `tabs/tab_diagnostics.py` → Sensor Baseline Config section

---

### 🔵 P3 — backlog

#### [NICE-01] Prediction Accuracy Tracker placeholder
ตาม `skills/dashboard-structure.md` Section 2.6 ให้เพิ่ม placeholder card ใน Tab 2 แม้ model ยังไม่ live เพื่อให้ layout สมบูรณ์:

```
┌──────────────────────────────────────────────────┐
│ Prediction Accuracy Tracker                      │
│                                                  │
│ Will display once prediction model is live.      │
│ Tracks daily MAE and prediction vs actual %.     │
└──────────────────────────────────────────────────┘
```

ไม่ต้องเขียน logic อะไร แค่ UI shell ไว้ก่อน

---

## Checklist สำหรับทีม

ก่อน mark Dashboard ว่า "done" ให้ตรวจสอบ:

- [ ] **[BUG-01]** `predict_30min()` output ถูกต้อง — predicted_pct, delta, predicted_vehicles consistent กัน
- [ ] **[BUG-02]** Prediction dashed line (สี #378ADD) ขึ้นบน Occupancy Trend chart พร้อม legend
- [ ] **[IMPROVE-01]** Threshold markers ที่ 50% และ 80% มองเห็นได้บน gauge bar
- [ ] **[IMPROVE-02]** Anomaly net flow points (|net_flow| > 4.0) highlighted สีแดง
- [ ] **[MISSING-01]** Sensor Health Scorecard 4 cards อยู่ด้านบน Tab 3
- [ ] **[MISSING-02]** Sensor Baseline Config เป็น editable inputs + Save & Recompute
- [ ] **[NICE-01]** Prediction Accuracy Tracker placeholder card อยู่ใน Tab 2

---

## ข้อสังเกตเพิ่มเติมจาก Senior

### เรื่อง constants
ตรวจสอบว่าไม่มีตัวเลข `222` หรือ `4.0` หรือ `114.43` เขียน hardcode inline ในไฟล์ใดๆ ทุกค่าต้องมาจาก `constants.py` เท่านั้น ทำ grep ตรวจสอบก่อน release:
```bash
grep -rn "222\|114\.43\|114\.00\b" src/ --include="*.py" | grep -v "constants"
```

### เรื่อง sensor zero rate
65.9% zero reading เป็น expected behavior ไม่ใช่ bug แต่ถ้าเราจะใช้ sensor data เป็น ML feature ใน production ต้องมีการพูดคุยกับ hardware team ว่า trigger threshold ปัจจุบันเหมาะสมหรือไม่ เพราะถ้า sensor ไม่ทริกเกอร์ตอนที่มีรถผ่าน model จะ miss signal สำคัญไป

### เรื่อง auto-refresh
ตรวจสอบว่า auto-refresh 60 วินาที work เฉพาะ Tab 1 เท่านั้น Tab 2 และ Tab 3 ไม่ควร refresh เพราะจะทำให้ scroll position reset ขณะที่ผู้ใช้กำลังดู table หรือ correlation matrix อยู่

---

*Review นี้อ้างอิงตาม spec ใน `skills/` directory ทุกประการ หากมีข้อสงสัยให้กลับไปอ่าน `CLAUDE.md` เป็นอันดับแรกเสมอ*
