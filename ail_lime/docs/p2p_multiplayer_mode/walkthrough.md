# P2P対人対戦モード実装 Walkthrough

## 概要

AIL LIMEシミュレーターに簡単なP2P対人対戦モードを実装しました。

## 変更ファイル

### 新規作成
- [network.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/network.js) - PeerJSを使用したネットワーキング層

### 修正
- [index.html](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/index.html) - P2P接続UI追加
- [game.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/game.js) - P2Pゲームロジック
- [style.css](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/style.css) - モードボタンスタイル

## 使用方法

### ホスト側
1. シミュレーターを開く
2. 「P2Pホスト」ボタンをクリック
3. 表示されたルームID（例: `AIL-ABC123`）を相手に伝える
4. 相手が接続したら「P2P対戦開始」をクリック

### ゲスト側
1. 別のブラウザ/タブでシミュレーターを開く
2. 「P2P参加」ボタンをクリック
3. ホストから教えてもらったルームIDを入力
4. 「接続」ボタンをクリック

## 実装詳細

- **2人対戦固定**
- 各プレイヤーは自分のカードのみ表示・操作可能
- 相手のカードは裏向きで表示
- PeerJSの無料クラウドシグナリングサーバーを使用

## テスト手順

1. ブラウザで`index.html`を開く
2. 「P2Pホスト」を選択
3. 新しいタブで同じファイルを開く
4. 「P2P参加」を選択しルームIDを入力
5. 接続後、ホスト側で「P2P対戦開始」をクリック
