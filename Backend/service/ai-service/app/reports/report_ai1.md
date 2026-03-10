# AI1 Report - 7-day Salinity Forecast

- Model version: `20260310135917`
- Provinces used: Bac Lieu, Ben Tre, Ca Mau, Kien Giang, Soc Trang

## Dataset
- Granularity: daily province-level.
- Features: lag salinity, lag weather, rolling stats, seasonality, province one-hot.
- Split: 70% train, 15% val, 15% test (time-ordered, no shuffle).

## Metrics (day1/day3/day7)
| horizon | model | mae | rmse |
| --- | --- | --- | --- |
| 1 | baseline_linear | 0.4689 | 0.5509 |
| 1 | xgboost | 0.6156 | 0.7422 |
| 3 | baseline_linear | 0.5987 | 0.6939 |
| 3 | xgboost | 0.7304 | 0.8843 |
| 7 | baseline_linear | 0.9059 | 1.0289 |
| 7 | xgboost | 1.1343 | 1.3434 |

## Champion by Horizon (production)
| horizon | champion_model |
| --- | --- |
| day1 | xgboost |
| day2 | xgboost |
| day3 | xgboost |
| day4 | baseline_linear |
| day5 | baseline_linear |
| day6 | xgboost |
| day7 | xgboost |

## Full Metrics (day1..day7)
| horizon | model | mae | rmse |
| --- | --- | --- | --- |
| 1 | baseline_linear | 0.4689 | 0.5509 |
| 1 | xgboost | 0.6156 | 0.7422 |
| 2 | baseline_linear | 0.4797 | 0.5638 |
| 2 | xgboost | 0.6829 | 0.8248 |
| 3 | baseline_linear | 0.5987 | 0.6939 |
| 3 | xgboost | 0.7304 | 0.8843 |
| 4 | baseline_linear | 0.6192 | 0.7173 |
| 4 | xgboost | 0.7995 | 0.977 |
| 5 | baseline_linear | 0.7151 | 0.8258 |
| 5 | xgboost | 0.9327 | 1.1425 |
| 6 | baseline_linear | 0.8117 | 0.933 |
| 6 | xgboost | 1.0456 | 1.2587 |
| 7 | baseline_linear | 0.9059 | 1.0289 |
| 7 | xgboost | 1.1343 | 1.3434 |

## Rolling-origin Backtest Summary
| model | horizon | mae_mean | mae_std | rmse_mean | rmse_std | fold_count |
| --- | --- | --- | --- | --- | --- | --- |
| baseline_linear | 1 | 0.3515 | 0.1368 | 0.4109 | 0.1421 | 8 |
| xgboost | 1 | 0.3207 | 0.1829 | 0.3865 | 0.1929 | 8 |
| baseline_linear | 2 | 0.3791 | 0.149 | 0.4412 | 0.1537 | 8 |
| xgboost | 2 | 0.3275 | 0.214 | 0.395 | 0.2253 | 8 |
| baseline_linear | 3 | 0.4512 | 0.2156 | 0.5182 | 0.2159 | 8 |
| xgboost | 3 | 0.3584 | 0.254 | 0.4281 | 0.2681 | 8 |
| baseline_linear | 4 | 0.4934 | 0.2404 | 0.56 | 0.2402 | 8 |
| xgboost | 4 | 0.3754 | 0.2996 | 0.4468 | 0.3213 | 8 |
| baseline_linear | 5 | 0.5681 | 0.3086 | 0.6347 | 0.3054 | 8 |
| xgboost | 5 | 0.3915 | 0.3409 | 0.4686 | 0.3606 | 8 |
| baseline_linear | 6 | 0.6287 | 0.3505 | 0.6959 | 0.3451 | 8 |
| xgboost | 6 | 0.4184 | 0.3819 | 0.495 | 0.402 | 8 |
| baseline_linear | 7 | 0.6502 | 0.3633 | 0.717 | 0.3594 | 8 |
| xgboost | 7 | 0.4277 | 0.412 | 0.5066 | 0.4348 | 8 |

## Error by Season (dry vs rainy)
| model | horizon | season | mae | rmse | sample_size |
| --- | --- | --- | --- | --- | --- |
| baseline_linear | 1 | dry | 0.5747 | 0.6344 | 114 |
| baseline_linear | 1 | rainy | 0.3857 | 0.4751 | 145 |
| baseline_linear | 3 | dry | 0.8322 | 0.8766 | 114 |
| baseline_linear | 3 | rainy | 0.4151 | 0.5059 | 145 |
| baseline_linear | 7 | dry | 1.2272 | 1.2672 | 114 |
| baseline_linear | 7 | rainy | 0.6532 | 0.7927 | 145 |
| xgboost | 1 | dry | 0.9681 | 1.0122 | 114 |
| xgboost | 1 | rainy | 0.3386 | 0.4226 | 145 |
| xgboost | 3 | dry | 1.1652 | 1.2108 | 114 |
| xgboost | 3 | rainy | 0.3886 | 0.4941 | 145 |
| xgboost | 7 | dry | 1.7803 | 1.8211 | 114 |
| xgboost | 7 | rainy | 0.6265 | 0.785 | 145 |

## LSTM Pilot
| horizon | model | mae | rmse | status | note | best_hidden_size | best_dropout | best_val_rmse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |
| 2 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |
| 3 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |
| 4 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |
| 5 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |
| 6 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |
| 7 | lstm_pilot | nan | nan | skipped | LSTM pilot disabled by flag. | None | None | None |

## Regression Check vs Previous Version
| horizon | previous_rmse | current_rmse | pct_change | status |
| --- | --- | --- | --- | --- |
| 1 | 0.5509252024885476 | 0.5509252024885476 | 0.0% | pass |
| 3 | 0.6938947149438298 | 0.6938947149438298 | 0.0% | pass |
| 7 | 1.0288947837791993 | 1.0288947837791993 | 0.0% | pass |

Regression gate note:
- PASS: No horizon exceeded 10% RMSE degradation threshold.

## Charts
- Error by season chart: `/Users/macbook2024/Desktop/mekong-sight-ai/Backend/service/ai-service/app/reports/charts/error_by_season.png`

## Limitations
- Model is province-level; not optimized for per-farm microclimate.
- Missing weather values are interpolated and can reduce reliability.
- Direct multi-step forecasts are independent between horizons.