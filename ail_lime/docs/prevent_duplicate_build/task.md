# タスク：同名カードの重複建設制限

- [x] `simulator/game.js` に `canBuild` メソッドを実装し、重複チェックを追加する
- [x] `executeAITurn` の建設判定を `canBuild` を使用するように修正する
- [x] `showExecutionActions` の建設ボタンの表示・制御を `canBuild` に基づいて更新する
- [x] 重複建設時のUIフィードバック（ボタンテキスト変更、非活性化）を実装する
- [x] ブラウザシミュレーターで、既に建設済みのカードを再度建設できないことを確認する
