# ゲーム統計機能の実装計画

## 概要
ゲームバランス調整を支援するため、詳細なプレイデータを収集し、可視化およびエクスポートする機能を実装します。

## 主要な変更点
### 1. 統計データの初期化 (`initStats`)
- `resourcesSpent` の詳細化
- `gainsBySource` の追加
- `roundHistory` (時系列データ) の追加

### 2. データ収集ロジック
- `recordRoundStats`: ラウンド開始時のスナップショット
- `deductResources`: 資源支払いの詳細
- `calculateVP`: VP内訳の集計

### 3. 出力
- UI上にサマリーを表示
- JSONでのファイルダウンロード
