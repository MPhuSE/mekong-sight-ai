# AI1 Report - 7-day Salinity Forecast

- Model version: `20260302032759`
- Provinces used: Bac Lieu, Ben Tre, Ca Mau, Kien Giang, Soc Trang

## Dataset
- Granularity: daily province-level.
- Features: lag salinity, lag weather, rolling stats, seasonality, province one-hot.
- Split: 70% train, 15% val, 15% test (time-ordered, no shuffle).

## Metrics (day1/day3/day7)
| horizon | model | mae | rmse |
| --- | --- | --- | --- |
| 1 | baseline_linear | 0.4705 | 0.5522 |
| 1 | xgboost | 0.6172 | 0.7357 |
| 3 | baseline_linear | 0.6 | 0.6951 |
| 3 | xgboost | 0.7303 | 0.8763 |
| 7 | baseline_linear | 0.9087 | 1.0317 |
| 7 | xgboost | 1.1943 | 1.4159 |

## Champion by Horizon (production)
| horizon | champion_model |
| --- | --- |
| day1 | xgboost |
| day2 | baseline_linear |
| day3 | xgboost |
| day4 | baseline_linear |
| day5 | xgboost |
| day6 | xgboost |
| day7 | xgboost |

## Full Metrics (day1..day7)
| horizon | model | mae | rmse |
| --- | --- | --- | --- |
| 1 | baseline_linear | 0.4705 | 0.5522 |
| 1 | xgboost | 0.6172 | 0.7357 |
| 2 | baseline_linear | 0.4808 | 0.5647 |
| 2 | xgboost | 0.6567 | 0.7931 |
| 3 | baseline_linear | 0.6 | 0.6951 |
| 3 | xgboost | 0.7303 | 0.8763 |
| 4 | baseline_linear | 0.6213 | 0.7191 |
| 4 | xgboost | 0.8303 | 1.0027 |
| 5 | baseline_linear | 0.7183 | 0.8289 |
| 5 | xgboost | 0.9664 | 1.1723 |
| 6 | baseline_linear | 0.816 | 0.9375 |
| 6 | xgboost | 1.0855 | 1.3022 |
| 7 | baseline_linear | 0.9087 | 1.0317 |
| 7 | xgboost | 1.1943 | 1.4159 |

## Rolling-origin Backtest Summary
| model | horizon | mae_mean | mae_std | rmse_mean | rmse_std | fold_count |
| --- | --- | --- | --- | --- | --- | --- |
| baseline_linear | 1 | 0.3505 | 0.1372 | 0.4098 | 0.1424 | 8 |
| xgboost | 1 | 0.3324 | 0.1918 | 0.3986 | 0.2016 | 8 |
| baseline_linear | 2 | 0.3793 | 0.1497 | 0.4414 | 0.1543 | 8 |
| xgboost | 2 | 0.341 | 0.2174 | 0.4097 | 0.2303 | 8 |
| baseline_linear | 3 | 0.4506 | 0.2156 | 0.5176 | 0.216 | 8 |
| xgboost | 3 | 0.3536 | 0.2458 | 0.4211 | 0.2577 | 8 |
| baseline_linear | 4 | 0.493 | 0.2407 | 0.5596 | 0.2405 | 8 |
| xgboost | 4 | 0.3698 | 0.308 | 0.4402 | 0.3234 | 8 |
| baseline_linear | 5 | 0.5677 | 0.3091 | 0.6344 | 0.306 | 8 |
| xgboost | 5 | 0.414 | 0.3637 | 0.4962 | 0.3821 | 8 |
| baseline_linear | 6 | 0.6283 | 0.3508 | 0.6956 | 0.3455 | 8 |
| xgboost | 6 | 0.4398 | 0.3976 | 0.5199 | 0.4173 | 8 |
| baseline_linear | 7 | 0.6509 | 0.3644 | 0.7177 | 0.3605 | 8 |
| xgboost | 7 | 0.4402 | 0.4317 | 0.5216 | 0.4561 | 8 |

## Error by Season (dry vs rainy)
| model | horizon | season | mae | rmse | sample_size |
| --- | --- | --- | --- | --- | --- |
| baseline_linear | 1 | dry | 0.5768 | 0.6358 | 115 |
| baseline_linear | 1 | rainy | 0.3861 | 0.4756 | 145 |
| baseline_linear | 3 | dry | 0.8319 | 0.8765 | 115 |
| baseline_linear | 3 | rainy | 0.4161 | 0.507 | 145 |
| baseline_linear | 7 | dry | 1.2312 | 1.2707 | 115 |
| baseline_linear | 7 | rainy | 0.653 | 0.7923 | 145 |
| xgboost | 1 | dry | 0.9452 | 0.9901 | 115 |
| xgboost | 1 | rainy | 0.3571 | 0.4392 | 145 |
| xgboost | 3 | dry | 1.1385 | 1.1849 | 115 |
| xgboost | 3 | rainy | 0.4066 | 0.5132 | 145 |
| xgboost | 7 | dry | 1.8837 | 1.9247 | 115 |
| xgboost | 7 | rainy | 0.6476 | 0.8106 | 145 |

## LSTM Pilot
| horizon | model | mae | rmse | status | note | best_hidden_size | best_dropout | best_val_rmse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |
| 2 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |
| 3 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |
| 4 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |
| 5 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |
| 6 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |
| 7 | lstm_pilot | None | None | skipped | torch is unavailable. | None | None | None |

## Regression Check vs Previous Version
| horizon | previous_rmse | current_rmse | pct_change | status |
| --- | --- | --- | --- | --- |
| 1 | 0.4560735106638094 | 0.5522303595730502 | 21.08% | fail |
| 3 | 0.5710213251615174 | 0.695105093200989 | 21.73% | fail |
| 7 | 0.8392430131431479 | 1.0316713903483097 | 22.93% | fail |

Regression gate note:
- WARNING: RMSE degradation >10% detected at horizons: day1, day3, day7.

## Charts
- Error by season chart: `C:/Users/Administrator/Desktop/Mekong-sight-AI/Backend/service/ai-service/app/reports/charts/error_by_season.png`
- Actual vs predicted chart: `C:/Users/Administrator/Desktop/Mekong-sight-AI/Backend/service/ai-service/app/reports/charts/actual_vs_pred_bac_lieu.png`
- Actual vs predicted chart: `C:/Users/Administrator/Desktop/Mekong-sight-AI/Backend/service/ai-service/app/reports/charts/actual_vs_pred_ben_tre.png`
- Actual vs predicted chart: `C:/Users/Administrator/Desktop/Mekong-sight-AI/Backend/service/ai-service/app/reports/charts/actual_vs_pred_ca_mau.png`
- Actual vs predicted chart: `C:/Users/Administrator/Desktop/Mekong-sight-AI/Backend/service/ai-service/app/reports/charts/actual_vs_pred_kien_giang.png`
- Actual vs predicted chart: `C:/Users/Administrator/Desktop/Mekong-sight-AI/Backend/service/ai-service/app/reports/charts/actual_vs_pred_soc_trang.png`

## Limitations
- Model is province-level; not optimized for per-farm microclimate.
- Missing weather values are interpolated and can reduce reliability.
- Direct multi-step forecasts are independent between horizons.