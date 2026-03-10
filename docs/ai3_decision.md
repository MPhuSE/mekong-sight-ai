AI3 — HỖ TRỢ QUYẾT ĐỊNH CHUYỂN MÙA VỤ (DECISION SUPPORT)
1. Mục tiêu

Từ dự báo và rủi ro, hệ thống đưa ra khuyến nghị hành động cụ thể cho nông dân:

Continue rice

Prepare shrimp

Emergency harvest

2. Đầu vào / đầu ra
Input

province

crop_mode: rice/shrimp

start_date (ngày xuống giống/thả giống)

current_date

forecast_7d (từ AI1)

risk_today (từ AI2)

Output

decision

reason

actions (checklist hành động)

3. Giai đoạn (stage)

Tính từ start_date:

early / mid / late

Ví dụ lúa:

early: 0–30 ngày

mid: 31–70

late: >70

4. Decision Engine
4.1 Rule-based (core, khuyến nghị)

Ví dụ:

Nếu days_over_4ppt_7d >= 3 và stage=late → Emergency harvest

Nếu sal_pred_max_7d < 1 → Continue rice

Nếu 1–4‰ trong tháng 12–2 → Prepare shrimp

4.2 ML Decision Model (nâng cao)

Nếu có ground-truth hành động (thực tế lịch sử), train classifier dự đoán decision.

5. Đánh giá AI3

Mô phỏng 3 kịch bản:

Mặn đến sớm

Ngọt kéo dài

Bình thường

So sánh: lịch cố định vs quyết định AI3 (baseline vs proposed)

Artifacts:

artifacts/reports/ai3_simulation.csv

artifacts/figures/ai3_policy_compare.png

6. API

GET /decision?province=...&crop=rice|shrimp&start_date=...&current_date=...

Output:

{
  "decision": "Emergency harvest",
  "reason": ">=3/7 days forecast salinity > 4‰ while rice is late-stage.",
  "actions": ["Stop pumping", "Close sluice gate", "Harvest early", "Prepare shrimp rotation"]
}
7. Hạn chế

Rule-based phụ thuộc ngưỡng và kiến thức chuyên gia

ML decision cần dữ liệu ground-truth hành động để train