# 実装計画：UI利便性の向上

## 現状の分析
- 現在のUIは機能的だが、情報の視認性が低く、特にリソースやフェーズの進行がテキストのみで分かりにくい。
- ログエリアが小さく、過去の履歴を確認しづらい。
- インタラクティブな要素（カード、マップノード）のフィードバックが弱い。

## 修正方針
1. **リソース表示のアイコン化**: CSSで定義されているトークンクラスを適用し、F/M/K/W/RTを視覚的に分かりやすくする。
2. **ヘッダーとフェーズ表示の刷新**: 現在のフェーズを強調し、ゲームの進行度を一目で分かるようにする。
3. **アクティブプレイヤーの強調**: ターンが回っているプレイヤーのカードやエリアをエフェクト（グロー、枠線の強調）で目立たせる。
4. **ログのデザイン改善**: ログにタイムスタンプ（ラウンド数）を表示し、重要なイベント（ビルド、移動）を色分けする。
5. **インタラクティブ要素の磨き上げ**: 
    - カードのホバー時に少し浮かび上がる、または拡大するアニメーション。
    - 移動先候補のノードに波紋（パルス）エフェクト。

### 4. 動的VP計算と残存トークン表示
- **[MODIFY] [game.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/game.js)**
    - `updateUI` 内で各プレイヤーのVPを都度計算し、表示を更新。
    - ゲーム全体の「残存周回トークン数」をヘッダーに表示するロジックを追加。
- **[MODIFY] [index.html](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/index.html)**
    - ヘッダーに残存周回トークンを表示するための要素を追加。

### 5. AI思考中の操作制限とボタン改善
- **[MODIFY] [game.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/game.js)**
    - 「Confirm」ボタン押下直後にボタンを無効化し、AIの思考（ターン処理）が終わるまで再表示・有効化されないように制御。
    - クイック確定ボタンの位置を、手札エリア内に固定ではなく、操作しやすい位置（プレイヤーHUD付近）に再配置。

### 3. リソース配色とアイコン化
- **[MODIFY] [style.css](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/style.css)**
    - ユーザー指定の配色を適用:
        - **F (Fuel)**: 黄色 (`#f1c40f`)
        - **M (Material)**: 赤色 (`#e74c3c`)
        - **K (K-Culture)**: 青色 (`#3498db`)
        - **W (Wild)**: 白色 (`#ecf0f1`)
        - **RT (Round Token)**: 緑色 (`#2ecc71`)

## 変更ファイル
- `simulator/style.css`: スタイルの追加・修正
- `simulator/game.js`: UI更新ロジックの修正
- `simulator/index.html`: 構造の微調整（必要に応じて）

## ステップ
1. **CSSの強化**: 
    - グローバルな変数、アニメーション、トークンのスタイルを整理。
    - アクティブプレイヤークラスの定義を強化。
2. **Resource UIの変更**: `game.js` の `updateUI` 内でリソースをアイコン付きのHTMLに変換。
3. **ログのリファクタリング**: `log()` メソッドを改善し、メッセージの種類を受け取れるようにする。
4. **カードとノードの視覚効果追加**: CSS transitionとanimationを活用。
5. **最終調整**: 各デバイスでの見え方（レスポンシブ）を確認。
