# P2P対人対戦モードの実装計画

AIL LIMEシミュレーターに簡単なP2P対人対戦モードを追加します。

## 技術選定

**PeerJS** を使用
- WebRTCをシンプルに扱えるライブラリ
- 無料のクラウドシグナリングサーバー提供
- CDN経由で簡単に導入可能

## 提案する変更

### UI/接続フロー

```
┌─────────────────────────────────────────┐
│         AIL LIME Simulator Setup        │
├─────────────────────────────────────────┤
│  モード選択:                            │
│  [ローカル] [P2Pホスト] [P2P参加]       │
│                                         │
│  ※P2Pホスト: ルームIDが生成されます    │
│  ※P2P参加: ホストのルームIDを入力      │
└─────────────────────────────────────────┘
```

---

### ネットワーキング

#### [NEW] [network.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/network.js)

P2P通信を管理するモジュール:
- `NetworkManager`クラス
  - `initAsHost()`: ホストとして初期化、ルームID生成
  - `initAsGuest(hostId)`: ゲストとして接続
  - `broadcast(message)`: 全プレイヤーにメッセージ送信
  - `send(playerId, message)`: 特定プレイヤーにメッセージ送信
  - `onMessage(callback)`: メッセージ受信時のコールバック

---

### ゲームロジック

#### [MODIFY] [index.html](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/index.html)

- PeerJS CDNスクリプト追加
- `network.js`の読み込み追加
- セットアップモーダルにP2Pオプションを追加

#### [MODIFY] [game.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/game.js)

主な変更点:
1. **ネットワークモード対応**
   - `this.networkMode`: `'local'` | `'host'` | `'guest'`
   - `this.localPlayerId`: このクライアントが操作するプレイヤーID
   
2. **カード表示制御**
   - `updateUI()`でローカルプレイヤー以外の手札を裏向きで表示
   - 既存の`p.isAI`チェックを`p.id !== this.localPlayerId`に変更
   
3. **アクション制御**
   - ローカルプレイヤーのみ操作可能
   - 他プレイヤーの手番は待機状態を表示
   
4. **状態同期**
   - アクション実行時に他プレイヤーへ通知
   - 受信したアクションを適用

---

## メッセージプロトコル

```javascript
// ゲーム開始（ホスト → ゲスト）
{ type: 'GAME_START', gameState: {...} }

// カード選択（計画フェーズ）
{ type: 'CARD_SELECTED', playerId: N, cardIndex: N }

// アクション実行
{ type: 'ACTION', playerId: N, action: 'move'|'build', data: {...} }

// 状態同期
{ type: 'SYNC', gameState: {...} }
```

---

## 検証計画

### 手動テスト（ブラウザ2つ使用）

1. **ホスト開始テスト**
   - シミュレーターをブラウザで開く
   - 「P2Pホスト」を選択
   - ルームIDが表示されることを確認

2. **ゲスト接続テスト**
   - 別のブラウザタブ/ウィンドウでシミュレーターを開く
   - 「P2P参加」を選択しルームIDを入力
   - 接続が成功することを確認

3. **ゲームプレイテスト**
   - 2人プレイヤーでゲームを開始
   - 各プレイヤーが自分のカードのみ見えることを確認
   - 各プレイヤーが自分のターンのみ操作できることを確認
   - アクションが相手側に正しく反映されることを確認

---

## 制限事項

> [!NOTE]
> 初期実装では以下の制限があります:
> - 2人対戦のみ対応（3人以上は将来対応）
> - 観戦モードなし
> - 接続が切れた場合のリカバリーは限定的
