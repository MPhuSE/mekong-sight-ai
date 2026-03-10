PHÂN LOẠI RỦI RO (LOW / MEDIUM / HIGH)
1. Mục tiêu

Phân loại mức rủi ro ngày hiện tại nhằm:

đơn giản hoá cảnh báo (màu xanh-vàng-đỏ)

ưu tiên xử lý rủi ro cao

cung cấp đầu vào cho AI3

2. Định nghĩa bài toán

Bài toán: Classification 3 lớp

Input: salinity + khí tượng + pH + mực nước (+ xu thế)

Output: risk_label ∈ {Low, Medium, High}

3. Dữ liệu cần thiết

Tối thiểu:

salinity_ppt, temperature_c, rainfall_mm, ph, water_level_cm

date, province

risk_label

Khuyến nghị thêm:

lag/rolling + biến biến động (sal_change_1d)

seasonality

4. Cách tạo label
4.1 Rule-based (baseline, nhanh)

Tính Risk Index (normalize 0–1) rồi cắt ngưỡng Low/Med/High.

Tránh leakage: không dùng risk_index làm feature nếu label sinh từ risk_index.

4.2 Ground-truth (mạnh hơn)

Label từ sự kiện: ngày đóng cống, cảnh báo mặn, thiệt hại lúa/tôm.

5. Mô hình train

Baseline:

Logistic Regression (class_weight="balanced")

Main:

Random Forest / XGBoost Classifier

6. Split & huấn luyện

Split theo thời gian (không shuffle)

Nếu stratify bị lỗi do lớp quá ít → bỏ stratify hoặc điều chỉnh ngưỡng label

7. Đánh giá

Accuracy (tham khảo)

Precision/Recall/F1 theo lớp

Macro F1

Recall lớp High

Confusion matrix

Artifacts:

artifacts/models/ai2_risk/risk_model.pkl

artifacts/reports/ai2_metrics.csv

artifacts/figures/ai2_confusion_matrix.png

8. API

GET /risk?province=...&date=...

Output:

{
  "province": "Bac Lieu",
  "date": "2024-03-15",
  "risk_label": "High",
  "risk_score": 0.86
}
9. Hạn chế

Nếu label rule-based → AI2 học lại luật, giá trị “AI” giảm

Class imbalance (High ít) cần class_weight/oversampling hoặc chỉnh ngưỡng