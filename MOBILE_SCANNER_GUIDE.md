# Mobile App — Bubble Sheet Scanner Configuration Guide

## Overview

The mobile app scans a completed bubble sheet (photo or camera frame), decodes the embedded QR code (student ID), reads the bubbled answers using `layout_metadata`, and **grades instantly** by checking against the `answer_key` — all of which is fetched in one request. No server round-trip per sheet is needed if templates are pre-cached.

---

## 1. Authentication

All API calls require a **Bearer JWT token** in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The token is obtained via the existing auth endpoint (`POST /api/auth/login/` with email + password). The user must be a **faculty** user (role = `faculty` or `admin`).

---

## 2. What the Mobile App Needs to Fetch (One-Time, Per Template)

When a faculty user selects a course + assessment in the app, fetch the **bubble sheet template**:

```
GET /api/grading/bubble/templates/?course_id=<course-uuid>
```

### Response Payload (key fields)

| Field | Type | Description |
|---|---|---|
| `template_id` | UUID | Primary key for all subsequent calls |
| `name` | string | Template display name |
| `total_items` | int | How many questions (1-based) |
| `num_choices` | int | 2–5 (A–B through A–E) |
| `answer_key` | `{"1":"A","2":"C",...}` | **Correct answers** — hidden unless explicitly fetched |
| `layout_metadata` | object | See §3 — all bubble positions in mm |
| `has_answer_key` | bool | Whether answer_key is populated |
| `parts` | array | `[{"label":"Part I","start_item":1,"end_item":30}]` |

> **Important**: `answer_key` is **not** returned in the list endpoint (the `has_answer_key` bool tells you if one exists). Fetch the single template detail to get the actual key:

```
GET /api/grading/bubble/templates/<template_id>/
```

---

## 3. `layout_metadata` Schema (Scanner Reference)

This is the **blueprint for locating every bubble in the image**. All coordinates are in **millimeters from the top-left corner** of the page (spec coordinates). You must convert mm → pixels using the image's DPI.

```json
{
  "page_width_pt": 595.28,
  "page_height_pt": 841.89,
  "page": "A4",
  "dpi": 150,
  "capacity": 100,
  "total_items": 50,
  "bubble_radius_pt": 5.67,

  "fiducials": [
    { "x_mm": 10.0, "y_spec_mm": 10.0, "w_mm": 10, "h_mm": 10 },
    { "x_mm": 190.0, "y_spec_mm": 10.0, "w_mm": 10, "h_mm": 10 },
    { "x_mm": 10.0, "y_spec_mm": 277.0, "w_mm": 10, "h_mm": 10 },
    { "x_mm": 190.0, "y_spec_mm": 277.0, "w_mm": 10, "h_mm": 10 }
  ],

  "id_columns": {
    "x0_mm": 23.25,
    "y_top_spec_mm": 112.0,
    "num_cols": 8,
    "bubble_r_mm": 1.75,
    "col_pitch_mm": 6.5,
    "row_pitch_mm": 5.0
  },

  "answer_grid": {
    "y_start_spec_mm": 50.0,
    "header_h_mm": 8.0,
    "row_pitch_mm": 6.0,
    "bubble_r_mm": 2.0,
    "col_a": { "x0_mm": 80.0, "y_start_spec_mm": 50.0, "start_item": 1 },
    "col_b": { "x0_mm": 136.25, "y_start_spec_mm": 50.0, "start_item": 26 }
  },

  "items": {
    "1": {
      "A": { "cx_mm": 96.1, "cy_spec_mm": 62.0 },
      "B": { "cx_mm": 106.1, "cy_spec_mm": 62.0 },
      "C": { "cx_mm": 116.1, "cy_spec_mm": 62.0 },
      "D": { "cx_mm": 126.1, "cy_spec_mm": 62.0 }
    }
    // ... up to total_items
  }
}
```

### Key: Coordinate Conversion

```
dpi = image_width_px / (page_width_pt / 72.0)
cx_px = round(cx_mm * dpi / 25.4)
cy_px = round(cy_spec_mm * dpi / 25.4)       // y_spec_mm is TOP-origin
bubble_r_px = round(bubble_r_mm * dpi / 25.4)
```

> `cy_spec_mm` is measured from the **top** of the page. Standard image/camera coordinates are also top-left, so no flip is needed. Just convert mm→px at the detected DPI.

---

## 4. Scanning Algorithm (Run on Device)

### Step 1: Capture & Preprocess

1. Capture or load the image (JPEG/PNG, 150–300 DPI recommended).
2. Convert to grayscale.
3. Apply a binary threshold (e.g., Otsu or adaptive) for fiducial detection.

### Step 2: Detect Fiducials & Derive DPI

1. Locate the 4 black 10×10mm corner squares in the image.
2. Compute a perspective transform (warp) to normalize rotation/skew so the fiducials align with their expected mm positions.
3. Derive `dpi = image_pixel_width / (page_width_mm / 25.4)` after warp.

### Step 3: Decode QR Code (Student ID)

Use the device's native QR scanner (iOS: `AVFoundation`, Android: `ML Kit Barcode Scanning`) on the original (unwarped) image. The QR code is positioned at:

- **X**: `23mm → 75mm` (centered in left zone)
- **Y**: `50mm → 102mm` (52×52mm square)

This yields `student_identifier` (a string). If QR fails to decode, flag the sheet.

### Step 4: Decode Student ID Bubbles (Comb Fields)

The 8 handwritten-digit boxes sit above the ID bubble grid. The bubbles below let the student darken digits 0–9 and a dash (`-`) for each of the 8 columns.

For each column `c` (0–7):
- **X center**: `id_columns.x0_mm + c * id_columns.col_pitch_mm`
- For each row `r` (0–10, labels 0-9 then `-`):
  - **Y center**: `id_columns.y_top_spec_mm + 2.5 + r * id_columns.row_pitch_mm`
- Sample the circular region at `bubble_r_mm`, pick the darkest, and build the ID string.

### Step 5: Read Answer Bubbles

For each item number `i` from 1 to `total_items`:

1. Look up `layout_metadata.items[str(i)]`.
2. For each choice label (`"A"`, `"B"`, …):
   - Convert `cx_mm` → pixel X, `cy_spec_mm` → pixel Y (top-origin, no flip).
   - Sample a circular region of radius `bubble_r_px` (from `answer_grid.bubble_r_mm`).
   - Compute **fill ratio** = fraction of pixels below threshold 128.
3. The choice with the highest fill ratio is the detected answer.
4. Apply confidence rules:
   - If `top_fill < 0.28` → mark as `"?"` (ambiguous).
   - If `top_fill - second_fill < 0.08` → mark as `"?"` (too close).
   - If `top_fill >= 0.42` → confirmed answer.

### Step 6: Grade (Instant, On-Device)

Match `responses` against `answer_key`:

```python
correct = 0
for item_no, correct_ans in answer_key.items():
    if responses.get(str(item_no), "?") == correct_ans:
        correct += 1
score_raw = correct
max_score = len(answer_key)
score_percent = (score_raw / max_score) * 100
```

No server call needed — grading happens instantly on-device.

---

## 5. Submit Results to Server

After scanning a batch, upload each result:

```
POST /api/grading/bubble/scans/
Content-Type: multipart/form-data
```

| Field | Type | Description |
|---|---|---|
| `template_id` | string (UUID) | The template this sheet belongs to |
| `image` | file | JPEG or PNG of the scanned sheet |

**Response** (201 Created):

```json
{
  "success": true,
  "scan": {
    "scan_id": "uuid",
    "template_id": "uuid",
    "student_identifier": "2024-00123",
    "responses": { "1": "A", "2": "C", "3": "?" },
    "score_raw": "42.00",
    "score_percent": "84.00",
    "max_score": "50.00",
    "is_flagged": false,
    "flag_reason": null,
    "created_at": "2026-07-13T10:30:00Z"
  }
}
```

> **Alternative — client-side scanning**: If the app does its own OMR on-device, you can PATCH the scan to update:

```
PATCH /api/grading/bubble/scans/<scan_id>/
Content-Type: application/json
{
  "student_identifier": "2024-00123",
  "responses": { "1": "A", "2": "C" }
}
```

If `responses` is patched and an `answer_key` exists, the server **re-grades automatically** and updates `score_raw`, `score_percent`, `max_score`.

---

## 6. Fetch Existing Scans (Review)

```
GET /api/grading/bubble/templates/<template_id>/scans/
GET /api/grading/bubble/templates/<template_id>/scans/?flagged=1    (only flagged)
```

Returns:
```json
{
  "success": true,
  "scans": [ { "scan_id": "...", "student_identifier": "...", "score_percent": "84.00", ... } ]
}
```

---

## 7. Offline / Caching Strategy (For Speed)

To scan **instantly without network latency**:

1. **Pre-fetch** all templates for a course on app launch or when entering the grading screen.
2. **Cache** `layout_metadata` + `answer_key` in local storage (SQLite, Realm, or JSON file).
3. On each scan, the app does **everything locally**: QR decode → fiducial warp → bubble reading → grading.
4. Queue results and **batch-upload** when connectivity is available.

### Local Cache Schema (SQLite)

```sql
CREATE TABLE cached_templates (
    template_id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    name TEXT,
    total_items INTEGER,
    num_choices INTEGER,
    answer_key_json TEXT,       -- JSON string: {"1":"A",...}
    layout_metadata_json TEXT,  -- JSON string: the full layout_metadata
    fetched_at INTEGER          -- Unix timestamp
);
```

---

## 8. Summary of Required API Endpoints

| Endpoint | Method | Purpose | When |
|---|---|---|---|
| `/api/grading/bubble/templates/?course_id=` | GET | List templates + has_answer_key | On course select |
| `/api/grading/bubble/templates/<id>/` | GET | Full template incl. answer_key + layout_metadata | Pre-cache |
| `/api/grading/bubble/templates/<id>/scans/` | GET | List existing scans | Review |
| `/api/grading/bubble/scans/` | POST | Submit scan result | After each scan |
| `/api/grading/bubble/scans/<id>/` | PATCH | Correct a scan manually | On review fix |
| `/api/grading/bubble/scans/<id>/` | DELETE | Remove a bad scan | On review |

---

## 9. Key Design Decisions for the Mobile App

| Decision | Rationale |
|---|---|
| **Do OMR on-device** | No latency, works offline, instant grading feedback |
| **Use `layout_metadata.items` for per-item centers** | Avoids recomputing positions from grid params |
| **Detect DPI from fiducials** | Accommodates any camera resolution / zoom |
| **QR for student ID only** | Comb fields are fallback; QR is faster and more reliable |
| **Batch-upload results** | Reduces API calls, handles offline gracefully |
| **Confidence threshold at 0.42 fill** | Same as server to keep grading consistent |
| **Store filled image** | Allows faculty to review ambiguous sheets later |

---

## 10. Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| QR not decoded | Flag sheet, fall back to ID bubbles |
| No fiducials found | Reject image, ask user to retake with full page visible |
| Item confidence low | Mark as `"?"`, flag sheet, let faculty review |
| Template missing `layout_metadata` | Cannot scan — prompt faculty to regenerate PDF |
| Template missing `answer_key` | Can still scan but can't grade yet |
| Duplicate student ID | Warn user, allow override or skip |
