AI1 — DỰ BÁO ĐỘ MẶN 7 NGÀY (CORE MODEL)
1. Mục tiêu

Dự báo độ mặn 1–7 ngày tới cho từng tỉnh/farm để:

cảnh báo sớm mặn đến sớm

chủ động vận hành cống, bơm nước

hỗ trợ quyết định thu hoạch/chuyển mùa vụ (AI3)

2. Định nghĩa bài toán

Bài toán: Time-series forecasting / Regression

Input X: dữ liệu môi trường ngày t + lịch sử gần

Output y: salinity(t+1..t+7)

3. Dữ liệu cần thiết
3.1 Schema tối thiểu (mỗi dòng = 1 ngày / 1 tỉnh hoặc 1 farm)

date

province (hoặc farm_id)

salinity_ppt (target chính)

temperature_c

rainfall_mm

humidity_pct

water_level_cm

(tuỳ chọn) ph

3.2 Nguồn dữ liệu

Khí tượng: OpenWeather/Meteostat

Độ mặn: trạm quan trắc / báo cáo / dataset công khai (hoặc synthetic có mô tả rõ)

4. Feature Engineering (bắt buộc)
4.1 Lag features

sal_t-1..sal_t-14

rain_t-1..rain_t-7

temp_t-1..temp_t-7

4.2 Rolling features (chống nhiễu, phản ánh xu thế)

sal_3d_avg, sal_7d_avg

rain_7d_sum

temp_7d_avg

4.3 Seasonality

month, day_of_year, is_dry_season

(tuỳ chọn) sin(doy), cos(doy) để mô hình học chu kỳ mùa vụ tốt hơn

4.4 Province encoding

One-hot province (dữ liệu đa tỉnh)

(nâng cao) embedding nếu dùng DL

Lưu ý leakage: rolling phải .shift(1) để không nhìn tương lai.

5. Chiến lược dự báo 7 ngày
5.1 Direct multi-step (khuyến nghị)

Train 7 model riêng:

Model_1 dự báo t+1

…

Model_7 dự báo t+7

Ưu điểm: ổn định, tránh lỗi cộng dồn.

5.2 Recursive (tuỳ chọn)

Train 1 model t+1, lặp đến t+7 (dễ nhưng sai số tích luỹ).

6. Mô hình huấn luyện
6.1 Baseline

Linear Regression (bắt buộc so sánh)

6.2 Model chính

Random Forest Regressor hoặc XGBoost Regressor

6.3 Nâng cao

LSTM/GRU nếu có đủ dữ liệu và thời gian tuning

7. Split dữ liệu (chuẩn time-series)

Không shuffle.

Train: 70% thời gian đầu

Val: 15%

Test: 15% cuối
Nếu đa tỉnh: split theo thời gian trong từng tỉnh rồi gộp.

8. Đánh giá

Bắt buộc báo cáo:

MAE/RMSE cho day1, day3, day7

Biểu đồ actual vs predicted (theo tỉnh)

So sánh lỗi theo mùa: dry vs rainy

Artifacts:

artifacts/reports/ai1_metrics.csv

artifacts/figures/ai1_forecast_plot.png

9. Output model & API

Model files:

artifacts/models/ai1_forecast/salinity_day1.pkl ... salinity_day7.pkl

Endpoint:

GET /forecast7d?province=...&date=...

Output đề xuất:

{
  "province": "Ca Mau",
  "start_date": "2024-03-15",
  "forecast": [
    {"date":"2024-03-16","salinity_pred":8.9},
    ...
    {"date":"2024-03-22","salinity_pred":7.3}
  ]
}
10. Hạn chế

Nếu dữ liệu đo thực tế ít → mô hình khó tổng quát

Sai số tăng theo horizon (day7 thường lớn hơn day1)

Thiếu biến dòng chảy/sông có thể giảm chất lượng dự báo