class Game {
    /**
     * ゲーム管理クラス
     * ゲームの状態管理、進行、UI連携、ネットワーク通信を統括します。
     */
    constructor() {
        // --- ゲーム状態 ---
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.round = 1;
        this.phase = "setup"; // setup, plan, execute, replenish
        this.startPlayerIndex = 0;
        this.currentPlayerIndex = 0;
        this.playerCount = 5; // デフォルト人数
        this.turnsPlayedInRound = 0;

        // --- 設定・モード ---
        this.simulationMode = false;
        this.simSpeed = 500; // AIのアクションウェイト(ms)

        // --- P2Pネットワーク ---
        this.networkMode = 'local'; // 'local' | 'host' | 'guest'
        this.localPlayerId = 0; // ローカルクライアントのID
        this.p2pReady = false; // P2P接続維持フラグ

        // --- UI要素 ---
        this.setupModal = document.getElementById('setup-modal-overlay');
        this.gameContainer = document.getElementById('game-container');
        this.mapContainer = document.getElementById('map-container');
        this.tokensLayer = document.getElementById('tokens-layer');
        this.humanArea = document.getElementById('human-player-area');
        this.opponentsArea = document.getElementById('opponents-area');
        this.logPanel = document.getElementById('log-area');
        this.nextPhaseBtn = document.getElementById('btn-next-phase');
        this.dynamicActions = document.getElementById('dynamic-actions');

        // --- アクション状態 ---
        this.resolvingAction = false;
        this.mainActionTaken = false; // 1ターン1アクション制限
        this.roundTokens = 30; // 後に再設定される初期値

        this.initStats();

        this.nextPhaseBtn.addEventListener('click', () => this.advancePhase());

        this.initSetupUI();
    }

    /**
     * ゲームバランス分析用の統計データを初期化
     */
    initStats() {
        this.stats = {
            resourcesGained: { F: 0, M: 0, K: 0, W: 0, Card: 0, FMK: 0 },
            resourcesSpent: { F: 0, M: 0, K: 0, W: 0, W_as_F: 0, W_as_M: 0, W_as_K: 0 },
            gainsBySource: {
                move: { F: 0, M: 0, K: 0, W: 0 },
                production: { F: 0, M: 0, K: 0, W: 0 },
                move_bonus: { F: 0, M: 0, K: 0, W: 0 },
                other: { F: 0, M: 0, K: 0, W: 0 }
            },
            cardsBuilt: {}, // カード別建設数 { id: { count, name, vpContribution } }
            totalVPBySource: {
                static: 0,
                variable: 0,
                tokens: 0
            },
            roundHistory: [] // ラウンド毎の状態履歴
        };
    }

    /**
     * 現在のラウンド終了時の統計スナップショットを記録
     */
    recordRoundStats() {
        if (!this.stats) return;
        const snapshot = {
            round: this.round,
            phase: this.phase,
            playerStates: this.players.map(p => ({
                id: p.id,
                name: p.name,
                resources: { ...p.resources },
                vp: this.calculateVP(p),
                builtCount: p.construction.length,
                roundTokens: p.roundTokens || 0
            }))
        };
        this.stats.roundHistory.push(snapshot);
        console.log(`Stat Snapshot Recorded: Round ${this.round}`, snapshot);
    }


    /**
     * セットアップ画面（モーダル）のUIイベント設定
     * ゲームモード選択、プレイヤー数設定、P2P接続処理など
     */
    initSetupUI() {
        // --- プレイヤー人数選択ボタン ---
        const countBtns = document.querySelectorAll('.count-btn');
        countBtns.forEach(btn => {
            btn.onclick = () => {
                countBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.playerCount = parseInt(btn.dataset.count);

                // P2Pホストの場合、接続状況表示を更新
                if (this.networkMode === 'host') {
                    const connCount = networkManager.getConnectionCount();
                    const needed = this.playerCount - 1;
                    const waitingEl = document.getElementById('p2p-waiting');
                    if (waitingEl) {
                        waitingEl.innerHTML = `プレイヤーの参加を待っています... (接続: ${connCount}/${needed})`;
                    }
                    // 必要人数に達しているかチェックしてディスプレイを更新
                    const p2pBtn = document.getElementById('btn-start-p2p');
                    const connectedEl = document.getElementById('p2p-connected');
                    if (connCount >= needed) {
                        waitingEl.style.display = 'none';
                        connectedEl.style.display = 'block';
                        connectedEl.textContent = `✓ ${connCount}人が接続しました！`;
                        p2pBtn.style.display = 'inline-block';
                        this.p2pReady = true;
                    } else {
                        waitingEl.style.display = 'block';
                        connectedEl.style.display = 'none';
                        p2pBtn.style.display = 'none';
                        this.p2pReady = false;
                    }
                }
            };
        });

        // --- ゲームモード選択関連要素 ---
        const modeBtns = document.querySelectorAll('.mode-btn');
        const hostSection = document.getElementById('p2p-host-section');
        const guestSection = document.getElementById('p2p-guest-section');
        const normalBtn = document.getElementById('btn-start-normal');
        const simBtn = document.getElementById('btn-start-simulation');
        const p2pBtn = document.getElementById('btn-start-p2p');
        const countSection = document.querySelector('.player-count-buttons');

        modeBtns.forEach(btn => {
            btn.onclick = async () => {
                // ボタンスタイルの切替
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const mode = btn.dataset.mode;
                this.networkMode = mode;

                // UI表示状態を一旦リセット
                hostSection.style.display = 'none';
                guestSection.style.display = 'none';
                normalBtn.style.display = 'none';
                simBtn.style.display = 'none';
                p2pBtn.style.display = 'none';
                const p2pHintReset = document.getElementById('p2p-player-hint');
                if (p2pHintReset) p2pHintReset.style.display = 'none';
                if (countSection && countSection.parentElement) {
                    countSection.parentElement.style.display = 'block';
                }

                // モードごとのUI表示切替
                if (mode === 'local') {
                    // ローカル対戦 / シミュレーション
                    normalBtn.style.display = 'inline-block';
                    simBtn.style.display = 'inline-block';
                } else if (mode === 'host') {
                    // P2P ホスト
                    // 最低人数補正
                    if (!this.playerCount || this.playerCount < 2) {
                        this.playerCount = 2;
                    }
                    if (countSection && countSection.parentElement) {
                        countSection.parentElement.style.display = 'block';
                    }
                    const p2pHint = document.getElementById('p2p-player-hint');
                    if (p2pHint) p2pHint.style.display = 'block';

                    hostSection.style.display = 'block';

                    // ホストとして初期化
                    try {
                        const roomId = await networkManager.initAsHost();
                        document.getElementById('room-id-display').textContent = roomId;
                        const neededPlayers = this.playerCount - 1; // 2人なら1人待ち
                        document.getElementById('p2p-waiting').innerHTML = `プレイヤーの参加を待っています... (接続: 0/${neededPlayers})`;
                        document.getElementById('p2p-waiting').style.display = 'block';
                        document.getElementById('p2p-connected').style.display = 'none';

                        // 接続発生時のコールバック
                        networkManager.onConnection((peerId, playerId) => {
                            const connCount = networkManager.getConnectionCount();
                            const needed = this.playerCount - 1;
                            document.getElementById('p2p-waiting').innerHTML = `プレイヤーの参加を待っています... (接続: ${connCount}/${needed})`;

                            // ゲストにプレイヤーIDを通知
                            networkManager.send(peerId, {
                                type: 'PLAYER_ID_ASSIGN',
                                playerId: playerId,
                                totalPlayers: this.playerCount
                            });

                            // 全員揃ったら開始ボタン表示
                            if (connCount >= needed) {
                                document.getElementById('p2p-waiting').style.display = 'none';
                                document.getElementById('p2p-connected').style.display = 'block';
                                document.getElementById('p2p-connected').textContent = `✓ ${connCount}人が接続しました！`;
                                p2pBtn.style.display = 'inline-block';
                                this.p2pReady = true;
                            }
                        });

                        // メッセージ受信設定
                        this.setupNetworkCallbacks();
                    } catch (err) {
                        console.error('Failed to init as host:', err);
                        alert('ホストの初期化に失敗しました: ' + err.message);
                    }
                } else if (mode === 'guest') {
                    // P2P ゲスト
                    // ゲスト側は人数選択不要
                    if (countSection && countSection.parentElement) {
                        countSection.parentElement.style.display = 'none';
                    }
                    guestSection.style.display = 'block';
                }
            };
        });

        // --- ゲスト接続ボタン ---
        const connectBtn = document.getElementById('btn-connect-p2p');
        if (connectBtn) connectBtn.onclick = async () => {
            const roomId = document.getElementById('room-id-input').value.trim();
            const statusDiv = document.getElementById('p2p-connection-status');

            if (!roomId) {
                statusDiv.textContent = 'ルームIDを入力してください';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = '接続中...';
            statusDiv.style.color = '#666';

            try {
                await networkManager.initAsGuest(roomId);
                statusDiv.textContent = '✓ 接続成功！ホストがゲームを開始するのを待っています...';
                statusDiv.style.color = 'green';
                this.p2pReady = true;
                this.localPlayerId = 1; // ゲストは一旦ID:1とする（後にホストから正式ID受信）

                // メッセージ受信コールバックを設定
                this.setupNetworkCallbacks();
            } catch (err) {
                console.error('Failed to connect:', err);
                statusDiv.textContent = '接続失敗: ' + err.message;
                statusDiv.style.color = 'red';
            }
        };

        // --- ゲーム開始ボタン (P2P ホスト) ---
        const startP2PBtn = document.getElementById('btn-start-p2p');
        if (startP2PBtn) startP2PBtn.onclick = () => {
            if (this.networkMode === 'host' && this.p2pReady) {
                this.simulationMode = false;
                this.localPlayerId = 0; // ホストはID:0
                this.startSetup();
            }
        };

        // --- ゲーム開始ボタン (通常) ---
        const startNormalBtn = document.getElementById('btn-start-normal');
        if (startNormalBtn) startNormalBtn.onclick = () => {
            this.networkMode = 'local';
            this.simulationMode = false;
            this.startSetup();
        };

        // --- ゲーム開始ボタン (シミュレーション) ---
        const startSimBtn = document.getElementById('btn-start-simulation');
        if (startSimBtn) startSimBtn.onclick = () => {
            this.networkMode = 'local';
            this.simulationMode = true;
            this.startSetup();
        };
    }



    /**
     * P2Pネットワークイベントのリスナー設定
     * メッセージ受信と切断検知を行います
     */
    setupNetworkCallbacks() {
        networkManager.onMessage((data, peerId) => {
            this.handleNetworkMessage(data, peerId);
        });

        networkManager.onDisconnect((peerId) => {
            this.log('相手との接続が切断されました', true);
            alert('相手との接続が切断されました');
        });
    }

    /**
     * 受信メッセージのディスパッチ処理
     * @param {Object} data 受信したJSONデータ
     * @param {string} peerId 送信元のPeerID
     */
    handleNetworkMessage(data, peerId) {
        console.log('[Game] Received network message:', data);

        switch (data.type) {
            // --- 初期化シーケンス ---
            case 'PLAYER_ID_ASSIGN':
                // [ゲスト] ホストから割り当てられた自身のIDを受信
                if (this.networkMode === 'guest') {
                    this.localPlayerId = data.playerId;
                    this.playerCount = data.totalPlayers;
                    networkManager.setLocalPlayerId(data.playerId);
                    console.log('[Game] Assigned Player ID:', data.playerId, 'Total:', data.totalPlayers);
                    this.log(`プレイヤー ${data.playerId + 1} としてゲームに参加します`);

                    // ホストに自分の名前を送信
                    const nameInput = document.getElementById('player-name-guest');
                    const playerName = (nameInput && nameInput.value.trim()) || `Player ${data.playerId + 1}`;
                    networkManager.broadcast({
                        type: 'PLAYER_NAME',
                        playerId: data.playerId,
                        name: playerName
                    });
                }
                break;

            case 'PLAYER_NAME':
                // [ホスト] ゲストから名前を受信
                if (this.networkMode === 'host') {
                    if (!this.pendingPlayerNames) this.pendingPlayerNames = {};
                    this.pendingPlayerNames[data.playerId] = data.name;
                    console.log('[Game] Received player name:', data.playerId, data.name);
                }
                break;

            case 'GAME_START':
                // [ゲスト] ゲーム開始シグナル
                if (this.networkMode === 'guest') {
                    this.applyGameState(data.gameState);
                    this.setupModal.classList.add('hidden');
                    this.gameContainer.style.display = 'flex';
                }
                break;

            // --- ゲームプレイアクション ---
            case 'CARD_SELECTED':
                // [共通] 対戦相手がカードを選択した（計画フェーズのみ）
                if (this.phase !== 'plan') break; // 計画フェーズ以外では無視
                if (data.playerId !== this.localPlayerId) {
                    const player = this.players[data.playerId];
                    if (player && player.hand[data.cardIndex]) {
                        player.selectedCard = player.hand[data.cardIndex];
                        this.log(`${player.name} がカードを選択しました`);
                        this.updateUI();
                        // 全員選択完了ならフェーズ進行
                        if (this.players.every(p => p.selectedCard)) {
                            this.advancePhase();
                        }
                    }
                }
                break;

            case 'ACTION':
                // [共通] 対戦相手のアクション詳細（移動/建設/変換）
                if (data.playerId !== this.localPlayerId) {
                    this.applyRemoteAction(data);
                }
                break;

            case 'REQUEST_TURN_END':
                // [ホスト] ゲストからのターン完了通知
                if (this.networkMode === 'host') {
                    this.performTurnEnd(this.currentPlayerIndex);
                }
                break;

            // --- 状態同期 ---
            case 'TURN_UPDATE':
            case 'TURN_END':
                // [共通] ターン終了後の状態更新
                this.currentPlayerIndex = data.currentPlayerIndex;
                this.turnsPlayedInRound = data.turnsPlayedInRound;
                this.roundTokens = data.roundTokens;

                // 手札情報の更新（補充があった場合）
                if (data.replenishedPlayerId !== undefined && data.newHand) {
                    const p = this.players[data.replenishedPlayerId];
                    if (p) {
                        if (this.isLocalPlayer(p)) {
                            // 自分自身: 手札を完全に更新
                            if (data.replenishedPlayerId === this.localPlayerId) {
                                p.hand = data.newHand;
                                this.log(`手札を補充しました。`, true);
                            } else {
                                // 他プレイヤー: 裏向きカードとして更新
                                p.hand = data.newHand.map((c, i) => ({
                                    hidden: true,
                                    instanceId: `hidden_${data.replenishedPlayerId}_${i}`
                                }));
                            }
                        }
                    }
                }

                // 次のアクションへ遷移
                const pCount = this.players.length || this.playerCount;
                if (this.turnsPlayedInRound >= pCount) {
                    if (this.gameEndTriggered) {
                        this.endGame();
                    } else {
                        this.startReplenishPhase();
                    }
                } else {
                    this.startExecuteTurn();
                }
                break;

            case 'SYNC':
                // 完全同期（現状未使用）
                break;

            case 'ROUND_REPLENISH':
                // [共通] 新ラウンド開始処理
                this.round = data.round;
                this.roundTokens = data.roundTokens;
                this.startPlayerIndex = data.startPlayerIndex;
                this.phase = data.phase;
                this.turnsPlayedInRound = 0;

                this.log("次のラウンドを開始します...");
                this.updateUI();
                this.renderMap();
                if (this.nextPhaseBtn) this.nextPhaseBtn.disabled = false;
                break;

            case 'PHASE_CHANGE':
                // [ゲスト] ホストからのフェーズ変更通知
                this.phase = data.phase;
                this.currentPlayerIndex = data.currentPlayerIndex;
                this.turnsPlayedInRound = data.turnsPlayedInRound || 0;
                this.log(`フェーズ変更: ${data.phase}`);
                this.updateUI();
                // 自分の手番ならUIを更新
                if (this.phase === 'execute') {
                    this.startExecuteTurn();
                }
                break;

            case 'REQUEST_DRAW':
                // [ホスト] ゲストからのドロー要求を処理
                if (this.networkMode === 'host') {
                    //playerIdを含んだメッセージが必要
                    let targetPlayer = null;
                    if (data.playerId !== undefined) {
                        targetPlayer = this.players[data.playerId];
                    }

                    if (targetPlayer) {
                        this.log(`${targetPlayer.name} がカードドローを要求しました。`);
                        this.drawCards(targetPlayer, data.count || 1);
                    }
                }
                break;

            case 'DRAW_RESULT':
                // [ゲスト] ホストからドロー結果（カード実体）を受信
                if (this.networkMode === 'guest' &&
                    data.targetPlayerId === this.localPlayerId) {

                    if (data.cards && data.cards.length > 0) {
                        const myPlayer = this.players[this.localPlayerId];
                        if (myPlayer) {
                            data.cards.forEach(c => myPlayer.hand.push(c));
                            this.log(`カードを ${data.cards.length} 枚引きました。`, true);
                            this.updateUI();
                        }
                    }
                }
                break;

            case 'OPPONENT_DRAW':
                // [共通] 他プレイヤーがドローした事実のみを通知（裏向きカード生成）
                if (data.playerId !== this.localPlayerId) {
                    const player = this.players[data.playerId];
                    if (player) {
                        // ダミーカードを追加して枚数を同期
                        for (let i = 0; i < data.count; i++) {
                            player.hand.push({ hidden: true, instanceId: `hidden_draw_${Date.now()}_${i}` });
                        }
                        this.log(`${player.name} がカードを ${data.count} 枚引きました。`);
                        this.updateUI();
                    }
                }
                break;
        }
    }

    /**
     * [共通] リモートプレイヤーのアクションをローカル環境に適用
     * @param {Object} data アクション詳細データ
     */
    applyRemoteAction(data) {
        const player = this.players[data.playerId];
        if (!player) return;

        if (data.action === 'move') {
            // --- 移動アクション ---
            const card = player.selectedCard;
            if (card) {
                this.discardPile.push(card);
                this.removeCardFromHand(player, card);
                player.selectedCard = null;

                // 経路計算と周回チェック
                const path = this.findPath(player.location, data.data.targetNodeId, card.move || 1);
                if (this.checkPathForLoop(path)) {
                    player.roundTokens = (player.roundTokens || 0) + 1;
                    this.roundTokens--;
                    this.log(`${player.name} が周回トークンを獲得しました`);
                }

                // ノードスタック更新 (同乗者も移動)
                const passengers = this.getPassengers(player);
                this.updateNodeStacks(player, data.data.targetNodeId, passengers);

                player.location = data.data.targetNodeId;
                this.log(`${player.name} がノード ${data.data.targetNodeId} に移動しました`);

                this.renderMap();
                this.updateUI();
                // ターン終了処理は別途 TURN_END メッセージで行う
            }
        } else if (data.action === 'build') {
            // --- 建設アクション ---
            let card = player.selectedCard;

            // カードインスタンスIDによる厳密な特定
            if (data.cardInstanceId) {
                card = player.hand.find(c => c.instanceId === data.cardInstanceId);
            }

            // 見つからない場合（相手の手札が非公開の時など）はマスターデータから復元
            if (!card && data.cardId) {
                const cardData = cardsData.find(c => c.id === data.cardId);
                if (cardData) {
                    card = { ...cardData, instanceId: data.cardInstanceId };

                    // 手札枚数の整合性を保つため、裏向きカード等を1枚削除
                    const hiddenIdx = player.hand.findIndex(c => c.hidden);
                    if (hiddenIdx > -1) {
                        player.hand.splice(hiddenIdx, 1);
                    } else {
                        player.hand.pop();
                    }
                    this.updateUI();
                }
            }

            if (card) {
                // リソース消費の同期
                if (data.resources) {
                    player.resources = { ...data.resources };
                } else if (data.data && data.data.costPaid) {
                    // 後方互換用
                    Object.entries(data.data.costPaid).forEach(([res, amount]) => {
                        player.resources[res] = (player.resources[res] || 0) - amount;
                    });
                }

                // 建設処理の実行
                this.finalizeBuild(player, card, data.chainRemaining);
                this.updateUI();
            }
        } else if (data.action === 'convert') {
            // --- 変換アクション ---
            if (data.resources) {
                player.resources = { ...data.resources };
            }
            const card = data.cardInstanceId ? player.construction.find(c => c.instanceId === data.cardInstanceId) : null;
            if (card) card.usedThisTurn = true;
            this.log(`${player.name} が変換アクションを実行しました`);
            this.updateUI();
        }
    }

    /**
     * [ゲスト] ホストから受信したゲーム状態を適用し初期化
     * @param {Object} state ゲーム状態オブジェクト
     */
    applyGameState(state) {
        this.initialized = true;
        this.playerCount = state.playerCount;

        // ノードスタックの初期化
        this.nodeStacks = {};
        if (typeof mapNodes !== 'undefined') {
            mapNodes.forEach(node => {
                this.nodeStacks[node.id] = [];
            });
        }

        // プレイヤー情報の復元（相手の手札は非公開化）
        const colors = ['white', 'blue', 'black', 'red', 'yellow'];
        this.players = state.players.map((pState, idx) => {
            const isLocal = idx === this.localPlayerId;
            return {
                ...pState,
                name: isLocal ? pState.name : pState.name, // ホストから送られた名前を使用
                color: colors[idx % colors.length],
                hand: isLocal ? pState.hand : pState.hand.map((c, i) => ({
                    hidden: true,
                    instanceId: `hidden_${idx}_${i}`
                })),
                isAI: false,
                isLocal: isLocal,
                selectedCard: null // 後で同期
            };
        });

        this.deck = state.deck || [];
        this.discardPile = state.discardPile || [];
        this.roundTokens = state.roundTokens;
        this.round = state.round || 1;
        this.phase = state.phase;
        this.startPlayerIndex = state.startPlayerIndex || 0;
        this.currentPlayerIndex = state.currentPlayerIndex || 0;

        this.log("ゲームに参加しました");
        this.log(`あなたはプレイヤー ${this.localPlayerId + 1} です`);

        this.updateUI();
        this.renderMap();
    }

    /**
     * [ホスト] 現在のゲーム状態をシリアライズ（ネットワーク送信用）
     */
    getGameStateForNetwork() {
        return {
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                location: p.location,
                hand: p.hand,
                construction: p.construction,
                resources: p.resources,
                selectedCard: p.selectedCard ? { instanceId: p.selectedCard.instanceId } : null,
                roundTokens: p.roundTokens
            })),
            roundTokens: this.roundTokens,
            round: this.round,
            phase: this.phase,
            startPlayerIndex: this.startPlayerIndex,
            currentPlayerIndex: this.currentPlayerIndex,
            playerCount: this.playerCount
        };
    }

    /**
     * 現在のゲームモードがP2P（ホストまたはゲスト）か判定
     * @returns {boolean} P2Pモードならtrue
     */
    isP2PMode() {
        return this.networkMode === 'host' || this.networkMode === 'guest';
    }

    /**
     * 指定プレイヤーがローカル操作対象か判定
     * @param {Object} player プレイヤーオブジェクト
     * @returns {boolean} ローカルプレイヤーならtrue
     */
    isLocalPlayer(player) {
        if (!this.isP2PMode()) {
            return !player.isAI;
        }
        return player.id === this.localPlayerId;
    }

    /**
     * ゲームセットアップを開始
     * P2P/ローカルの設定完了後に呼び出される
     */
    startSetup() {
        this.setupModal.classList.add('hidden');
        this.gameContainer.style.display = 'flex';
        this.initializeGame();
    }

    /**
     * ゲームログへのメッセージ出力
     * @param {string} msg メッセージ内容
     * @param {boolean} highlight 強調表示フラグ
     */
    log(msg, highlight = false) {
        const div = document.createElement('div');
        div.className = 'log-entry';

        const phaseSpan = document.createElement('span');
        phaseSpan.className = 'log-phase';
        phaseSpan.textContent = this.phase.toUpperCase();

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-msg' + (highlight ? ' log-highlight' : '');
        msgSpan.innerHTML = msg; // HTMLタグ許容

        div.appendChild(phaseSpan);
        div.appendChild(msgSpan);

        if (this.logPanel) {
            this.logPanel.prepend(div);
            // ログ件数制限（最新50件）
            if (this.logPanel.childNodes.length > 50) {
                this.logPanel.removeChild(this.logPanel.lastChild);
            }
        }
        console.log(`[${this.phase}] ${msg}`);
    }

    /**
     * ゲームの初期化プロセス
     * マップ画像のロード完了を待機してロジックを開始します
     */
    initializeGame() {
        if (this.initialized) return;

        const imgObj = document.getElementById('game-map-image');
        if (imgObj) {
            if (imgObj.complete) {
                this.log("マップ画像を読み込みました。");
                this._initGameLogic();
            } else {
                imgObj.onload = () => {
                    this.log("マップ画像を読み込みました。");
                    this._initGameLogic();
                };
                imgObj.onerror = () => {
                    this.log("マップ画像の読み込みエラー。");
                    // エラー発生時も進行を試みる
                    this._initGameLogic();
                };
            }
        } else {
            this._initGameLogic();
        }

        // デバッグ: 座標確認用イベント
        this.mapContainer.addEventListener('click', (e) => {
            const rect = this.mapContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const xPct = (x / rect.width) * 100;
            const yPct = (y / rect.height) * 100;
            console.log(`Map Click: x: ${xPct.toFixed(1)}, y: ${yPct.toFixed(1)}`);
            this.log(`DEBUG: Clicked at x: ${xPct.toFixed(1)}, y: ${yPct.toFixed(1)}`);
        });
    }

    /**
     * ゲームロジックのコア初期化
     * プレイヤー、デッキ、リソース、盤面の初期設定を行います
     */
    _initGameLogic() {
        if (this.initialized) return;
        this.initialized = true;

        this.log("ゲームロジックを初期化中...");
        this.recordRoundStats(); // 初期状態の記録

        // --- 1. 資源・トークン初期化 ---
        // this.playerCount は UIセットアップで設定済み
        this.roundTokens = this.playerCount * 5; // Rusher対策でトークン増量 (x3 -> x5)
        this.log(`ラウンドトークン数: ${this.roundTokens}`);

        // --- 2. プレイヤー生成と初期化 ---
        this.players = [];
        const colors = ['white', 'blue', 'black', 'red', 'yellow']; // トークン色

        if (this.isP2PMode()) {
            // [P2Pモード] ホスト・ゲスト対戦用設定
            // プレイヤー名を入力フィールドから取得
            const nameInput = this.networkMode === 'host'
                ? document.getElementById('player-name-host')
                : document.getElementById('player-name-guest');
            const localPlayerName = (nameInput && nameInput.value.trim()) || `Player ${this.localPlayerId + 1}`;

            for (let i = 0; i < this.playerCount; i++) {
                const isLocal = i === this.localPlayerId;
                // ホストの場合、リモートプレイヤーの名前は pendingPlayerNames から取得
                let playerName;
                if (isLocal) {
                    playerName = localPlayerName;
                } else if (this.networkMode === 'host' && this.pendingPlayerNames && this.pendingPlayerNames[i]) {
                    playerName = this.pendingPlayerNames[i];
                } else {
                    playerName = `Player ${i + 1}`;
                }

                this.players.push({
                    id: i,
                    name: playerName,
                    color: colors[i % colors.length],
                    location: 1, // スタート地点: Node 01
                    hand: [],
                    construction: [],
                    resources: { F: 0, M: 0, K: 0, W: 2 },
                    selectedCard: null,
                    vp: 0,
                    isAI: false,
                    isLocal: isLocal,
                    aiStrategy: null,
                    lastAction: null
                });
            }
            this.log(`あなたはプレイヤー ${this.localPlayerId + 1} (${localPlayerName}) です`);
        } else {
            // [ローカルモード] AI対戦またはシミュレーション
            const humanIndex = this.simulationMode ? -1 : Math.floor(Math.random() * this.playerCount);

            for (let i = 0; i < this.playerCount; i++) {
                this.players.push({
                    id: i,
                    name: `Player ${i + 1} ${i === humanIndex ? '(You)' : '(AI)'}`,
                    color: colors[i % colors.length],
                    location: 1, // スタート地点: Node 01
                    hand: [],
                    construction: [],
                    resources: { F: 0, M: 0, K: 0, W: 2 },
                    selectedCard: null, // 計画フェーズでの選択カード
                    vp: 0,
                    isAI: (i !== humanIndex), // humanIndex 以外はAI
                    aiStrategy: (i !== humanIndex) ? this.getRandomAIStrategy() : null, // AI戦略の割当
                    lastAction: null
                });
            }
            if (humanIndex >= 0) {
                this.log(`あなたはプレイヤー ${humanIndex + 1} (${colors[humanIndex]}) です`);
            }
        }

        // --- 3. デッキ構築 ---
        this.createDeck();
        this.shuffleDeck();

        // --- 4. 初期手札配布 (3枚) ---
        this.players.forEach(p => {
            this.drawCards(p, 3);
        });

        // --- 5. ノードスタック (同乗者管理) 初期化 ---
        this.nodeStacks = {};
        mapNodes.forEach(node => {
            this.nodeStacks[node.id] = [];
        });

        // --- 6. ゲーム開始 ---
        this.phase = "plan";
        this.updateUI();
        this.log("ゲーム開始！フェイズ: 計画");

        // [P2Pホスト] 初期状態をゲストへ送信
        if (this.networkMode === 'host') {
            networkManager.broadcast({
                type: 'GAME_START',
                gameState: this.getGameStateForNetwork()
            });
        }

        // [ローカルAI] 計画フェーズのAI思考実行
        if (!this.isP2PMode()) {
            this.checkAIPlan();
        }
    }

    /**
     * AIの計画フェーズ思考ルーチン
     * 未選択のAIプレイヤーに対してカード選択を実行させます
     */
    checkAIPlan() {
        if (this.phase !== 'plan') return;

        // AIは即座にカード選択
        this.players.forEach(p => {
            if (p.isAI && !p.selectedCard) {
                try {
                    // スマート選択ロジックの呼び出し
                    this._performAISelect(p);
                } catch (e) {
                    console.error("AI Plan Error:", e);
                    this.log(`AI Error (${p.name}): ${e.message}`, true);

                    // フォールバック: エラー時はランダムに選択して進行を止めない
                    if (p.hand.length > 0) {
                        const randomCard = p.hand[Math.floor(Math.random() * p.hand.length)];
                        p.selectedCard = randomCard;
                        this.log(`${p.name} selected randomly due to error.`);
                    }
                }
            }
        });

        this.updateUI();

        // シミュレーションモード / 全員AIの場合: 全員が選択済みなら自動的にexecuteフェーズへ
        const allSelected = this.players.every(p => p.selectedCard);
        if (allSelected && !this.isP2PMode()) {
            const delay = this.simulationMode ? this.simSpeed : 100;
            setTimeout(() => {
                this.phase = 'execute';
                this.currentPlayerIndex = this.startPlayerIndex;
                this.turnsPlayedInRound = 0;
                this.log('実行フェーズ開始');
                this.updateUI();
                this.startExecuteTurn();
            }, delay);
        }
    }

    /**
     * AIプレイヤーのカード選択実行
     * 手札の各カードを評価し、最良のカードを選択します
     * @param {Object} p AIプレイヤーオブジェクト
     */
    _performAISelect(p) {
        let bestCard = null;
        let maxScore = -Infinity;

        // 手札全カードを評価
        p.hand.forEach(card => {
            const score = this.calculateCardScore(p, card);
            // 決定論的になりすぎないようノイズを加える
            const noise = Math.random() * 10 - 5;
            const finalScore = score + noise;

            if (finalScore > maxScore) {
                maxScore = finalScore;
                bestCard = card;
            }
        });

        p.selectedCard = bestCard;
        if (!bestCard) {
            this.log(`Warning: ${p.name} could not select a card (Empty hand?)`, true);
        } else {
            this.log(`${p.name} (AI-${p.aiStrategy}) selected a card. (Score: ${Math.floor(maxScore)})`);
        }
    }

    /**
    /**
     * AI用: カード評価スコア計算 - 性格差を過激に反映
     * @param {Object} player 評価するAIプレイヤー
     * @param {Object} card 評価対象カード
     * @returns {number} 評価スコア（高いほど優先度高）
     */
    calculateCardScore(player, card) {
        let score = 0;
        const totalRes = (player.resources.F || 0) + (player.resources.M || 0) + (player.resources.K || 0) + (player.resources.W || 0);
        const { canBuild } = this.canBuild(player, card);

        const isBuilder = player.aiStrategy === 'Builder';
        const isLooper = player.aiStrategy === 'Looper';
        const isBalanced = player.aiStrategy === 'Balanced';

        // --- A. 建設スコア ---
        let buildScore = -Infinity;

        if (canBuild) {
            buildScore = 0;

            // 基礎点: Builderは建設自体が快感
            if (isBuilder) buildScore += 50000;
            else if (isLooper) buildScore -= 1000; // Looperは基本建てたくない
            else buildScore += 500; // Balanced

            // VP価値
            let vpVal = card.vp || 0;
            if (card.vp_logic === 'variable') vpVal = 2.5;

            if (isBuilder) buildScore += vpVal * 200; // 建設狂
            else buildScore += vpVal * 50;

            // 産出・効果・ドロー: Builderのみ重視
            if (isBuilder) {
                if (card.production) buildScore += 1000;
                if (card.effect) buildScore += 500;
                if (card.draw_extra) buildScore += 800;
                if (card.chain_build) buildScore += 1500;
            }

            // W消費ペナルティ (Looperは死んでもWを使いたくない)
            let wCost = player.resources.W < card.cost.W ? 0 : card.cost.W || 0;
            let neededW = 0;
            if (card.cost) {
                if (card.cost.W) neededW += card.cost.W;
                ['F', 'M', 'K'].forEach(r => {
                    let diff = (card.cost[r] || 0) - (player.resources[r] || 0);
                    if (diff > 0) neededW += diff;
                });
            }

            if (isLooper && neededW > 0) {
                // Wを使って建てるなら絶対に建てないレベルのペナルティ
                buildScore -= 100000;
            }
            // BuilderはWを使ってでも建てるのでペナルティなし
        }

        // --- B. 移動スコア ---
        let moveScore = 0;
        const steps = card.move;

        if (steps > 0) {
            const reachable = this.getReachableNodes(player.location, steps);
            let maxNodeScore = -Infinity;

            // 欲しい資源
            const wantedRes = new Set();
            player.hand.forEach(h => {
                if (h.cost) {
                    ['F', 'M', 'K'].forEach(r => {
                        if ((player.resources[r] || 0) < (h.cost[r] || 0)) wantedRes.add(r);
                    });
                }
            });

            reachable.forEach(targetId => {
                let nodeScore = 0;
                const node = mapNodes.find(n => n.id === targetId);
                const path = this.findPath(player.location, targetId, steps);

                // 1. 周回 (Looperの生きがい)
                if (this.checkPathForLoop(path)) {
                    if (this.roundTokens > 0) {
                        if (isLooper) nodeScore += 50000; // 最優先
                        if (isBuilder) nodeScore -= 1000; // 資源のない移動は無駄
                        if (isBalanced) nodeScore += 2000;

                        if (this.roundTokens <= 3) nodeScore += 500;
                    }
                }

                // 2. 資源獲得 (Builderの生きがい)
                const nodeRes = node.resource;
                let isUseful = false;
                if (nodeRes === 'FMK' || nodeRes === 'W') isUseful = true;
                else if (nodeRes && wantedRes.has(nodeRes)) isUseful = true;

                if (isUseful) {
                    if (isBuilder) nodeScore += 5000; // 資源全力
                    else if (isLooper) nodeScore += 100; // ついで
                    else nodeScore += 500;
                } else if (nodeRes) {
                    // 不要資源
                    if (isBuilder) nodeScore += 500; // とりあえず貰っとく
                }

                // 3. 特殊マス (Looper好き)
                if (targetId === 12 || targetId === 14) { // Warp
                    if (isLooper) nodeScore += 20000;
                    if (isBuilder) nodeScore -= 500; // 飛ばされるの嫌い
                }
                if (targetId === 5 && player.hand.length >= 2) { // Extra Move
                    if (isLooper) nodeScore += 10000;
                }

                if (nodeScore > maxNodeScore) maxNodeScore = nodeScore;
            });

            moveScore = maxNodeScore;

            // カード犠牲コスト
            if (isBuilder) {
                // 建てるべきカードを移動に使うのは重罪
                if (canBuild) moveScore -= 50000;
                if (card.vp > 0) moveScore -= card.vp * 1000;
            }
            // Looperは移動のためなら何でも捨てる

        } else {
            moveScore = -Infinity;
        }

        // 最終決定
        return Math.max(buildScore, moveScore);
    }

    /**
     * デッキ生成
     * マスターデータ(cardsData)からカードオブジェクトを生成します
     */
    createDeck() {
        this.deck = [];
        cardsData.forEach(card => {
            for (let i = 0; i < card.count; i++) {
                // 各カードにユニークなインスタンスIDを付与
                this.deck.push({ ...card, instanceId: Math.random().toString(36).substr(2, 9) });
            }
        });
        this.log(`デッキ作成: ${this.deck.length} 枚`);
    }

    /**
     * AI戦略のランダム選択
     * @returns {string} 戦略名 ('Balanced', 'Hoarder', 'Rusher')
     */
    getRandomAIStrategy() {
        // Rusher/Hoarder 削除 -> Builder/Looper 追加
        const strategies = ['Balanced', 'Builder', 'Looper'];
        return strategies[Math.floor(Math.random() * strategies.length)];
    }

    /**
     * 指定歩数で到達可能な全ノードIDを取得
     * @param {number} startId 開始ノードID
     * @param {number} steps 移動歩数
     * @returns {Array<number>} 到達可能なノードIDの配列
     */
    getReachableNodes(startId, steps) {
        return GameCore.getReachableNodes(mapNodes, startId, steps);
    }

    /**
     * 最短経路探索
     * @param {number} from 開始ノードID
     * @param {number} to 目標ノードID
     * @param {number} steps 正確な歩数
     * @returns {Array<number>} 経路（ノードID配列）
     */
    findPath(from, to, steps) {
        return GameCore.findPath(mapNodes, from, to, steps);
    }

    /**
     * 経路が周回（10 -> 01）を含むか判定
     * @param {Array<number>} path 経路
     * @returns {boolean} 周回を含むならtrue
     */
    checkPathForLoop(path) {
        return GameCore.checkPathForLoop(path);
    }

    /**
     * デッキをシャッフル (Fisher-Yates)
     */
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    /**
     * カードをドロー
     * P2Pモードの場合はリクエスト処理も含む
     * @param {Object} player ドローするプレイヤー
     * @param {number} count 枚数
     */
    drawCards(player, count) {
        // [P2Pゲスト] ホストへドローリクエスト送信
        if (this.isP2PMode() && this.networkMode === 'guest' && this.isLocalPlayer(player)) {
            // 自分(ゲスト)が引く場合
            networkManager.sendToHost({
                type: 'REQUEST_DRAW',
                count: count,
                playerId: player.id // 識別用
            });
            return;
        }

        // [ホスト/ローカル] 通常ドロー処理
        // ※ ゲストが「他人のドロー」を実行することはない（OPPONENT_DRAW受信で処理されるため）

        const drawnCards = [];

        for (let i = 0; i < count; i++) {
            if (this.deck.length === 0) {
                if (this.discardPile.length > 0) {
                    this.deck = [...this.discardPile];
                    this.discardPile = [];
                    this.shuffleDeck();
                    this.log("捨て札をデッキに戻してシャッフルしました。");
                } else {
                    this.log("デッキ切れ、引けません。");
                    break;
                }
            }
            const card = this.deck.pop();
            player.hand.push(card);
            drawnCards.push(card);
        }

        // [P2Pホスト] 同期メッセージ送信
        if (this.isP2PMode() && this.networkMode === 'host') {
            // 1. 引いた本人にカード実体を送る（ゲストの場合のみ）
            if (!this.isLocalPlayer(player)) {
                // note: 本来は個別送信すべきだが、簡易実装としてbroadcastし受信側でフィルタリング
                networkManager.broadcast({
                    type: 'DRAW_RESULT',
                    targetPlayerId: player.id,
                    cards: drawnCards
                });
            } else {
                // ホスト自身が引いた場合、DRAW_RESULTは不要
            }

            // 2. 全員に「誰かが引いた」事実を通知（枚数同期用）
            networkManager.broadcast({
                type: 'OPPONENT_DRAW',
                playerId: player.id,
                count: drawnCards.length
            });
        }
    }

    advancePhase() {
        if (this.phase === 'plan') {
            // まずAIにカードを選択させる
            this.checkAIPlan();

            // その後で全員選択完了かチェック
            const allSelected = this.players.every(p => p.selectedCard !== null);
            if (!allSelected) {
                // 人間がまだ選択していない場合（AIは既に選択済み）
                this.log("カードを選択してください", true);
                return;
            }
            this.phase = 'execute';
            this.currentPlayerIndex = this.startPlayerIndex;
            this.turnsPlayedInRound = 0; // ターンカウントリセット

            // 遷移中の複数クリック防止のため即座にボタン無効化
            if (this.nextPhaseBtn) this.nextPhaseBtn.disabled = true;
            const quickBtn = document.getElementById('quick-confirm-btn');
            if (quickBtn) quickBtn.disabled = true;

            // [P2P] フェーズ変更をゲストに通知
            if (this.isP2PMode() && this.networkMode === 'host') {
                networkManager.broadcast({
                    type: 'PHASE_CHANGE',
                    phase: this.phase,
                    currentPlayerIndex: this.currentPlayerIndex,
                    turnsPlayedInRound: this.turnsPlayedInRound
                });
            }

            this.startExecuteTurn();
        } else if (this.phase === 'execute') {
            // ステップ別に処理
        }
    }

    // --- フェーズのロジック ---

    /**
     * 計画フェーズでのカード選択処理
     * クリックされたカードを選択/解除し、P2Pモードなら通知します
     * @param {Object} player 対象プレイヤー
     * @param {number} cardIndex カードのインデックス
     */
    selectCardForPlan(player, cardIndex) {
        // [P2P] ローカルプレイヤー以外の操作は無効
        if (this.isP2PMode() && !this.isLocalPlayer(player)) return;

        // [ローカル] AIのカードは操作不可
        if (!this.isP2PMode() && player.isAI) return;

        // 実行フェーズ中はカード変更不可
        if (this.phase === 'execute') {
            if (player.selectedCard) {
                this.log("実行フェーズ中はカードを変更できません", true);
                return;
            }
        }

        const card = player.hand[cardIndex];

        // 既に選択済みのカードを再クリックした場合
        if (this.phase === 'plan' && player.selectedCard === card) {
            // ローカルモードならそのままフェーズ進行（決定操作として扱う）
            if (!this.isP2PMode()) {
                this.advancePhase();
            }
            return;
        }

        // 選択状態のトグル（他カード選択時は切り替え）
        if (player.selectedCard === card) {
            player.selectedCard = null;
            this.log(`[plan] ${player.name} はカード選択を解除しました。`);
        } else {
            player.selectedCard = card;
            this.log(`[plan] ${player.name} は ${card.name_jp || card.name} を選択しました。`);

            // [P2P] 選択アクションをブロードキャスト
            if (this.isP2PMode()) {
                networkManager.broadcast({
                    type: 'CARD_SELECTED',
                    playerId: player.id,
                    cardIndex: cardIndex
                });
            }
        }

        this.updateUI();

        // 計画フェーズ完了チェック
        if (this.phase === 'plan' && player.selectedCard) {
            if (this.isP2PMode()) {
                // [P2P] 全員が選択完了するまで待機
                if (this.players.every(p => p.selectedCard)) {
                    this.advancePhase();
                }
            } else {
                // [ローカル] 人間が選択したら即座に次へ（AIはcheckAIPlanで選択済）
                this.advancePhase();
            }
        }
    }

    /**
     * 実行フェーズ: 新しい手番の開始
     * 現在のプレイヤーのアクション可能な状態をセットアップします
     */
    startExecuteTurn() {
        const p = this.players[this.currentPlayerIndex];
        this.log(`${p.name} の番`);

        // ターンごとの使用フラグをリセット
        p.construction.forEach(c => c.usedThisTurn = false);
        this.mainActionTaken = false; // 新しいターンなのでリセット
        this.highlightCallback = null; // ハイライト状態もリセット

        this.updateUI();

        if (this.isP2PMode()) {
            // [P2Pモード]
            if (this.isLocalPlayer(p)) {
                // 自分の手番: UIを操作可能に
                this.dynamicActions.innerHTML = '';
                const panel = document.getElementById('action-panel');
                if (panel) panel.style.display = 'none';
            } else {
                // 相手の手番: 待機状態を表示
                this.log('相手のアクションを待っています...');
            }
        } else if (p.isAI) {
            // [ローカル] AIターン
            const delay = this.simulationMode ? this.simSpeed : 50;
            setTimeout(() => this.executeAITurn(p), delay);
        } else {
            // [ローカル] 人間のターン
            this.dynamicActions.innerHTML = '';
            const panel = document.getElementById('action-panel');
            if (panel) panel.style.display = 'none';
        }
    }

    /**
     * AIのターン実行メインロジック
     * 選択済みカードに基づいて建設または移動を行います
     * @param {Object} player AIプレイヤー
     */
    executeAITurn(player) {
        const card = player.selectedCard;
        if (!card) { this.endTurn(); return; }

        this.log(`${player.name} が ${card.name_jp} を公開`);
        this.dynamicActions.innerHTML = '';
        const panel = document.getElementById('action-panel');
        if (panel) panel.style.display = 'none';

        if (this.nextPhaseBtn) this.nextPhaseBtn.disabled = true;

        // フリーアクション: 建設や移動の前に変換スキルを試行
        this.executeAIConversions(player);

        const { canBuild } = this.canBuild(player, card);
        const wCount = player.resources.W || 0;
        const buildingCount = player.construction.length;
        const totalRes = (player.resources.F || 0) + (player.resources.M || 0) + (player.resources.K || 0) + (player.resources.W || 0);
        const isLate = this.round >= 8;

        // --- Build Score ---
        let buildScore = 0;
        if (canBuild) {
            let vpVal = card.vp || 0;
            if (card.vp_logic === 'variable') {
                const counts = {
                    culture: player.construction.filter(c => c.type === 'culture').length,
                    industry: player.construction.filter(c => c.type === 'industry').length,
                    politics: player.construction.filter(c => c.type === 'politics').length
                };
                if (card.id === 15) vpVal = (counts.culture + 1) * 2;
                else if (card.id === 16) vpVal = (counts.industry + 1) * 2;
                else if (card.id === 17) vpVal = (counts.politics + 1) * 2;
                else if (card.id === 18) vpVal = wCount * 2;
                else if (card.id === 19) vpVal = Math.min(counts.culture, counts.industry, counts.politics) * 3 + 3;
                else vpVal = 3;
            }
            let vpWeight = isLate ? 150 : 100;
            if (player.aiStrategy === 'Builder') vpWeight += 50;
            buildScore += vpVal * vpWeight;

            if (card.production && !isLate) {
                const remaining = 12 - this.round;
                let prodVal = 0;
                for (let k in card.production) if (typeof card.production[k] === 'number') prodVal += card.production[k];
                buildScore += prodVal * remaining * 40;
            }
            buildScore += 300;
            if (player.aiStrategy === 'Builder') buildScore += 1000;
            if (totalRes >= 8) buildScore += 500;
            if (wCount > buildingCount) buildScore += 200;
        }

        // --- Move Score ---
        let moveScore = 0;
        const steps = card.move;
        if (steps > 0) {
            const reachable = this.getReachableNodes(player.location, steps);
            reachable.forEach(tid => {
                let nodeScore = 0;
                const path = this.findPath(player.location, tid, steps);
                const node = mapNodes.find(n => n.id === tid);

                if (this.checkPathForLoop(path)) {
                    let wVal = (this.roundTokens > 0) ? 300 : 50;
                    if (player.aiStrategy === 'Looper') wVal += 2000;
                    if (isLate) wVal += 200;
                    nodeScore += wVal;
                }
                if (node && node.resource) {
                    let resVal = 100;
                    if (node.resource === 'FMK') {
                        if (totalRes < 4) resVal = 250;
                        else if (totalRes >= 7) resVal = 20;
                    } else if (node.resource === 'W') {
                        resVal = 200;
                    }
                    nodeScore += resVal;
                }
                if (tid === 12 || tid === 14) nodeScore += 150;

                if (nodeScore > moveScore) moveScore = nodeScore;
            });
        }

        let action = (buildScore > moveScore && canBuild) ? 'build' : 'move';

        // 戦略実行
        if (action === 'build') {
            // 1. 建設実行
            this.executeBuild(player, card);
        } else {
            // 2. 移動アクション
            this.discardPile.push(card);
            this.removeCardFromHand(player, card);
            player.selectedCard = null;

            const steps = card.move;
            if (steps === 0) {
                // 移動力0の場合は即座に終了処理へ
                this.finishMove(player, player.location, card);
                return;
            }

            // 到達可能地点の探索と評価
            const reachable = this.getReachableNodes(player.location, steps);
            if (reachable.length === 0) {
                this.finishMove(player, player.location, card);
            } else {
                // 各ターゲット候補の評価スコアを計算
                const scoredTargets = reachable.map(targetId => {
                    let score = 0;
                    const nodeData = mapNodes.find(n => n.id === targetId);
                    const path = this.findPath(player.location, targetId, steps);

                    // 評価A: 周回ボーナス (W Token)
                    if (this.checkPathForLoop(path)) {
                        if (this.roundTokens > 0) {
                            score += 250;
                            if (player.aiStrategy === 'Rusher') score += 150;
                            if (this.roundTokens <= 3) score += 100;
                        } else {
                            score += 20;
                        }
                    }

                    // 評価B: 資源獲得ボーナス（将来の建設に必要か）
                    const needed = new Set();
                    player.hand.forEach(hCard => {
                        if (hCard.cost) {
                            Object.keys(hCard.cost).forEach(res => {
                                if (player.resources[res] < hCard.cost[res]) needed.add(res);
                            });
                        }
                    });

                    let needBonus = 120; // 資源価値アップ
                    if (player.aiStrategy === 'Hoarder') needBonus = 180;

                    if (nodeData.resource === 'FMK' || nodeData.resource === 'W' || needed.has(nodeData.resource)) {
                        score += needBonus;
                    } else if (nodeData.resource) {
                        score += 30; // 不要資源
                    }

                    // 評価C: 前進距離ボーナス
                    const currIdx = parseInt(player.location);
                    const targetIdx = parseInt(targetId);
                    const progress = (targetIdx - currIdx + 10) % 10 || 10;
                    score += progress;

                    // 評価D: 特殊マス
                    if (targetId === 12 || targetId === 14) score += 50; // ワープ
                    if (targetId === 11 && player.hand.length >= 2) score += 60; // スプケベス

                    return { id: targetId, score };
                });

                // スコア順にソートして最良地点を選択
                scoredTargets.sort((a, b) => b.score - a.score);
                const bestTarget = scoredTargets[0].id;

                // 同乗者処理（一緒に移動）
                const passengers = this.getPassengers(player);
                if (passengers.length > 0) {
                    this.log(`${player.name} carries: ${passengers.map(p => p.name).join(', ')}`);
                    passengers.forEach(p => {
                        const nodeData = mapNodes.find(n => n.id === bestTarget);
                        this.gainResource(p, nodeData.resource);
                    });
                }

                // 実際の移動処理
                const finalPath = this.findPath(player.location, bestTarget, steps);
                if (this.checkPathForLoop(finalPath)) {
                    if (this.roundTokens > 0) {
                        this.log(`${player.name} passed 10->01! W Token Get!`);
                        this.gainResource(player, 'W', 1);
                        this.checkResourceCap(player);
                    } else {
                        this.log(`${player.name} passed 10->01! (Supply Empty)`);
                    }
                    this.checkGameEnd();
                }

                this.updateNodeStacks(player, bestTarget, passengers);
                this.finishMove(player, bestTarget, card, passengers);
                // checkGameEndはfinishMove内で呼ばれるため削除してもよいが念のため
                this.checkGameEnd();
            }
        }
    }

    /**
     * AI: 変換アクションの実行試行
     * 建設に必要な資源を得るために、可能な変換アクションを実行します
     * @param {Object} player AIプレイヤー
     */
    executeAIConversions(player) {
        // AIは選択したカードの建設に役立つ場合のみ変換アクションを使用
        const targetCard = player.selectedCard;
        // 既に建設可能（または建設しない）なら、破壊的な変換（3:1, 2:1）で資源を無駄にしない
        if (!targetCard || this.canBuild(player, targetCard).canBuild) return;

        const conversionCards = player.construction.filter(c => c && c.effect && c.effect.startsWith('convert_'));

        // 単純な貪欲探索: 変換を試す。canBuildになったら確定
        // 複数の変換が必要な場合に備えて繰り返す

        let madeProgress = true;
        // 無限ループ防止のため反復制限
        let iterations = 0;
        while (madeProgress && iterations < 10) {
            madeProgress = false;
            iterations++;

            for (const card of conversionCards) {
                const effect = card.effect;
                if (!this.canConvert(player, effect)) continue;

                // 変換をシミュレート
                const tempRes = { ...player.resources };
                let appliedSimulation = false;

                // 既知の破壊的タイプのみ検証用に処理
                // 非破壊的（獲得のみ）は無条件で良いが、現在の'convert_'は全てトレード
                if (effect === 'convert_same3_to_W') {
                    for (const r of ['F', 'M', 'K']) {
                        if ((tempRes[r] || 0) >= 3) {
                            tempRes[r] -= 3;
                            tempRes.W = (tempRes.W || 0) + 1;
                            appliedSimulation = true;
                            break; // 最初に見つかったセットを消費
                        }
                    }
                } else if (effect === 'convert_K2_to_W') {
                    if ((tempRes.K || 0) >= 2) {
                        tempRes.K -= 2;
                        tempRes.W = (tempRes.W || 0) + 1;
                        appliedSimulation = true;
                    }
                } else if (effect === 'convert_KMF_to_W') {
                    if ((tempRes.K || 0) >= 1 && (tempRes.M || 0) >= 1 && (tempRes.F || 0) >= 1) {
                        tempRes.K--; tempRes.M--; tempRes.F--;
                        tempRes.W = (tempRes.W || 0) + 1;
                        appliedSimulation = true;
                    } else if (((tempRes.K || 0) + (tempRes.M || 0) + (tempRes.F || 0)) >= 3) {
                        // 混合セットのシミュレーションを簡略化
                        // AIシミュレーションでは厳密な要件が安全
                        // 複雑なシミュレーションはスキップ
                        appliedSimulation = false;
                    }
                } else if (effect === 'convert_W2_K1_to_W3') {
                    if ((tempRes.W || 0) >= 2 && (tempRes.K || 0) >= 1) {
                        tempRes.W -= 2; tempRes.K -= 1;
                        tempRes.W = (tempRes.W || 0) + 3;
                        appliedSimulation = true;
                    }
                }

                if (appliedSimulation) {
                    const fakePlayer = { ...player, resources: tempRes };
                    if (this.canBuild(fakePlayer, targetCard).canBuild) {
                        // 成功！実際のアクションを実行
                        this.log(`${player.name}: スマート変換実行 (${this.getConversionLabel(effect)}) - 建設のため`);
                        this.applyConversionEffect(player, effect);
                        madeProgress = true;
                        break; // ループを再評価
                    }
                }
            }
        }
    }

    /**
     * AI: チェーン建設の実行
     * 連続建設可能なカードがある場合、続けて建設を試みます
     * @param {Object} player AIプレイヤー
     * @param {number} chainRemaining 残りチェーン回数
     */
    executeAITurnChain(player, chainRemaining) {
        if (chainRemaining <= 0 || player.hand.length === 0) {
            this.checkPostAction(player);
            return;
        }

        const buildables = player.hand.filter(c => this.canBuild(player, c).canBuild);
        if (buildables.length > 0) {
            const card = buildables[Math.floor(Math.random() * buildables.length)];
            this.log(`${player.name} continues chain: Building ${card.name_jp}`);
            this.executeBuild(player, card, chainRemaining - 1);
        } else {
            this.checkPostAction(player);
        }
    }

    /**
     * 同乗者の取得
     * 現在のノードスタックで、プレイヤーより上位にいるトークンを取得します
     * @param {Object} player 基準プレイヤー
     * @returns {Array<Object>} 同乗プレイヤーのリスト
     */
    getPassengers(player) {
        const stack = this.nodeStacks[player.location];
        if (!stack) return [];
        const idx = stack.indexOf(player.id);
        if (idx === -1) return [];

        // スタック内で現在のプレイヤーより上のプレイヤーが同乗者
        const passengerIds = stack.slice(idx + 1);
        return this.players.filter(p => passengerIds.includes(p.id));
    }

    /**
     * ノードスタックの移動更新
     * プレイヤーと同乗者を古いノードから削除し、新しいノードに追加します
     * @param {Object} player 移動したプレイヤー
     * @param {number} targetId 移動先ノードID
     * @param {Array<Object>} passengers 同乗プレイヤーリスト
     */
    updateNodeStacks(player, targetId, passengers) {
        const sourceId = player.location;
        const movingGroupIds = [player.id, ...passengers.map(p => p.id)];

        // 元の場所から削除
        if (this.nodeStacks[sourceId]) {
            this.nodeStacks[sourceId] = this.nodeStacks[sourceId].filter(id => !movingGroupIds.includes(id));
        }

        // 目的地に追加（既存スタックの上）
        this.nodeStacks[targetId].push(...movingGroupIds);

        // プレイヤーオブジェクトの位置を更新
        player.location = targetId;
        passengers.forEach(p => p.location = targetId);
    }


    showExecutionActions(player) {
        this.dynamicActions.innerHTML = '';
        const card = player.selectedCard;
        if (!card) { this.endTurn(); return; }

        const info = document.createElement('div');
        info.innerHTML = `<strong>${player.name}</strong> が公開: ${card.name_jp} <br>
         (移動: ${card.move}歩, コスト: ${this.formatCost(card.cost)})`;
        this.dynamicActions.appendChild(info);

        const btnMove = document.createElement('button');
        btnMove.textContent = `アクションA: 進む (${card.move}歩)`;
        btnMove.onclick = () => this.executeMove(player, card);
        this.dynamicActions.appendChild(btnMove);

        // UI/UX改善: 直接アクション用に到達可能ノードをハイライト
        if (card.move > 0) {
            this.highlightReachableNodesForDirectAction(player, card);
            const tip = document.createElement('div');
            tip.style.fontSize = '0.8rem';
            tip.style.color = 'var(--accent-color)';
            tip.style.marginTop = '10px';
            tip.textContent = '💡 マップ上の光っているノードをクリックして直接移動できます';
            this.dynamicActions.appendChild(tip);
        }

        const btnBuild = document.createElement('button');
        const { canBuild, reason } = this.canBuild(player, card);
        btnBuild.textContent = `アクションB: 建てる`;
        if (!canBuild) {
            btnBuild.disabled = true;
            btnBuild.title = reason === "already_built" ? "建設済み" : "資源不足";
            if (reason === "already_built") {
                btnBuild.textContent = "アクションB: 建設済み";
            }
        }
        btnBuild.onclick = () => this.executeBuild(player, card);
        this.dynamicActions.appendChild(btnBuild);

        // 変換アクションボタンを追加（フリーアクション）
        this.showConversionActions(player, () => this.showExecutionActions(player));
    }

    showConversionActions(player, onUpdate = null) {
        const conversionCards = player.construction.filter(c => c.effect && c.effect.startsWith('convert_'));
        if (conversionCards.length === 0) return;

        const convDiv = document.createElement('div');
        convDiv.style.marginTop = '15px';
        convDiv.style.padding = '10px';
        convDiv.style.border = '1px dashed #ccc';
        convDiv.style.borderRadius = '5px';
        convDiv.innerHTML = '<strong>🔄 フリーアクション：変換</strong><br>';

        conversionCards.forEach(card => {
            const canConvert = this.canConvert(player, card.effect);
            const btn = document.createElement('button');
            btn.style.margin = '5px';
            btn.textContent = this.getConversionLabel(card.effect);
            btn.disabled = !canConvert;
            btn.onclick = () => {
                this.applyConversionEffect(player, card.effect);
                this.updateUI();
                if (onUpdate) {
                    onUpdate();
                } else {
                    // コールバックがない場合のフォールバックローカルリフレッシュ
                    const parent = convDiv.parentNode;
                    if (parent) {
                        convDiv.remove();
                        this.showConversionActions(player);
                    }
                }
            };
            convDiv.appendChild(btn);
        });

        this.dynamicActions.appendChild(convDiv);
    }

    highlightReachableNodesForDirectAction(player, card) {
        const reachable = this.getReachableNodes(player.location, card.move);
        this.highlightNodes(reachable, (targetNodeId) => {
            // ハイライトされたノードがクリックされたときに呼ばれるコールバック
            this.executeMoveWithTarget(player, card, targetNodeId);
        });
    }

    executeMoveWithTarget(player, card, targetNodeId) {
        // P2Pモード: 移動アクションを相手に送信
        if (this.isP2PMode() && this.isLocalPlayer(player)) {
            networkManager.broadcast({
                type: 'ACTION',
                action: 'move',
                playerId: player.id,
                cardIndex: player.hand.indexOf(card),
                data: { targetNodeId: targetNodeId }
            });
        }

        // 移動確定時にボタンを消す（カード上のポップオーバーも）
        if (this.isLocalPlayer(player)) {
            this.dynamicActions.innerHTML = '';
            document.querySelectorAll('.card-actions-popover').forEach(el => el.style.display = 'none');
        }
        this.resolvingAction = true;
        this.log(`${player.name} が移動を開始しました。`);
        this.discardPile.push(card);
        this.removeCardFromHand(player, card);
        player.selectedCard = null;

        const passengers = this.getPassengers(player);
        if (passengers.length > 0) {
            this.log(`同乗者: ${passengers.map(p => p.name).join(', ')}`);
        }

        const path = this.findPath(player.location, targetNodeId, card.move);
        if (this.checkPathForLoop(path)) {
            if (this.roundTokens > 0) {
                this.log(`10->01を通過！Wトークン獲得！`);
                this.gainResource(player, 'W', 1);
                this.checkResourceCap(player);
            } else {
                this.log(`10->01を通過！(サプライ枯渇のためW獲得なし)`);
            }
            this.checkGameEnd();
        }

        this.updateNodeStacks(player, targetNodeId, passengers);
        this.finishMove(player, targetNodeId, card, passengers);
    }

    /**
     * 移動完了時の処理
     * カード資源、マス資源、建設効果による産出を処理し、UIを更新してターン終了（または次へ）
     * @param {Object} player プレイヤー
     * @param {number} targetNodeId 移動先ノードID
     * @param {Object} card 使用したカード（移動資源がある場合）
     */
    finishMove(player, targetNodeId, card, passengers = []) {
        // IDを数値に正規化
        targetNodeId = Number(targetNodeId);

        // プレイヤーの位置を更新
        player.location = targetNodeId;

        // Warp Logic: ワープマスなら即時転送
        const currentNode = mapNodes.find(n => n.id === player.location);
        if (currentNode && currentNode.warpTo) {
            this.log(`🌌 ワープ発動！ ${currentNode.name} から転送されます`);
            this.updateNodeStacks(player, currentNode.warpTo, passengers);
            targetNodeId = currentNode.warpTo;
            player.location = targetNodeId; // 位置情報の再更新
            // 同乗者も一緒に位置更新
            passengers.forEach(p => p.location = targetNodeId);
        }

        // ノードデータを取得
        const node = mapNodes.find(n => n.id === targetNodeId);

        // 1. カード移動資源の獲得
        const processCardMoveResource = (callback) => {
            if (card && card.move_resource && card.move_resource.length > 0) {
                if (card.move_resource.length > 1 && !player.isAI) {
                    // 複数選択肢 → モーダル表示
                    this.showMoveResourceChoiceModal(player, card.move_resource, (choice) => {
                        this.gainResource(player, choice, 1, 'card_move');
                        callback();
                    });
                    return;
                } else if (card.move_resource.length > 1 && player.isAI) {
                    // AI: ランダム選択
                    const choice = card.move_resource[Math.floor(Math.random() * card.move_resource.length)];
                    this.gainResource(player, choice, 1, 'card_move');
                } else {
                    // 1つだけ → 自動獲得
                    this.gainResource(player, card.move_resource[0], 1, 'card_move');
                }
            }
            callback();
        };

        // 2. マス資源の獲得
        const processNodeResource = (callback) => {
            const node = mapNodes.find(n => n.id === targetNodeId); // 再取得（スコープ外のため）
            if (node && node.resource) {
                if (node.resource === 'FMK' && !player.isAI) {
                    // プレイヤー選択
                    this.showResourceChoiceModal(player, (choice) => {
                        this.gainResource(player, choice, 1, node.name);
                        callback();
                    });
                    return;
                } else if (node.resource === 'FMK' && player.isAI) {
                    // AI選択（ランダム）
                    const choice = ['F', 'M', 'K'][Math.floor(Math.random() * 3)];
                    this.gainResource(player, choice, 1, node.name);
                } else if (node.resource === 'Card') {
                    console.log('[DEBUG] processNodeResource: Cardノード到着、drawCards呼び出し', { nodeId: node.id, player: player.name });
                    // ボーナスドローとしてカウント（補充計算から除外される）
                    player.bonusDrawsThisTurn = (player.bonusDrawsThisTurn || 0) + 1;
                    this.drawCards(player, 1);
                    this.log(`カードを1枚引きました！`);
                } else {
                    // 通常資源 (F, M, K, W)
                    this.gainResource(player, node.resource, 1, node.name);
                }
            }
            callback();
        };

        // 3. 産出建設物のトリガー処理
        // 非同期処理後にまとめて実行するため、processNodeResourceのcallback内で呼び出す形にはしていないが、
        // 実際には processCard -> processNode -> continueFinishMove という流れになる。
        // リソース獲得の産出効果もここで処理すべきだが、現在のロジックでは
        // continueFinishMove ではなく、ここで同期的に処理している（processNodeResourceも同期的になりうるがモーダルがある）
        // なので、processNodeResource の callback で残りを実行するのが正しい。

        // 順番に処理: カード資源 → マス資源 → 終了処理
        processCardMoveResource(() => {
            processNodeResource(() => {
                // トリガー産出（F/M/Kマスの場合）- これは同期的に処理しても問題ない（選択肢がないため）
                if (node && ['F', 'M', 'K'].includes(node.resource)) {
                    player.construction.forEach(c => {
                        if (c.production_condition === node.resource && c.production) {
                            for (let r in c.production) {
                                const val = c.production[r];
                                if (typeof val === 'number') {
                                    this.gainResource(player, r, val, 'production');
                                    this.log(`${c.name_jp}が${r}を${val}個産出！`);
                                } else if (val === 'variable' && c.production_formula) {
                                    let count = 0;
                                    // カードタイプごとのカウントロジック
                                    if (c.production_formula.includes('culture_cards')) {
                                        count = player.construction.filter(x => x.type === 'culture').length;
                                    } else if (c.production_formula.includes('industry_cards')) {
                                        count = player.construction.filter(x => x.type === 'industry').length;
                                    } else if (c.production_formula.includes('politics_cards')) {
                                        count = player.construction.filter(x => x.type === 'politics').length;
                                    }
                                    if (count > 0) {
                                        this.gainResource(player, r, count, 'production');
                                        this.log(`${c.name_jp}が${r}を${count}個産出！`);
                                    }
                                }
                            }
                        }
                    });
                }

                // タウポ（5）特殊アクション確認
                this.checkExtraMoveAction(player, () => {
                    this.continueFinishMove(player, card);
                });
            });
        });
    }

    /**
     * スプケベス（11）追加移動アクション確認
     * カードを捨てて追加移動するかどうかをプレイヤーに選択させる
     */
    checkExtraMoveAction(player, callback) {
        // タウポ(5)での追加移動（旧スプケベス11から変更）
        if (player.location !== 5) {
            callback();
            return;
        }

        // 追加移動に使えるカードがあるか確認
        const movableCards = player.hand.filter(c => c);
        if (movableCards.length === 0) {
            if (this.isLocalPlayer(player)) {
                // ダイアログが出ないのでログだけ出す
                // this.log(`${player.name} はスプケベスに到着しましたが、追加移動できるカードがありません。`);
            }
            callback();
            return;
        }

        if (player.isAI) {
            // AI: 50%の確率で追加移動
            if (Math.random() < 0.5) {
                const card = movableCards[Math.floor(Math.random() * movableCards.length)];
                this.log(`${player.name} (AI) はタウポの効果を使用します。`);
                this.executeExtraMove(player, card);
            } else {
                callback();
            }
            return;
        }

        // 人間プレイヤー: モーダル表示
        if (this.isLocalPlayer(player)) {
            this.showConfirmModal(
                "タウポ特殊効果",
                "手札を1枚捨てて、そのカードの移動数分だけ追加移動しますか？",
                () => {
                    this.showExtraMoveCardSelectModal(player, movableCards, (selectedCard) => {
                        this.executeExtraMove(player, selectedCard);
                    }, callback);
                },
                () => {
                    callback();
                }
            );
        } else {
            callback();
        }
    }

    /**
     * 追加移動用カード選択モーダル
     */
    showExtraMoveCardSelectModal(player, cards, onSelect, onCancel) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';

        let cardsHtml = '';
        cards.forEach((card, idx) => {
            const originalIdx = player.hand.indexOf(card);
            cardsHtml += `
                <div class="modal-card-item" onclick="window.game.handleExtraMoveCardSelect(${originalIdx})">
                    <img src="${card.image_src}" style="width:100px; cursor:pointer; border:2px solid transparent; border-radius:8px;">
                    <div style="text-align:center; font-size:0.8rem; margin-top:5px;">移動: ${card.move}</div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="modal-content" style="max-width:800px;">
                <h3>追加移動に使用するカードを選択</h3>
                <div style="display:flex; gap:15px; flex-wrap:wrap; justify-content:center; margin-bottom:20px;">
                    ${cardsHtml}
                </div>
                <div class="modal-buttons">
                    <button onclick="window.game.closeExtraMoveModal(true)">キャンセル</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        window.game.handleExtraMoveCardSelect = (handIndex) => {
            document.body.removeChild(modal);
            delete window.game.handleExtraMoveCardSelect;
            delete window.game.closeExtraMoveModal;
            const card = player.hand[handIndex];
            onSelect(card);
        };

        window.game.closeExtraMoveModal = (isCancel) => {
            if (isCancel) {
                document.body.removeChild(modal);
                delete window.game.handleExtraMoveCardSelect;
                delete window.game.closeExtraMoveModal;
                onCancel();
            }
        };
    }

    /**
     * 追加移動実行
     */
    executeExtraMove(player, card) {
        this.log(`${player.name} は ${card.name_jp} を捨てて追加移動します（移動力: ${card.move}）。`);

        this.discardPile.push(card);
        this.removeCardFromHand(player, card);

        const move = card.move;
        const reachableNodes = this.getReachableNodes(player.location, move);

        if (reachableNodes.length === 0) {
            this.continueFinishMove(player, null);
            return;
        }

        // 移動実行処理（AIまたは移動先が1つの場合）
        const executeMove = (target) => {
            const path = this.findPath(player.location, target, move);
            if (this.checkPathForLoop(path)) {
                if (this.roundTokens > 0) {
                    this.log(`10->01を通過！Wトークン獲得！`);
                    this.roundTokens--;
                    player.resources.W = (player.resources.W || 0) + 1;
                    this.checkResourceCap(player);
                } else {
                    this.log(`10->01を通過！(サプライ枯渇のためW獲得なし)`);
                }
                this.checkGameEnd();
            }
            this.updateNodeStacks(player, target, []); // 単独移動
            this.finishMove(player, target, null);
        };

        if (reachableNodes.length === 1 || player.isAI) {
            const target = player.isAI ? reachableNodes[Math.floor(Math.random() * reachableNodes.length)] : reachableNodes[0];
            executeMove(target);
        } else {
            // 分岐選択（人間）
            this.log("移動先を選択してください。");
            reachableNodes.forEach(nid => {
                const nodeEl = document.getElementById(`node-${nid}`);
                if (nodeEl) {
                    nodeEl.classList.add('reachable');
                    nodeEl.style.cursor = 'pointer';
                    nodeEl.onclick = () => {
                        document.querySelectorAll('.reachable').forEach(el => {
                            el.classList.remove('reachable');
                            el.style.cursor = '';
                            el.onclick = null;
                        });
                        executeMove(nid);
                    };
                }
            });
            this.showToast("移動先クリックで決定", "info");
        }
    }



    /**
     * 移動後の事後処理
     * UI更新と、次のアクション（ポストアクション）の確認を行います
     */
    continueFinishMove(player, card) {
        // このターンの変換フラグをリセット（念のため）
        player.construction.forEach(c => c.usedThisTurn = false);

        this.updateUI();
        this.renderMap();
        // ターン終了ではなく、建設などのポストアクションチェックへ
        this.checkPostAction(player);
    }

    /* finishTurnProcess は廃止・統合されました */

    showResourceChoiceModal(player, onChoose) {
        const overlay = document.getElementById('payment-modal-overlay');
        const content = overlay.querySelector('#payment-options');
        const title = overlay.querySelector('h2');
        const footer = overlay.querySelector('.modal-footer');

        title.textContent = "獲得する資源を選択";
        content.innerHTML = '';
        footer.innerHTML = '';

        // 説明文
        const info = document.createElement('div');
        info.className = 'cost-info';
        info.innerHTML = '<strong>ペデマスに到着！</strong> F / M / K のいずれかを1つ獲得できます。';
        content.appendChild(info);

        // 資源選択グリッド
        const grid = document.createElement('div');
        grid.className = 'selectors-grid';
        grid.style.marginTop = '15px';

        ['F', 'M', 'K'].forEach(res => {
            const box = document.createElement('div');
            box.className = `pay-box pay-box-${res.toLowerCase()}`;
            box.style.cursor = 'pointer';
            box.style.transition = 'transform 0.2s, box-shadow 0.2s';

            const label = document.createElement('div');
            label.className = 'pay-label';
            label.style.fontSize = '2rem';
            label.textContent = res;
            box.appendChild(label);

            box.onmouseenter = () => {
                box.style.transform = 'scale(1.05)';
                box.style.boxShadow = '0 6px 15px rgba(0,0,0,0.3)';
            };
            box.onmouseleave = () => {
                box.style.transform = 'scale(1)';
                box.style.boxShadow = '';
            };
            box.onclick = () => {
                overlay.classList.add('hidden');
                onChoose(res);
            };

            grid.appendChild(box);
        });

        content.appendChild(grid);
        overlay.classList.remove('hidden');
    }

    // カード移動資源選択モーダル（複数選択肢がある場合）
    showMoveResourceChoiceModal(player, options, onChoose) {
        const overlay = document.getElementById('payment-modal-overlay');
        const content = overlay.querySelector('#payment-options');
        const title = overlay.querySelector('h2');
        const footer = overlay.querySelector('.modal-footer');

        title.textContent = "カード移動資源を選択";
        content.innerHTML = '';
        footer.innerHTML = '';

        // 説明文
        const info = document.createElement('div');
        info.className = 'cost-info';
        info.innerHTML = `<strong>移動ボーナス！</strong> ${options.join(' / ')} のいずれかを1つ獲得できます。`;
        content.appendChild(info);

        // 資源選択グリッド
        const grid = document.createElement('div');
        grid.className = 'selectors-grid';
        grid.style.marginTop = '15px';

        options.forEach(res => {
            const box = document.createElement('div');
            box.className = `pay-box pay-box-${res.toLowerCase()}`;
            box.style.cursor = 'pointer';
            box.style.transition = 'transform 0.2s, box-shadow 0.2s';

            const label = document.createElement('div');
            label.className = 'pay-label';
            label.style.fontSize = '2rem';
            label.textContent = res;
            box.appendChild(label);

            box.onmouseenter = () => {
                box.style.transform = 'scale(1.05)';
                box.style.boxShadow = '0 6px 15px rgba(0,0,0,0.3)';
            };
            box.onmouseleave = () => {
                box.style.transform = 'scale(1)';
                box.style.boxShadow = '';
            };
            box.onclick = () => {
                overlay.classList.add('hidden');
                onChoose(res);
            };

            grid.appendChild(box);
        });

        content.appendChild(grid);
        overlay.classList.remove('hidden');
    }

    /**
     * 建設可能性チェック
     * コストが支払えるかどうかを判定します
     * @param {Object} player プレイヤー
     * @param {Object} card 建設対象カード
     * @returns {Object} { canBuild: boolean, reason?: string }
     */
    /**
     * 建設可能性チェック
     * GameCoreを使用
     */
    canBuild(player, card) {
        return GameCore.canBuild(player.resources, card);
    }

    /**
     * コスト支払い可能性判定
     * ワイルドカード(W)を含めて資源が足りているかチェックします
     * @param {Object} player プレイヤー
     * @param {Object} cost コストオブジェクト
     * @returns {boolean} 支払い可能ならtrue
     */
    /**
     * コストチェック
     * GameCoreを使用
     */
    checkCost(player, cost) {
        return GameCore.checkCost(player.resources, cost);
    }

    /**
     * 変換アクション可能性判定
     * 指定された変換効果を実行するための資源があるかチェックします
     * @param {Object} player プレイヤー
     * @param {string|Object} cardOrEffect 効果文字列 または カードオブジェクト
     * @returns {boolean} 可能ならtrue
     */
    /**
     * 変換アクション可能性判定
     * GameCoreを使用
     */
    canConvert(player, cardOrEffect) {
        let effect = cardOrEffect;
        let card = null;
        if (typeof cardOrEffect === 'object') {
            effect = cardOrEffect.effect;
            card = cardOrEffect;
        }

        // ターン1回制限のチェック
        if (card && card.usedThisTurn) return false;

        return GameCore.canConvert(player.resources, effect);
    }

    /**
     * 変換効果の日本語表示ラベル取得
     */
    getConversionLabel(effect) {
        if (effect === 'convert_same3_to_W') return '同種3 → W';
        if (effect === 'convert_K2_to_W') return 'K2 → W';
        if (effect === 'convert_W2_to_FMK') return 'W2 → F+M+K';
        if (effect === 'action_gain_1_choice') return '獲得: F/M/Kの1つ';
        return effect;
    }

    formatCost(cost) {
        if (!cost) return 'なし';
        if (cost.multi === 'same3') return '同種3';
        if (cost.multi === 'same4') return '同種4';
        const parts = [];
        for (const [key, val] of Object.entries(cost)) {
            if (key !== 'multi') parts.push(`${key}${val}`);
        }
        return parts.join(' ') || 'なし';
    }

    /**
     * 変換効果の適用
     * リソース消費と獲得を実行し、P2Pならアクションを通知します
     * @param {Object} player 実行プレイヤー
     * @param {string|Object} cardOrEffect 効果文字列 または カードオブジェクト
     */
    applyConversionEffect(player, cardOrEffect) {
        let effect = cardOrEffect;
        let card = null;
        if (typeof cardOrEffect === 'object') {
            effect = cardOrEffect.effect;
            card = cardOrEffect;
        }

        // カード使用制限チェック
        if (card && card.usedThisTurn) {
            this.log(`${player.name}: このカードはターン1回制限です。`, true);
            return;
        }

        if (effect === 'convert_same3_to_W') {
            // 同種資源3つを消費してWを1つ得る
            const resources = ['F', 'M', 'K'];
            let targetRes = null;
            // 1. 純粋に3つある資源を探す
            for (let r of resources) {
                if ((player.resources[r] || 0) >= 3) { targetRes = r; break; }
            }
            if (targetRes) {
                // 差し引き (Wは使わない)
                player.resources[targetRes] = (player.resources[targetRes] || 0) - 3;
                this.gainResource(player, 'W', 1);
                this.log(`${player.name} は ${targetRes}など3つ を W に変換しました。`);
            }

        } else if (effect === 'convert_K2_to_W') {
            // K 2個を支払う（不足分はWで代用可能だが、Wを得るためにWを払うのは無意味なのでロジック簡略化推奨）
            // ここでは純粋なコスト支払いロジックとして実装
            let paid = 0;
            let currentK = player.resources.K || 0;
            let fromK = Math.min(2, currentK);

            player.resources.K = currentK - fromK;
            paid += fromK;

            if (paid < 2) {
                // Kが足りない場合Wで払う（これは通常ありえないアクションだが、コスト支払いとしては正しい）
                player.resources.W = (player.resources.W || 0) - (2 - paid);
            }
            // 獲得
            this.gainResource(player, 'W', 1);
            this.log(`${player.name} は K2(またはW) を W に変換しました。`);

        } else if (effect === 'convert_W2_to_W3') {
            // Wを2個消費して3個にする（純増1）
            if (player.resources.W >= 2) {
                player.resources.W -= 2;
                this.gainResource(player, 'W', 3);
                this.log(`${player.name} は W2 を W3 に変換しました。`);
            }

        } else if (effect === 'convert_W2_to_FMK') {
            // Wを2個消費してF+M+K各1個を得る
            if (player.resources.W >= 2) {
                player.resources.W -= 2;
                this.gainResource(player, 'F', 1);
                this.gainResource(player, 'M', 1);
                this.gainResource(player, 'K', 1);
                this.log(`${player.name} は W2 を F+M+K に変換しました。`);
            }

        } else if (effect === 'action_gain_1_choice') {
            // 自由選択でF/M/Kのいずれか1つを得る
            if (player.isAI) {
                // AIはランダムに選ぶ
                const choices = ['F', 'M', 'K'];
                const picked = choices[Math.floor(Math.random() * 3)];
                this.gainResource(player, picked);
            } else {
                let picked = prompt("獲得する資源を入力してください (F, M, K)", "F");
                if (picked) picked = picked.toUpperCase();
                if (['F', 'M', 'K'].includes(picked)) {
                    this.gainResource(player, picked);
                } else {
                    alert("無効な入力です。Fを獲得しました。");
                    this.gainResource(player, 'F');
                }
            }
        }

        // 使用済みとしてマーク
        if (card) card.usedThisTurn = true;

        // [P2P] 変換アクションをブロードキャスト
        if (this.isP2PMode() && this.isLocalPlayer(player)) {
            networkManager.broadcast({
                type: 'ACTION',
                action: 'convert',
                playerId: player.id,
                cardInstanceId: card ? card.instanceId : null,
                effect: effect,
                resources: player.resources // 最新のリソース状態を送信
            });
        }
    }

    /**
     * コスト支払い実行
     * 所持資源からコスト分を減算します（Wによる補填含む）
     * @param {Object} player プレイヤー
     * @param {Object} cost コストオブジェクト
     */
    /**
     * コスト支払い実行
     * GameCoreを使用
     */
    payCost(player, cost) {
        GameCore.payCost(player.resources, cost);
    }

    // 支払いモーダルを表示（人間プレイヤー用）
    showPaymentModal(player, cost, onComplete) {
        // 支払い方が一通りしかない場合は自動支払い
        // 条件: Wを使う必要がない、または選択肢がない
        const hasWild = (player.resources.W || 0) > 0;
        let needsChoice = false;

        if (cost.multi === 'same3') {
            // 同種3は常に選択が必要（どの資源を3つ払うか）
            needsChoice = true;
        } else {
            // 通常コスト: 各資源が足りているかチェック
            for (const key in cost) {
                if (key === 'multi') continue;
                const required = cost[key] || 0;
                const have = player.resources[key] || 0;
                if (have < required && hasWild) {
                    // 不足分をWで補う選択肢がある
                    needsChoice = true;
                    break;
                }
            }
        }

        if (!needsChoice) {
            // 自動支払い（モーダルをスキップ）
            const paymentPlan = this.calculatePaymentPlan(player, cost);
            onComplete(paymentPlan);
            return;
        }

        const overlay = document.getElementById('payment-modal-overlay');
        const content = overlay.querySelector('#payment-options');
        const title = overlay.querySelector('h2');
        const footer = overlay.querySelector('.modal-footer');

        title.textContent = '資源の支払い選択';
        content.innerHTML = '';
        footer.innerHTML = '';

        // フッターボタンを動的に作成
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-secondary';
        btnCancel.textContent = 'キャンセル';
        footer.appendChild(btnCancel);

        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn-primary';
        btnConfirm.textContent = '支払う';
        btnConfirm.disabled = true;
        footer.appendChild(btnConfirm);

        // コスト表示
        let costDisplay = '';
        if (cost.multi === 'same3') {
            costDisplay = '同種資源 3個';
        } else {
            const parts = [];
            const colorMap = { F: '#f39c12', M: '#e74c3c', K: '#3498db' };
            for (const key in cost) {
                if (key !== 'multi' && cost[key] > 0) {
                    const color = colorMap[key] || '#333';
                    parts.push(`<span style="color:${color};font-weight:bold">${key}:${cost[key]}</span>`);
                }
            }
            costDisplay = parts.join(' ');
        }

        const costInfo = document.createElement('div');
        costInfo.className = 'cost-info';
        costInfo.innerHTML = `<strong>必要コスト:</strong> ${costDisplay}`;
        content.appendChild(costInfo);

        // 所持資源表示
        const resInfo = document.createElement('div');
        resInfo.className = 'res-info';
        resInfo.innerHTML = `<strong>所持資源:</strong> <span style="color:#f39c12">F:${player.resources.F || 0}</span> <span style="color:#e74c3c">M:${player.resources.M || 0}</span> <span style="color:#3498db">K:${player.resources.K || 0}</span> <span style="color:#95a5a6">W:${player.resources.W || 0}</span>`;
        content.appendChild(resInfo);

        // 支払い選択UI - 推奨支払い方法を初期値として設定
        const recommendedPlan = this.calculatePaymentPlan(player, cost);
        const paymentState = {
            F: recommendedPlan.F || 0,
            M: recommendedPlan.M || 0,
            K: recommendedPlan.K || 0,
            W_as_F: recommendedPlan.W_as_F || 0,
            W_as_M: recommendedPlan.W_as_M || 0,
            W_as_K: recommendedPlan.W_as_K || 0
        };

        const updatePaymentUI = () => {
            selectorsDiv.querySelectorAll('.payment-val').forEach(span => {
                const res = span.dataset.res;
                span.textContent = paymentState[res] || 0;
            });
            // 合計チェック
            let valid = false;

            if (cost.multi === 'same3') {
                // 同種3のチェック: F/M/Kいずれか + W_sub で3以上
                for (const r of ['F', 'M', 'K']) {
                    const direct = paymentState[r] || 0;
                    const wSub = paymentState.W_sub || 0;
                    if (direct + wSub >= 3) {
                        valid = true;
                        break;
                    }
                }
            } else if (cost.multi === 'same4') {
                // 同種4のチェック
                for (const r of ['F', 'M', 'K']) {
                    const direct = paymentState[r] || 0;
                    const wSub = paymentState.W_sub || 0;
                    if (direct + wSub >= 4) {
                        valid = true;
                        break;
                    }
                }
            } else {
                valid = true;
                for (const key in cost) {
                    if (key === 'multi') continue;
                    const required = cost[key];
                    // 直接支払い + W_sub（代替）
                    const paid = (paymentState[key] || 0) + (key !== 'W' ? (paymentState.W_sub || 0) : 0);
                    if (paid < required) {
                        valid = false;
                        break;
                    }
                }
            }
            btnConfirm.disabled = !valid;
        };

        const selectorsDiv = document.createElement('div');
        selectorsDiv.style.marginTop = '15px';

        // 支払い対象資源リスト（Wコスト含む場合はWも追加）
        const payResList = ['F', 'M', 'K'];
        if (cost.W && cost.W > 0) payResList.push('W');

        const colorMap = { F: '#f39c12', M: '#e74c3c', K: '#3498db', W: '#22c55e' };

        payResList.forEach(res => {
            const row = document.createElement('div');
            row.className = 'payment-row';
            row.innerHTML = `
                <span class="payment-label" style="color:${colorMap[res]}">${res}</span>
                <div class="payment-controls">
                    <button class="btn-stepper btn-minus" data-res="${res}">−</button>
                    <span class="payment-val" data-res="${res}">${paymentState[res] || 0}</span>
                    <button class="btn-stepper btn-plus" data-res="${res}">+</button>
                </div>
            `;
            selectorsDiv.appendChild(row);
        });

        // Wを代替支払いとして使う場合の行（Wトークン保有時）
        if ((player.resources.W || 0) > 0 && !payResList.includes('W')) {
            const wRow = document.createElement('div');
            wRow.className = 'payment-row';
            wRow.innerHTML = `
                <span class="payment-label" style="color:${colorMap.W}">W (代替)</span>
                <div class="payment-controls">
                    <button class="btn-stepper btn-minus" data-res="W_sub">−</button>
                    <span class="payment-val" data-res="W_sub">0</span>
                    <button class="btn-stepper btn-plus" data-res="W_sub">+</button>
                </div>
            `;
            selectorsDiv.appendChild(wRow);
            paymentState.W_sub = 0;
        }

        content.appendChild(selectorsDiv);

        // ボタンイベント
        selectorsDiv.querySelectorAll('.btn-plus').forEach(btn => {
            btn.onclick = () => {
                const res = btn.dataset.res;
                const isWSub = (res === 'W_sub');
                const actualRes = isWSub ? 'W' : res;
                const stateKey = res;

                // 上限チェック
                const owned = player.resources[actualRes] || 0;
                let usedOfThis = paymentState[res] || 0;

                // W_subの場合、他のW_as_X用途での使用量もカウント
                if (isWSub) {
                    const usedW = (paymentState.W_as_F || 0) + (paymentState.W_as_M || 0) + (paymentState.W_as_K || 0) + (paymentState.W_sub || 0);
                    if (usedW < owned) {
                        paymentState[stateKey] = (paymentState[stateKey] || 0) + 1;
                        updatePaymentUI();
                    }
                } else {
                    if (usedOfThis < owned) {
                        paymentState[stateKey] = (paymentState[stateKey] || 0) + 1;
                        updatePaymentUI();
                    }
                }
            };
        });

        selectorsDiv.querySelectorAll('.btn-minus').forEach(btn => {
            btn.onclick = () => {
                const res = btn.dataset.res;
                if ((paymentState[res] || 0) > 0) {
                    paymentState[res] = paymentState[res] - 1;
                    updatePaymentUI();
                }
            };
        });

        // フッターボタンイベント
        btnConfirm.onclick = () => {
            overlay.classList.add('hidden');
            onComplete(paymentState);
        };

        btnCancel.onclick = () => {
            overlay.classList.add('hidden');
            // キャンセル時は何もしない（ターンは継続、選択し直し可能）
            this.log('建設をキャンセルしました。', true);
            this.mainActionTaken = false; // アクションをリセット
        };

        overlay.classList.remove('hidden');
        updatePaymentUI();
    }

    // 支払い計画を計算
    calculatePaymentPlan(player, cost) {
        const plan = { F: 0, M: 0, K: 0, W: 0, W_as_F: 0, W_as_M: 0, W_as_K: 0 };

        if (cost.multi === 'same3') {
            // 同種3を支払う
            for (const r of ['F', 'M', 'K']) {
                if ((player.resources[r] || 0) >= 3) {
                    plan[r] = 3;
                    return plan;
                }
            }
            // ワイルドで補う
            for (const r of ['F', 'M', 'K']) {
                const avail = player.resources[r] || 0;
                if (avail + (player.resources.W || 0) >= 3) {
                    plan[r] = avail;
                    plan[`W_as_${r}`] = 3 - avail;
                    return plan;
                }
            }
            // 全てワイルド
            plan.W = 3;
            return plan;
        }

        if (cost.multi === 'same4') {
            // 同種4を支払う
            for (const r of ['F', 'M', 'K']) {
                if ((player.resources[r] || 0) >= 4) {
                    plan[r] = 4;
                    return plan;
                }
            }
            // ワイルドで補う
            for (const r of ['F', 'M', 'K']) {
                const avail = player.resources[r] || 0;
                if (avail + (player.resources.W || 0) >= 4) {
                    plan[r] = avail;
                    plan[`W_as_${r}`] = 4 - avail;
                    return plan;
                }
            }
            // 全てワイルド
            plan.W = 4;
            return plan;
        }

        // 通常コスト
        for (const key in cost) {
            if (key === 'multi') continue;
            const required = cost[key];
            const avail = player.resources[key] || 0;
            if (avail >= required) {
                plan[key] = required;
            } else {
                plan[key] = avail;
                plan[`W_as_${key}`] = required - avail;
            }
        }
        return plan;
    }

    // 資源を差し引く（支払い計画に基づく）
    deductResources(player, paymentPlan) {
        for (const key of ['F', 'M', 'K', 'W']) {
            if (paymentPlan[key]) {
                player.resources[key] -= paymentPlan[key];
                if (this.stats) this.stats.resourcesSpent[key] += paymentPlan[key];
            }
        }
        // ワイルドで代替した分 (旧形式: W_as_F, W_as_M, W_as_K)
        for (const key of ['F', 'M', 'K']) {
            const wildKey = `W_as_${key}`;
            if (paymentPlan[wildKey]) {
                player.resources.W -= paymentPlan[wildKey];
                if (this.stats) this.stats.resourcesSpent[wildKey] += paymentPlan[wildKey];
            }
        }
        // 新形式: W_sub（代替支払い統合キー）
        if (paymentPlan.W_sub) {
            player.resources.W -= paymentPlan.W_sub;
            if (this.stats) this.stats.resourcesSpent.W += paymentPlan.W_sub;
        }
    }

    // チェーンビルドアクションを表示（人間プレイヤー用）
    showChainBuildActions(player, chainRemaining) {
        console.log('[DEBUG] showChainBuildActions: called', { chainRemaining, playerName: player.name });

        // UI更新（既存のアクションパネルはクリア）
        this.updateUI();
        this.highlightNodes([], null);

        // 建設可能なカードを抽出
        const buildableCards = player.hand.filter(c => this.canBuild(player, c).canBuild);

        if (buildableCards.length === 0) {
            this.log(`${player.name} は建設可能なカードがないため、チェーン建設を終了します。`);
            this.checkPostAction(player);
            return;
        }

        // モーダルを表示
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';

        let cardsHtml = '';
        buildableCards.forEach((card, idx) => {
            // 元のhand配列内のインデックスを探す
            const originalIdx = player.hand.indexOf(card);
            cardsHtml += `
                <div class="modal-card-item" onclick="window.game.handleChainBuildSelect(${originalIdx})">
                    <img src="${card.image_src}" style="width:120px; cursor:pointer; border:2px solid transparent; border-radius:8px;">
                    <div style="text-align:center; font-size:0.8rem; margin-top:5px; font-weight:bold;">${card.name_jp}</div>
                    <div style="text-align:center; font-size:0.75rem; color:#666;">コスト: ${this.formatCost(card.cost)}</div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="modal-content" style="max-width:900px;">
                <h3>チェーン建設: 残り ${chainRemaining} 回</h3>
                <p>建設するカードを選択してください。</p>
                <div style="display:flex; gap:15px; flex-wrap:wrap; justify-content:center; margin-bottom:20px; max-height:400px; overflow-y:auto;">
                    ${cardsHtml}
                </div>
                <div class="modal-buttons">
                    <button onclick="window.game.closeChainBuildModal(true)" class="btn-secondary">建設を終了（スキップ）</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // グローバルハンドラ設定
        window.game.handleChainBuildSelect = (handIndex) => {
            document.body.removeChild(modal);
            delete window.game.handleChainBuildSelect;
            delete window.game.closeChainBuildModal;

            const card = player.hand[handIndex];
            this.log(`${player.name} continues chain: Building ${card.name_jp}`);
            this.executeBuild(player, card, chainRemaining - 1);
        };

        window.game.closeChainBuildModal = (isSkip) => {
            if (isSkip) {
                document.body.removeChild(modal);
                delete window.game.handleChainBuildSelect;
                delete window.game.closeChainBuildModal;

                this.log(`${player.name} はチェーン建設をスキップしました。`);
                this.checkPostAction(player);
            }
        };
    }

    /**
     * 移動アクションの実行
     * 移動先選択のためのハイライト表示を行います
     * @param {Object} player 実行プレイヤー
     * @param {Object} card 移動に使用するカード
     */
    executeMove(player, card) {
        // アクション実行済みなら何もしない
        if (this.mainActionTaken) {
            console.warn("executeMove: Action already taken this turn");
            return;
        }
        // カードが手札にあるか確認（連打防止）
        if (!card || (!player.hand.includes(card) && card.move !== 0)) {
            console.warn("executeMove: Card not in hand or null", card);
            return;
        }

        if (card.move === 0) {
            this.mainActionTaken = true; // 移動0でもアクション消費
            this.log(`${player.name} は移動できません（移動力0）`);
            // 移動0でも移動終了として処理（その場に留まる）
            this.discardPile.push(card);
            this.removeCardFromHand(player, card);
            player.selectedCard = null;
            this.finishMove(player, player.location, card);
            return;
        }

        // 移動アクション開始としてフラグを立てる（建設との二重実行防止）
        this.mainActionTaken = true;
        // ノードハイライトして移動先を選択させる
        this.highlightReachableNodesForDirectAction(player, card);
    }

    /**
     * 建設アクションの実行
     * 支払い処理（AIは即時、人間はモーダル）を経て建設を確定します
     * @param {Object} player 実行プレイヤー
     * @param {Object} card 建設対象カード
     * @param {number} chainRemaining 残りのチェーン建設回数 (-1 = 初回建設, 0以上 = チェーン継続)
     */
    executeBuild(player, card, chainRemaining = -1) {
        console.log('[DEBUG] executeBuild called: chainRemaining =', chainRemaining, ', mainActionTaken =', this.mainActionTaken);
        // 初回建設（chainRemaining === -1）ならアクション済みチェック
        // チェーン継続（chainRemaining >= 0）ならスキップ
        if (chainRemaining === -1 && this.mainActionTaken) {
            console.warn("executeBuild: Action already taken this turn");
            return;
        }

        // 移動ハイライトを消去（誤って移動しないように）
        this.highlightNodes([], null);
        this.highlightCallback = null; // 念のため明示的にnull

        // カードが手札にあるか確認（連打防止）
        if (!card || (!player.hand.includes(card) && chainRemaining === -1)) {
            console.warn("executeBuild: Card not in hand or null", card);
            return;
        }

        // ボタン連打/誤操作防止のためアクションボタンを消去
        if (!player.isAI) {
            this.dynamicActions.innerHTML = ''; // 念のため
            document.querySelectorAll('.card-actions-popover').forEach(el => el.style.display = 'none');
        }

        // 初回建設ならアクション済みフラグを立てる
        if (chainRemaining === -1) {
            this.mainActionTaken = true;
        }

        if (!card) {
            console.error("executeBuild called with null card");
            this.log("エラー: カードが無効です");
            return;
        }
        this.log(`${player.name} は「建設」を選択しました。`);

        // AIの場合、自動支払いで直接進行
        if (player.isAI) {
            this.payCost(player, card.cost);
            this.finalizeBuild(player, card, chainRemaining);
            return;
        }

        // 人間の場合、支払いモーダルを表示
        this.showPaymentModal(player, card.cost, (paymentPlan) => {
            this.deductResources(player, paymentPlan);
            this.finalizeBuild(player, card, chainRemaining);
        });
    }

    /**
     * 建設の確定処理
     * カードをタブローに移動し、効果適用、チェーン建設の継続確認を行います
     */
    finalizeBuild(player, card, chainRemaining = 0) {
        // [P2P] 建設アクションをブロードキャスト
        if (this.isP2PMode() && this.isLocalPlayer(player)) {
            networkManager.broadcast({
                type: 'ACTION',
                action: 'build',
                playerId: player.id,
                cardInstanceId: card.instanceId,
                cardId: card.id, // マスターIDを追加
                chainRemaining: chainRemaining,
                resources: player.resources // リソース状態を完全同期
            });
        }

        this.removeCardFromHand(player, card);
        player.selectedCard = null;
        player.construction.push(card);
        player.lastAction = '建設';

        // チェーンビルドの処理
        // chainRemaining === -1 は初回建設を示すため、0として扱う
        let newChainRemaining = chainRemaining === -1 ? 0 : chainRemaining;
        if (card.chain_build) {
            newChainRemaining += card.chain_build;
            console.log('[DEBUG] finalizeBuild: chain_build detected', { cardName: card.name_jp, chainBuild: card.chain_build, newChainRemaining });
        }

        console.log('[DEBUG] finalizeBuild: Checking chain continuation', { newChainRemaining, handLength: player.hand.length, isAI: player.isAI });

        if (newChainRemaining > 0 && player.hand.length > 0) {
            this.log(`${player.name} は残り ${newChainRemaining} 回のチェーン建設が可能です。`);
            if (player.isAI) {
                const delay = this.simulationMode ? this.simSpeed : 50;
                setTimeout(() => this.executeAITurnChain(player, newChainRemaining), delay);
            } else {
                console.log('[DEBUG] finalizeBuild: Calling showChainBuildActions');
                this.showChainBuildActions(player, newChainRemaining);
            }
        } else {
            // 周回トークンが尽きてもラウンド終了までは続くため、常に次へ進む
            this.checkGameEnd();
            this.checkPostAction(player);
        }
    }

    checkGameEnd() {
        if (this.roundTokens <= 0) {
            this.gameEndTriggered = true;
            // ログ重複防止: 一度だけ出すなどの制御を入れてもいいが、
            // 今は単純に毎回警告して気づかせる
            this.log("周回トークンがなくなりました！このラウンドの最後までプレイして終了します。", true);
            return true;
        }
        return false;
    }

    /**
     * ポストアクションの確認
     * メインアクション終了後に実行可能なフリーアクションがあればUIを表示し、なければターンを終了します
     * @param {Object} player プレイヤー
     */
    checkPostAction(player) {
        if (!player.isAI) {
            const hasConv = player.construction.some(c => c.effect && c.effect.startsWith('convert_'));
            if (hasConv) {
                this.showPostActionUI(player);
                return;
            }
        }
        this.endTurn();
    }

    showPostActionUI(player) {
        // UIを更新して古いボタンを消す
        this.updateUI();
        this.highlightCallback = null;

        this.dynamicActions.innerHTML = '';

        const msg = document.createElement('div');
        msg.innerHTML = `<strong>${player.name}のアクション完了</strong><br>フリーアクション（変換）を行いますか？`;
        msg.style.marginBottom = '10px';
        this.dynamicActions.appendChild(msg);

        // 変換アクションボタンを表示
        this.showConversionActions(player, () => this.showPostActionUI(player));

        const btnEnd = document.createElement('button');
        btnEnd.textContent = "ターン終了";
        btnEnd.style.marginTop = '15px';
        btnEnd.style.display = 'block';
        btnEnd.style.width = '100%';
        btnEnd.onclick = () => this.endTurn();
        this.dynamicActions.appendChild(btnEnd);

        // パネルを表示
        const panel = document.getElementById('action-panel');
        if (panel) panel.style.display = 'block';
    }

    /**
     * 資源獲得処理
     * 統計情報を更新しながらプレイヤーに資源を付与します
     */
    gainResource(player, type, amount = 1, source = 'other') {
        if (!type || amount <= 0) return 0;

        // 特殊タイプ 'Card' の処理
        if (type === 'Card') {
            this.drawCards(player, 1);
            this.log(`${player.name} はカードを引きました。`, true);
            return 0; // count as resource gain? maybe not for amount return
        }
        // 特殊タイプ 'FMK' の処理
        if (type === 'FMK') {
            const pick = ['F', 'M', 'K'][Math.floor(Math.random() * 3)];
            return this.gainResource(player, pick, 1, source);
        }

        let actualGain = 0;

        if (type === 'W') {
            // Wはサプライから取得 (有限)
            if (this.roundTokens >= amount) {
                actualGain = amount;
                this.roundTokens -= amount;
            } else {
                actualGain = this.roundTokens;
                this.roundTokens = 0;
            }
            if (actualGain > 0) {
                player.resources.W = (player.resources.W || 0) + actualGain;
            } else {
                this.log(`${player.name} は W を獲得しようとしましたが、サプライが尽きていました。`);
            }
            // ゲーム終了チェック呼び出し
            this.checkGameEnd();
        } else {
            // F/M/Kは通常加算 (無限)
            if (player.resources[type] !== undefined) {
                player.resources[type] += amount;
                actualGain = amount;
            }
        }

        // ログ出力 (実際に獲得できた場合)
        if (actualGain > 0) {
            this.log(`${player.name} は ${actualGain} <span class="res-tag ${type.toLowerCase()}">${type}</span> を獲得しました`, true);
        }

        // 統計トラッキング
        if (this.stats && actualGain > 0) {
            if (this.stats.resourcesGained[type] !== undefined) {
                this.stats.resourcesGained[type] += actualGain;
                if (this.stats.gainsBySource[source]) {
                    this.stats.gainsBySource[source][type] += actualGain;
                }
            }
        }

        // 資源上限チェック
        this.checkResourceCap(player);

        return actualGain;
    }

    /**
     * 資源上限チェック
     * 総資源数が10を超えている場合、破棄処理を実行
     * @param {Object} player プレイヤー
     */
    checkResourceCap(player) {
        const RESOURCE_CAP = 8;
        const totalResources = this.getTotalResources(player);

        if (totalResources > RESOURCE_CAP) {
            const excessCount = totalResources - RESOURCE_CAP;
            this.log(`${player.name} は資源上限(${RESOURCE_CAP})を超えました。${excessCount}個捨てる必要があります。(Wは上限に含みません)`, true);

            if (player.isAI) {
                // AIは自動で最も多い資源を捨てる
                this.aiDiscardResources(player, excessCount);
            } else if (this.isLocalPlayer(player)) {
                // 人間プレイヤーは選択UI表示
                this.showResourceDiscardModal(player, excessCount);
            }
        }
    }

    /**
     * プレイヤーの総資源数を取得
     * @param {Object} player プレイヤー
     * @returns {number} 総資源数
     */
    getTotalResources(player) {
        return (player.resources.F || 0) +
            (player.resources.M || 0) +
            (player.resources.K || 0);
        // (player.resources.W || 0); // Wは上限に含まない
    }

    /**
     * AI用：資源を自動で捨てる
     * 最も多い資源から順に捨てる
     * @param {Object} player AIプレイヤー
     * @param {number} count 捨てる数
     */
    aiDiscardResources(player, count) {
        for (let i = 0; i < count; i++) {
            // 最も多い資源を選択
            const types = ['F', 'M', 'K'];
            let maxType = types[0];
            let maxCount = player.resources[types[0]] || 0;

            for (const t of types) {
                if ((player.resources[t] || 0) > maxCount) {
                    maxCount = player.resources[t];
                    maxType = t;
                }
            }

            if (maxCount > 0) {
                player.resources[maxType]--;
                this.log(`${player.name} は <span class="res-tag ${maxType.toLowerCase()}">${maxType}</span> を1個捨てました`);
            }
        }
        this.updateUI();
    }

    /**
     * 資源破棄モーダルを表示
     * @param {Object} player プレイヤー
     * @param {number} count 捨てる数
     */
    showResourceDiscardModal(player, count) {
        const overlay = document.getElementById('payment-modal-overlay');
        const content = overlay.querySelector('#payment-options');
        const title = overlay.querySelector('h2');
        const footer = overlay.querySelector('.modal-footer');

        title.textContent = `資源を${count}個捨ててください`;
        content.innerHTML = '';
        footer.innerHTML = '';

        // 現在の資源表示
        const resInfo = document.createElement('div');
        resInfo.className = 'res-info';
        resInfo.innerHTML = `<strong>現在の資源:</strong> 
            <span style="color:#f39c12">F:${player.resources.F || 0}</span> 
            <span style="color:#e74c3c">M:${player.resources.M || 0}</span> 
            <span style="color:#3498db">K:${player.resources.K || 0}</span> 
            <span style="color:#22c55e">W:${player.resources.W || 0}</span>
            <br><strong>合計(W除く):</strong> ${this.getTotalResources(player)} → ${8}にする`;
        content.appendChild(resInfo);

        // 捨てる資源の選択状態
        const discardState = { F: 0, M: 0, K: 0, W: 0 };

        // 各資源の選択UI
        const types = ['F', 'M', 'K'];
        const colors = { F: '#f39c12', M: '#e74c3c', K: '#3498db' };

        const selectionDiv = document.createElement('div');
        selectionDiv.style.marginTop = '15px';

        types.forEach(t => {
            if ((player.resources[t] || 0) > 0) {
                const row = document.createElement('div');
                row.className = 'payment-row';
                row.innerHTML = `
                    <span class="payment-label" style="color:${colors[t]}">${t}</span>
                    <div class="payment-controls">
                        <button class="btn-stepper btn-minus" data-res="${t}">−</button>
                        <span class="payment-val" id="discard-${t}">0</span>
                        <button class="btn-stepper btn-plus" data-res="${t}">+</button>
                    </div>
                `;
                selectionDiv.appendChild(row);
            }
        });
        content.appendChild(selectionDiv);

        // 確認ボタン
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-primary';
        confirmBtn.textContent = `確定 (0/${count})`;
        confirmBtn.disabled = true;
        footer.appendChild(confirmBtn);

        // 更新関数
        const updateDiscardUI = () => {
            const total = discardState.F + discardState.M + discardState.K;
            confirmBtn.textContent = `確定 (${total}/${count})`;
            confirmBtn.disabled = (total !== count);

            types.forEach(t => {
                const valEl = document.getElementById(`discard-${t}`);
                if (valEl) valEl.textContent = discardState[t];
            });
        };

        // イベントリスナー
        selectionDiv.querySelectorAll('.btn-plus').forEach(btn => {
            btn.onclick = () => {
                const t = btn.dataset.res;
                const total = discardState.F + discardState.M + discardState.K;
                if (total < count && discardState[t] < (player.resources[t] || 0)) {
                    discardState[t]++;
                    updateDiscardUI();
                }
            };
        });

        selectionDiv.querySelectorAll('.btn-minus').forEach(btn => {
            btn.onclick = () => {
                const t = btn.dataset.res;
                if (discardState[t] > 0) {
                    discardState[t]--;
                    updateDiscardUI();
                }
            };
        });

        // 確定処理
        confirmBtn.onclick = () => {
            types.forEach(t => {
                player.resources[t] -= discardState[t];
                if (discardState[t] > 0) {
                    this.log(`${player.name} は <span class="res-tag ${t.toLowerCase()}">${t}</span> を${discardState[t]}個捨てました`);
                }
            });
            overlay.classList.add('hidden');
            this.updateUI();
        };

        overlay.classList.remove('hidden');
    }

    removeCardFromHand(player, card) {
        const idx = player.hand.indexOf(card);
        if (idx > -1) player.hand.splice(idx, 1);
        this.updateUI();
    }

    /**
     * 手札補充処理
     * ターン終了時に手札上限まで補充します
     */
    replenishPlayerHand(player) {
        // 建設済みカードからのdraw_extraボーナスを計算
        let drawExtra = 0;
        player.construction.forEach(c => {
            if (c.draw_extra) drawExtra += c.draw_extra;
        });
        let limit = 3 + drawExtra;

        // カードマス等からのボーナスドローは補充計算から除外
        // (bonusDrawsThisTurn分を引いて計算し、その分多く引けるようにする)
        const bonusDraws = player.bonusDrawsThisTurn || 0;
        let effectiveHandSize = player.hand.length - bonusDraws;
        let need = limit - effectiveHandSize;

        if (need > 0) {
            this.drawCards(player, need);
            this.log(`${player.name} はカードを ${need} 枚補充しました。`, true);
        }

        // ボーナスドローカウントをリセット
        player.bonusDrawsThisTurn = 0;
    }

    /**
     * ワープチェック
     * ターン終了時にワープマスにいた場合、もう一方のマスに自動移動
     * @param {Object} player プレイヤー
     */
    checkWarp(player) {
        const currentNode = mapNodes.find(n => n.id === player.location);
        if (currentNode && currentNode.type === 'warp' && currentNode.warpTo) {
            const warpTarget = currentNode.warpTo;
            const targetNode = mapNodes.find(n => n.id === warpTarget);

            this.log(`${player.name} はワープ！${currentNode.name} → ${targetNode ? targetNode.name : warpTarget}へ移動！`, true);

            // ノードスタック更新
            if (this.nodeStacks[player.location]) {
                this.nodeStacks[player.location] = this.nodeStacks[player.location].filter(id => id !== player.id);
            }
            if (!this.nodeStacks[warpTarget]) {
                this.nodeStacks[warpTarget] = [];
            }
            this.nodeStacks[warpTarget].push(player.id);

            // プレイヤー位置を更新
            player.location = warpTarget;

            // 地図更新
            this.renderMap();
        }
    }

    /**
     * ターン終了実行
     * 手札補充、次プレイヤーへの移行、ラウンド終了判定を行います
     */
    performTurnEnd(targetPlayerId) {
        const player = this.players[targetPlayerId];
        if (player) {
            // ワープチェックはfinishMoveで即時実行されるため、ここでは不要（無限ループ回避）
            // this.checkWarp(player);
            this.replenishPlayerHand(player);
        }

        const pCount = this.players.length || this.playerCount;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % pCount;
        this.turnsPlayedInRound++;

        // [P2P] 全員にターン終了と更新情報を通知
        if (this.isP2PMode() && this.networkMode === 'host') {
            const updateData = {
                type: 'TURN_UPDATE',
                currentPlayerIndex: this.currentPlayerIndex,
                turnsPlayedInRound: this.turnsPlayedInRound,
                roundTokens: this.roundTokens,
                replenishedPlayerId: targetPlayerId,
                newHand: player.hand
            };
            networkManager.broadcast(updateData);
        }

        // ラウンド終了判定
        if (this.turnsPlayedInRound >= pCount) {
            if (this.gameEndTriggered) {
                this.endGame();
            } else {
                this.startReplenishPhase();
            }
        } else {
            // 次のプレイヤーのターンへ
            const delay = this.simulationMode ? 20 : this.simSpeed;
            if (this.networkMode !== 'guest') {
                setTimeout(() => {
                    this.startExecuteTurn();
                }, delay);
            }
        }
    }

    /**
     * ターン終了トリガー
     * ゲストの場合はホストにリクエストを送り、ホスト/ローカルの場合は即実行します
     */
    endTurn() {
        // P2Pゲスト: ホストに終了リクエストを送るのみ
        if (this.isP2PMode() && this.networkMode === 'guest') {
            networkManager.sendToHost({
                type: 'REQUEST_TURN_END'
            });
            return;
        }

        // ホスト または ローカル: ターン終了を実行
        this.performTurnEnd(this.currentPlayerIndex);
    }

    /**
     * 補充フェイズ（ラウンド更新）開始
     * 次のラウンドの準備、スタートプレイヤーの移動、ラウンドトークン管理を行います
     */
    startReplenishPhase() {
        // P2Pモード: ゲストはホストからの同期を待つため何もしない
        if (this.isP2PMode() && this.networkMode !== 'host') return;

        this.turnsPlayedInRound = 0; // 安全のためリセット
        this.players.forEach(p => p.lastAction = null); // 新ラウンド用にリセット
        this.updateUI();
        this.dynamicActions.innerHTML = '';

        // スタートプレイヤーを左隣へ移動
        this.startPlayerIndex = (this.startPlayerIndex + 1) % this.playerCount;
        this.log(`スタートプレイヤーは ${this.players[this.startPlayerIndex].name} になりました`);

        if (this.roundTokens <= 0) {
            this.endGame();
        } else {
            this.recordRoundStats();
            this.round++;
            this.phase = 'plan';
            this.nextPhaseBtn.disabled = false;
            this.log("次のラウンドを開始します...");

            // P2Pモード: 新しいラウンド状態をブロードキャスト（手札は含めない）
            if (this.isP2PMode() && this.networkMode === 'host') {
                networkManager.broadcast({
                    type: 'ROUND_REPLENISH',
                    round: this.round,
                    roundTokens: this.roundTokens,
                    phase: this.phase,
                    startPlayerIndex: this.startPlayerIndex
                });
            }

            this.updateUI();
            this.checkAIPlan();
        }
    }

    /**
     * ゲーム終了処理
     * 最終VP計算、結果表示、統計情報の表示を行います
     */
    endGame() {
        this.log("=== GAME OVER ===");
        // 統計記録付きの最終再計算
        this.players.forEach(p => this.calculateVP(p, true));

        const results = this.players.map(p => {
            const score = this.calculateVP(p);
            return {
                name: p.name,
                color: p.color,
                vp: score,
                builtCount: p.construction.length,
                tokens: p.roundTokens || 0,
                aiStrategy: p.aiStrategy || 'Human'
            };
        });

        // VPでソート（降順）
        results.sort((a, b) => b.vp - a.vp);

        const summaryDiv = document.getElementById('results-summary');
        let html = `
            <table style="width:100%; border-collapse: collapse; margin-top:10px;">
<thead>
    <tr style="border-bottom: 2px solid #eee; text-align: left;">
        <th style="padding:8px;">Player</th>
        <th style="padding:8px; text-align:center;">VP</th>
        <th style="padding:8px; text-align:center;">Built</th>
        <th style="padding:8px; text-align:center;">RT</th>
    </tr>
</thead>
<tbody>
        `;

        results.forEach(res => {
            html += `
<tr style="border-bottom: 1px solid #eee;">
    <td style="padding:8px;"><span class="token" style="background:${res.color}; width:10px; height:10px; display:inline-block; margin-right:5px;"></span>${res.name}</td>
    <td style="padding:8px; font-weight:bold; text-align:center;">${res.vp}</td>
    <td style="padding:8px; text-align:center;">${res.builtCount}</td>
    <td style="padding:8px; text-align:center;">${res.tokens}</td>
</tr>
            `;
        });
        html += `</tbody></table>`;

        const winner = results[0];
        html += `<h3 style="text-align:center; color:var(--accent-color); margin:15px 0 10px 0;">🏆 勝者: ${winner.name} !</h3>`;

        // バランス調整用の統計セクションを追加
        if (this.stats) {
            html += `
<div style="margin-top:20px; border:1px solid #ddd; border-radius:8px; padding:15px; background:#f9f9f9; max-height:300px; overflow-y:auto; font-size:0.85rem;">
    <h4 style="margin-top:0; border-bottom:1px solid #ccc; padding-bottom:5px;">📊 バランス調整用統計データ</h4>
    
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
        <div>
            <strong>資源獲得状況 (Source別)</strong><br>
            <small>移動: F:${this.stats.gainsBySource.move.F}, M:${this.stats.gainsBySource.move.M}, K:${this.stats.gainsBySource.move.K}</small><br>
            <small>産出: F:${this.stats.gainsBySource.production.F}, M:${this.stats.gainsBySource.production.M}, K:${this.stats.gainsBySource.production.K}</small><br>
            <small>移動B: F:${this.stats.gainsBySource.move_bonus.F}, M:${this.stats.gainsBySource.move_bonus.M}, K:${this.stats.gainsBySource.move_bonus.K}</small>
        </div>
        <div>
            <strong>資源消費計</strong><br>
            <small>F:${this.stats.resourcesSpent.F}, M:${this.stats.resourcesSpent.M}, K:${this.stats.resourcesSpent.K}, W:${this.stats.resourcesSpent.W}</small>
        </div>
    </div>

    <div style="margin-top:15px;">
        <strong>VPソース配分</strong><br>
        <small>固定VP: ${this.stats.totalVPBySource.static} / 変動VP: ${this.stats.totalVPBySource.variable} / 周回B: ${this.stats.totalVPBySource.tokens}</small>
    </div>

    <div style="margin-top:15px;">
        <strong>建設されたカードとVP貢献 (Top 5)</strong><br>
        <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-top:5px;">
            <tr style="border-bottom:1px solid #eee;"><th>カード名</th><th>回数</th><th>合計VP</th><th>平均VP</th></tr>
            `;

            const sortedCards = Object.values(this.stats.cardsBuilt).sort((a, b) => b.vpContribution - a.vpContribution).slice(0, 5);
            sortedCards.forEach(c => {
                const avg = (c.vpContribution / (c.count || 1)).toFixed(1);
                html += `<tr style="border-bottom:1px solid #eee;"><td>${c.name}</td><td style="text-align:center;">${c.count}</td><td style="text-align:center;">${c.vpContribution}</td><td style="text-align:center;">${avg}</td></tr>`;
            });

            html += `</table></div>
<div style="margin-top:15px; text-align:center;">
    <button id="btn-export-stats" class="btn-secondary" style="width:100%;">📊 統計データをエクスポート (JSON)</button>
</div>
            </div>`;
        }

        summaryDiv.innerHTML = html;
        const resultsModal = document.getElementById('results-modal-overlay');
        if (resultsModal) resultsModal.classList.remove('hidden');

        const btnExport = document.getElementById('btn-export-stats');
        if (btnExport) {
            btnExport.onclick = () => this.exportStats();
        }

        const btnRestart = document.getElementById('btn-restart');
        if (btnRestart) {
            btnRestart.onclick = () => {
                location.reload();
            };
        }

        this.log(`ゲーム終了！勝者: ${winner.name}`, true);
        results.forEach(res => {
            console.log(`${res.name}: ${res.vp} VP`);
        });
        if (this.stats) console.log("Final Game Statistics:", this.stats);
    }

    // VP_FORMULAS は vp_formulas.js で定義（外部ファイル）


    /**
     * 勝利点(VP)計算
     * 建設済みカードのVP、特殊効果VP、周回トークンVPを合算します
     * @param {Object} player プレイヤー
     * @param {boolean} recordStats 統計情報に記録するかどうか
     * @returns {number} 合計VP
     */
    calculateVP(player, recordStats = false) {
        let score = 0;
        const validCards = player.construction.filter(c => c);

        // 1. カード種別カウント（変動VP用）
        const counts = {
            culture: validCards.filter(c => c.type === 'culture').length,
            industry: validCards.filter(c => c.type === 'industry').length,
            politics: validCards.filter(c => c.type === 'politics').length
        };

        const cardScores = [];

        // 2. カード別VP計算
        validCards.forEach(c => {
            let cardScore = 0;

            if (c.vp_logic === 'static') {
                cardScore = c.vp || 0;
                if (recordStats && this.stats) this.stats.totalVPBySource.static += cardScore;
            } else if (c.vp_logic === 'variable') {
                // データ駆動: VP_FORMULASテーブルから関数を取得
                const formula = VP_FORMULAS[c.id];
                if (formula) {
                    cardScore = formula(player, counts);
                } else if (c.vp_formula) {
                    // フォールバック: vp_formula文字列を解析
                    cardScore = this.parseVpFormula(c.vp_formula, player, counts);
                }
                if (recordStats && this.stats) this.stats.totalVPBySource.variable += cardScore;
            }

            score += cardScore;
            if (cardScore > 0) cardScores.push(cardScore);

            if (recordStats && this.stats) {
                if (!this.stats.cardsBuilt[c.id]) {
                    this.stats.cardsBuilt[c.id] = { count: 0, name: c.name_jp, vpContribution: 0 };
                }
                this.stats.cardsBuilt[c.id].vpContribution += cardScore;
                this.stats.cardsBuilt[c.id].count++;
            }
        });

        // 3. W成長ボーナス: 建物とWのペア数 * 3
        const tokens = player.resources.W || 0;
        const buildings = validCards.length;
        const wScore = Math.min(tokens, buildings) * 3;
        score += wScore;

        if (recordStats && this.stats) this.stats.totalVPBySource.round_tokens = wScore;

        return score;
    }

    /**
     * vp_formula文字列解析（フォールバック用）
     * 文字列で定義されたVP計算式をパースして値を返します
     */
    parseVpFormula(formula, player, counts) {
        if (formula.includes('min(culture, industry, politics)') || formula.includes('min(culture,industry,politics)')) {
            return 3 * Math.min(counts.culture, counts.industry, counts.politics);
        }
        if (formula.includes('round_tokens') || formula.includes('count(round_tokens)')) {
            return 2 * (player.resources.W || 0);
        }

        // New syntax: 2 * count(type_cards)
        if (formula.includes('count(culture_cards)')) return 2 * counts.culture;
        if (formula.includes('count(industry_cards)')) return 2 * counts.industry;
        if (formula.includes('count(politics_cards)')) return 2 * counts.politics;

        if (formula.includes('politics')) return 2 * counts.politics;
        if (formula.includes('culture')) return 2 * counts.culture;
        if (formula.includes('industry')) return 2 * counts.industry;
        return 0;
    }


    // --- リセット機能 ---

    /**
     * リセットアクション (C: Reset)
     * 手札を全て捨て、3枚引き直してターン終了
     */
    executeReset(player) {
        if (this.mainActionTaken) {
            console.warn("Reset action blocked: Action already taken");
            this.showToast("すでにアクションを実行済みです", "warning");
            return;
        }
        this.log(`${player.name} はリセットを選択しました。`);

        // 手札を全て捨てる
        while (player.hand.length > 0) {
            const card = player.hand.pop();
            this.discardPile.push(card);
        }

        // 3枚引く
        for (let i = 0; i < 3; i++) {
            if (this.deck.length === 0) this.reshuffleDeck();
            if (this.deck.length > 0) {
                player.hand.push(this.deck.pop());
            }
        }

        this.log(`${player.name} は手札をリフレッシュしました。`);
        this.mainActionTaken = true;

        this.checkPostAction(player);
        this.updateUI();
    }

    /**
     * リセットボタン表示
     */
    showResetButton(player) {
        // 静的ボタン制御 (index.htmlに追加されたボタンを使用)
        const staticBtn = document.getElementById('btn-reset-turn');
        if (staticBtn) {
            const canReset = (this.phase === 'execute' && this.isLocalPlayer(player) && !this.mainActionTaken && !player.isAI);

            if (canReset) {
                staticBtn.disabled = false;
                staticBtn.style.opacity = '1';
                staticBtn.style.cursor = 'pointer';
                staticBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.showConfirmModal("リセットしますか？", "手札を全て捨て、山札から3枚引き直します。このターンは終了となります。", () => {
                        this.executeReset(player);
                    });
                };
            } else {
                staticBtn.disabled = true;
                staticBtn.style.opacity = '0.5';
                staticBtn.style.cursor = 'not-allowed';
            }
            return; // 静的ボタンがあればここで終了
        }

        // 旧実装: dynamicActionsへの動的追加（静的ボタンがない場合のフォールバック）

        // ローカルプレイヤーかつ実行フェーズかつ未アクション時のみ
        if (this.phase !== 'execute' || !this.isLocalPlayer(player) || this.mainActionTaken || player.isAI) return;

        // dynamicActionsに追加するが、重複しないようにする
        if (document.getElementById('btn-reset-turn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.id = 'btn-reset-turn';
        resetBtn.className = 'action-btn reset-btn';
        resetBtn.style.backgroundColor = '#7f8c8d';
        resetBtn.style.color = '#fff';
        resetBtn.style.marginTop = '10px';
        resetBtn.style.width = '100%';
        resetBtn.textContent = '🔄 リセット (手札交換)';

        resetBtn.onclick = (e) => {
            e.stopPropagation();
            this.showConfirmModal("リセットしますか？", "手札を全て捨て、山札から3枚引き直します。このターンは終了となります。", () => {
                this.executeReset(player);
            });
        };

        // dynamicActionsに追加
        if (this.dynamicActions) {
            this.dynamicActions.appendChild(resetBtn);
        }
    }

    // --- UIレンダリング関連 ---

    /**
     * 変換アクションの試行
     * 実行可能かチェックし、確認モーダルを表示して実行します
     * @param {Object} player 実行プレイヤー
     * @param {Object} card 変換効果を持つカード
     */
    tryConversion(player, card) {
        if (player.isAI) return;
        if (this.currentPlayerIndex !== this.players.indexOf(player)) return;
        // アクション解決中はブロック
        if (this.resolvingAction) {
            console.log("Action in progress, conversion blocked.");
            return;
        }

        // "convert_"と"action_"の両方をサポート
        if (card.effect && (card.effect.startsWith('convert_') || card.effect.startsWith('action_'))) {
            if (this.canConvert(player, card)) {

                this.showConfirmModal(`${card.name_jp} の効果を使用しますか？`, `(${this.getConversionLabel(card.effect)})`, () => {
                    this.applyConversionEffect(player, card);
                    this.updateUI();

                    // ステータスに応じてUIを再表示
                    if (this.phase === 'execute') {
                        this.showExecutionActions(player);
                    } else {
                        const hasConv = player.construction.some(c => c.effect && (c.effect.startsWith('convert_') || c.effect.startsWith('action_')));
                        if (hasConv && this.dynamicActions.innerHTML.includes('完了')) {
                            this.showPostActionUI(player);
                        }
                    }
                });
            } else {
                this.showToast("使用できません（コスト不足または回数制限）。", "warning");
            }
        }
    }

    /**
     * 確認モーダルの表示
     * 汎用的なYes/Noモーダルを表示します
     */
    showConfirmModal(title, message, onConfirm) {
        let modal = document.getElementById('confirm-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'confirm-modal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '3000';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px; max-width: 90%; width: 300px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
<h3 style="margin-top:0;">${title}</h3>
<p>${message}</p>
<div style="display:flex; justify-content:space-around; margin-top:20px;">
    <button id="modal-cancel-btn" class="btn-secondary">キャンセル</button>
    <button id="modal-confirm-btn" class="btn-primary">OK</button>
</div>
            </div>
        `;

        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        document.getElementById('modal-cancel-btn').onclick = () => {
            modal.style.display = 'none';
        };

        document.getElementById('modal-confirm-btn').onclick = () => {
            modal.style.display = 'none';
            onConfirm();
        };
    }

    showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'sfx-toast';
        toast.textContent = msg;
        if (type === 'warning') toast.style.backgroundColor = '#f39c12';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    /**
     * UI全体の更新
     * プレイヤーの手札、ボード、リソース、フェーズ表示などを再描画します
     */
    updateUI() {
        // アクションプロンプトを更新（常に実行）
        const actionPrompt = document.getElementById('action-prompt');
        if (actionPrompt && this.players.length > 0) {
            const localPlayer = this.players.find(p => this.isLocalPlayer(p));
            const isMyTurn = localPlayer && this.currentPlayerIndex === localPlayer.id;

            if (this.phase === 'plan') {
                if (localPlayer && !localPlayer.selectedCard) {
                    actionPrompt.textContent = '🃏 カードを選択してください';
                    actionPrompt.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
                } else {
                    actionPrompt.textContent = '⏳ 他のプレイヤーの選択を待っています...';
                    actionPrompt.style.background = 'linear-gradient(135deg, #95a5a6, #7f8c8d)';
                }
            } else if (this.phase === 'execute') {
                if (isMyTurn) {
                    if (this.awaitingMoveTarget) {
                        actionPrompt.textContent = '📍 移動先を選択してください';
                        actionPrompt.style.background = 'linear-gradient(135deg, #e67e22, #d35400)';
                    } else if (localPlayer && localPlayer.selectedCard) {
                        actionPrompt.textContent = '⚡ アクションを選択してください（進む／建てる）';
                        actionPrompt.style.background = 'linear-gradient(135deg, #27ae60, #1e8449)';
                    } else {
                        actionPrompt.textContent = '🎯 あなたの手番です';
                        actionPrompt.style.background = 'linear-gradient(135deg, #27ae60, #1e8449)';
                    }
                } else {
                    const currentPlayer = this.players[this.currentPlayerIndex];
                    const name = currentPlayer ? currentPlayer.name : 'Player';
                    actionPrompt.textContent = `⏳ ${name} の手番です...`;
                    actionPrompt.style.background = 'linear-gradient(135deg, #95a5a6, #7f8c8d)';
                }
            } else {
                actionPrompt.style.display = 'none';
            }
            // 表示を確保
            if (this.phase === 'plan' || this.phase === 'execute') {
                actionPrompt.style.display = 'block';
            }
        }

        // --- Header Info Update ---
        const roundEl = document.getElementById('current-round');
        if (roundEl) roundEl.textContent = this.round;

        const wSupplyEl = document.getElementById('w-supply');
        if (wSupplyEl) {
            wSupplyEl.textContent = this.roundTokens;
        } else {
            console.warn('#w-supply not found');
        }
        // --------------------------

        if (!this.humanArea || !this.opponentsArea) return; // 安全チェック
        this.humanArea.innerHTML = '';
        this.opponentsArea.innerHTML = '';

        this.players.forEach((p, idx) => {
            // P2Pモードでも正しく判定するためisLocalPlayerを使用
            const isLocal = this.isLocalPlayer(p);
            const container = isLocal ? this.humanArea : this.opponentsArea;
            const div = document.createElement('div');

            if (isLocal) {
                div.className = `human-board ${idx === this.currentPlayerIndex && this.phase === 'execute' ? 'active-human' : ''}`;
                div.style.borderLeft = `5px solid ${p.color}`;
            } else {
                div.className = `opponent-board ${idx === this.currentPlayerIndex && this.phase === 'execute' ? 'active-opponent' : ''}`;
                div.style.borderTop = `5px solid ${p.color}`;
            }

            // 手札上限を先に計算（infoBlockで使用）
            let drawExtra = 0;
            const validCardsForLimit = p.construction.filter(c => c);
            validCardsForLimit.forEach(c => {
                if (c.draw_extra) drawExtra += c.draw_extra;
            });
            const handLimit = 3 + drawExtra;

            let handHtml = '';
            p.hand.filter(c => c).forEach((card, cIdx) => {
                const isSel = (p.selectedCard === card);
                // P2Pモードでは相手のカードも裏向きで表示
                if (!isLocal || card.hidden) {
                    handHtml += `<img src="${cardBackImage}" class="card-preview" style="${isSel ? 'border:2px solid red;' : ''}">`;
                } else {
                    handHtml += `<img src="${card.image_src}" class="card-preview ${isSel ? 'selected-card' : ''}" onclick="window.game.selectCardForPlan(window.game.players[${idx}], ${cIdx})">`;
                }
            });

            let infoActionsHtml = '';
            if (isLocal && p.selectedCard) {
                if (this.phase === 'execute') {
                    if (idx === this.currentPlayerIndex) {
                        const card = p.selectedCard;
                        const { canBuild } = this.canBuild(p, card);
                        // player-info内のアクションボタン
                        infoActionsHtml = `
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid #ddd;">
                <div style="font-weight:bold; margin-bottom:5px;">${card.name_jp}</div>
                <div style="display:flex; gap:5px; margin-bottom:5px;">
                    <button class="btn-primary" style="flex:1; padding:5px; font-size:0.9rem;" onclick="window.game.executeMove(window.game.players[${idx}], window.game.players[${idx}].selectedCard)">
                        進む (${card.move})
                    </button>
                    <button class="btn-secondary" style="flex:1; padding:5px; font-size:0.9rem;" ${!canBuild ? 'disabled' : ''} onclick="window.game.executeBuild(window.game.players[${idx}], window.game.players[${idx}].selectedCard)">
                        建てる
                    </button>
                    <button class="action-btn" style="flex:1; padding:5px; font-size:0.9rem; background-color:#e74c3c; color:white; border:none; border-radius:4px; font-weight:bold;" onclick="event.stopPropagation(); window.game.showConfirmModal('リセットしますか？', '手札を全て捨て、山札から3枚引き直します。このターンは終了となります。', () => window.game.executeReset(window.game.players[${idx}]))">
                        リセット
                    </button>
                </div>
                <div style="font-size:0.75rem; color:#666;">コスト: ${this.formatCost(card.cost)}</div>
            </div>
        `;
                    } else {
                        infoActionsHtml = `
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid #ddd;">
                <div style="font-size:0.8rem; color:gray;">待機中... (${p.selectedCard.name_jp})</div>
            </div>
        `;
                    }
                } else if (this.phase === 'plan') {
                    infoActionsHtml = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid #ddd;">
            <div style="font-size:0.8rem; color:#666;">選択中: ${p.selectedCard.name_jp}</div>
        </div>
    `;
                }
            }

            // ----------------------------------------------------------------
            // 変換アクションボタン (Construction Effects)
            let conversionHtml = '';
            // 手番プレイヤーかつ実行フェーズかつメインアクション未実行時
            if (isLocal && idx === this.currentPlayerIndex && this.phase === 'execute' && !this.mainActionTaken) {
                const converters = p.construction.filter(c => c && c.effect && !c.usedThisTurn && c.effect.startsWith('convert_'));
                if (converters.length > 0) {
                    conversionHtml += `
                         <div style="margin-top:10px; border-top:1px dashed #ccc; padding-top:5px;">
                             <div style="font-size:0.75rem; font-weight:bold; color:#666; margin-bottom:4px;">変換スキル</div>
                             <div style="display:flex; flex-wrap:wrap; gap:5px;">
                     `;
                    converters.forEach(c => {
                        const label = this.getConversionLabel(c.effect);
                        const canUse = this.canConvert(p, c);
                        const btnStyle = canUse ?
                            "background:#fafafa; border:1px solid #aaa; border-radius:4px; padding:3px 8px; font-size:0.75rem; cursor:pointer;" :
                            "background:#eee; border:1px solid #ddd; border-radius:4px; padding:3px 8px; font-size:0.75rem; cursor:not-allowed; opacity:0.6;";

                        conversionHtml += `
                             <button style="${btnStyle}" 
                                     ${!canUse ? 'disabled' : ''}
                                     onclick="event.stopPropagation(); window.game.applyConversionEffect(window.game.players[${idx}], window.game.players[${idx}].construction.find(x => x.id === ${c.id})); window.game.updateUI();">
                                 ${c.name_jp} <span style="font-size:0.7em; color:#555;">(${label})</span>
                             </button>
                         `;
                    });
                    conversionHtml += `</div></div>`;
                }
            }
            // ----------------------------------------------------------------

            // プレイヤー色に対応する背景色マップ（infoBlock用）
            const infoBgColors = {
                'white': 'rgba(255, 255, 255, 0.9)',
                'blue': 'rgba(52, 152, 219, 0.2)',
                'black': 'rgba(100, 100, 100, 0.15)',
                'red': 'rgba(231, 76, 60, 0.15)',
                'yellow': 'rgba(241, 196, 15, 0.25)'
            };
            const infoBgColor = infoBgColors[p.color] || 'rgba(255, 255, 255, 0.9)';

            const infoBlock = `
<div class="player-info" style="background: ${infoBgColor};">
    <div class="player-name">
        <span>${p.name} ${this.startPlayerIndex === idx ? '★' : ''}</span>
        <span style="font-size: 0.8rem; opacity: 0.8;">VP: ${this.calculateVP(p)}</span>
    </div>
    <div class="resources">
        <span class="res-tag f" title="Fuel">F: ${p.resources.F}</span>
        <span class="res-tag m" title="Material">M: ${p.resources.M}</span>
        <span class="res-tag k" title="K-Culture">K: ${p.resources.K}</span>
        <span class="res-tag w" title="Wild">W: ${p.resources.W}</span>
        <span style="background:#eee; padding:2px 8px; border-radius:6px; font-size:0.8rem; margin-left:auto;" title="Hand Limit">🃏 ${handLimit}</span>
    </div>
    ${infoActionsHtml}
    ${conversionHtml}
</div>
            `;

            const handBlock = `
<div class="hand-area">
    ${handHtml}
</div>
            `;



            const tableauBlock = `
<div class="tableau">
    <div style="font-size: 0.85em; margin-bottom: 3px;" class="tableau-label">建設済み:</div>
    <div class="tableau-cards">
        ${p.construction.filter(c => c).map(c => {
                // 産出バッジはユーザーの要求で削除

                const isConv = c.effect && c.effect.startsWith('convert_');
                // resolvingActionをチェックしてボタンを無効化
                const canConv = isConv && isLocal && !this.resolvingAction && this.currentPlayerIndex === idx && this.canConvert(p, c.effect);
                const convClass = isConv ? `card-conversion ${canConv ? 'can-convert' : ''}` : '';
                const clickHandler = isConv ? `onclick="window.game.tryConversion(window.game.players[${idx}], window.game.players[${idx}].construction[${p.construction.indexOf(c)}])"` : '';

                return `
                <div class="card-container">
                    <img src="${c.image_src}" class="card-thumb ${convClass}" title="${c.name_jp}" ${clickHandler}>
                </div>
            `;
            }).join('')}
    </div>
</div>
            `;

            div.innerHTML = infoBlock + handBlock + tableauBlock;

            container.appendChild(div);
        });

        const phaseEl = document.getElementById('current-phase');
        if (phaseEl) phaseEl.textContent = this.phase;

        // ボタン管理
        if (this.nextPhaseBtn) {
            const panel = document.getElementById('action-panel');
            if (this.phase === 'plan' || this.phase === 'execute') {
                // 計画と実行中はnextPhaseBtnを非表示（実行中は何もしない）
                this.nextPhaseBtn.style.display = 'none';
                // リセットボタンなどが含まれるため、Executeフェーズではパネルを表示したままにする
                if (panel) {
                    panel.style.display = 'flex';
                }
            } else {
                this.nextPhaseBtn.style.display = '';
                this.nextPhaseBtn.disabled = true;
                this.nextPhaseBtn.textContent = 'フェイズ: ' + this.phase;
                if (panel) panel.style.display = 'flex';

                // 計画フェーズでない場合はクイック確認ボタンを削除
                const existing = document.getElementById('quick-confirm-btn');
                if (existing) existing.remove();
            }
        }

        this.renderMap();


    }

    /**
     * マップの再描画
     * ノード、プレイヤー、資源トークン、ハイライトなどを描画します
     */
    renderMap() {
        this.tokensLayer.innerHTML = '';

        mapNodes.forEach(node => {
            const el = document.createElement('div');
            el.className = 'map-node';
            el.style.left = node.x + '%';
            el.style.top = node.y + '%';
            el.id = `node-${node.id}`;
            el.title = node.name;

            el.onclick = (e) => {
                e.stopPropagation();
                if (this.highlightCallback) this.highlightCallback(node.id);
            };
            this.tokensLayer.appendChild(el);

            // 資源バッジ（ノード固有資源 + 建設産出の表示）
            if (node.resource) {
                const badge = document.createElement('div');
                badge.className = `node-res-badge res-${node.resource.toLowerCase()}`;

                // 有効な資源を決定（ノード + カードボーナス）
                let baseRes = node.resource === 'Card' ? 'C' : node.resource === 'FMK' ? 'F/M/K' : node.resource;
                let resCounts = {};

                // 標準タイプなら基本資源でカウントを初期化
                if (['F', 'M', 'K', 'W'].includes(node.resource)) {
                    resCounts[node.resource] = 1;
                    baseRes = ''; // カウントから再構築
                }

                if (this.phase === 'execute') {
                    const player = this.players[this.currentPlayerIndex];
                    // P2Pモードでは自分の手番のみハイライト表示、ローカルモードでは人間プレイヤーの手番のみ
                    const shouldShowHighlight = this.isP2PMode()
                        ? this.isLocalPlayer(player)
                        : (player && !player.isAI);

                    if (shouldShowHighlight) {
                        // 1. 選択カード移動ボーナス（このノードに移動した場合の獲得資源）
                        if (player.selectedCard && player.selectedCard.move_resource && player.selectedCard.move_resource.length > 0) {
                            const reachable = this.getReachableNodes(player.location, player.selectedCard.move);
                            if (reachable.includes(node.id)) {
                                // move_resourceが複数ある場合、選択肢として扱う（/で表示）
                                if (player.selectedCard.move_resource.length > 1) {
                                    // 特別な「選択」マーカーとして保存
                                    baseRes = (baseRes ? baseRes + '+' : '') + player.selectedCard.move_resource.join('/');
                                } else {
                                    player.selectedCard.move_resource.forEach(r => {
                                        resCounts[r] = (resCounts[r] || 0) + 1;
                                    });
                                }
                            }
                        }

                        // 2. 建設済みカードの産出（このノードの資源でトリガー）
                        if (node.resource && ['F', 'M', 'K'].includes(node.resource)) {
                            player.construction.forEach(c => {
                                if (c.production_condition === node.resource && c.production) {
                                    if (c.production_logic === 'variable') {
                                        const res = c.production_resource || 'W';
                                        // 可変産出ロジック: 現在のステータスに基づいて計算
                                        let count = 0;
                                        const counts = {
                                            culture: player.construction.filter(x => x.type === 'culture').length,
                                            industry: player.construction.filter(x => x.type === 'industry').length,
                                            politics: player.construction.filter(x => x.type === 'politics').length
                                        };
                                        if (c.production_formula && c.production_formula.includes('politics')) count = counts.politics;
                                        else if (c.production_formula && c.production_formula.includes('culture')) count = counts.culture;
                                        else if (c.production_formula && c.production_formula.includes('industry')) count = counts.industry;

                                        if (count > 0) resCounts[res] = (resCounts[res] || 0) + count;
                                    } else {
                                        for (let r in c.production) {
                                            let val = c.production[r] || 1;
                                            resCounts[r] = (resCounts[r] || 0) + val;
                                        }
                                    }
                                }
                            });
                        }
                    }
                }

                let parts = [];
                if (baseRes) parts.push(baseRes);
                for (let r in resCounts) {
                    if (resCounts[r] > 1) parts.push(resCounts[r] + r);
                    else parts.push(r);
                }

                badge.textContent = parts.join('+');

                // バッジスタイル適用
                badge.style.position = 'absolute';
                badge.style.right = '-5px';
                badge.style.top = '-5px';
                badge.style.background = '#fff';
                badge.style.border = '1px solid #333';
                badge.style.borderRadius = '10px';
                badge.style.minWidth = '18px';
                badge.style.padding = '0 4px';
                badge.style.height = '18px';
                badge.style.fontSize = '10px';
                badge.style.display = 'flex';
                badge.style.justifyContent = 'center';
                badge.style.alignItems = 'center';
                badge.style.fontWeight = 'bold';
                badge.style.zIndex = '5';
                badge.style.whiteSpace = 'nowrap';

                // 色分け
                if (node.resource === 'F') badge.style.color = 'var(--color-f)';
                else if (node.resource === 'M') badge.style.color = 'var(--color-m)';
                else if (node.resource === 'K') badge.style.color = 'var(--color-k)';
                else if (node.resource === 'W') badge.style.color = 'var(--color-w)';

                // 混合/追加ならボーダーをハイライト
                let isBoosted = false;
                if (['F', 'M', 'K', 'W'].includes(node.resource)) {
                    if (resCounts[node.resource] > 1) isBoosted = true;
                    for (let r in resCounts) {
                        if (r !== node.resource) isBoosted = true;
                    }
                } else {
                    // 非標準資源（Card/FMK）はどのカウントもブースト
                    if (Object.keys(resCounts).length > 0) isBoosted = true;
                }

                if (isBoosted) {
                    badge.style.background = '#ffffea';
                    badge.style.borderColor = '#f39c12';
                }

                el.appendChild(badge);
            }

            // ノード番号
            const lbl = document.createElement('span');
            lbl.textContent = node.id;
            lbl.style.position = 'absolute';
            lbl.style.left = node.x + '%';
            lbl.style.top = node.y + '%';
            lbl.style.transform = 'translate(-50%, -50%)';
            lbl.style.pointerEvents = 'none';
            this.tokensLayer.appendChild(lbl);
        });

        // Direct Move用の自動ハイライト
        if (this.phase === 'execute') {
            const player = this.players[this.currentPlayerIndex];
            // P2P対応: 自分の手番かつAIでない場合のみハイライト
            if (this.isLocalPlayer(player) && player.selectedCard && !player.isAI) {
                this.highlightReachableNodesForDirectAction(player, player.selectedCard);
            }
        }

        // プレイヤートークンの描画
        this.players.forEach((p, idx) => {
            const node = mapNodes.find(n => n.id === p.location);
            if (node) {
                const stack = this.nodeStacks[p.location] || [];
                const stackIdx = stack.indexOf(p.id);
                const totalInStack = stack.length;

                const token = document.createElement('div');
                token.className = 'player-token';
                token.style.background = p.color;

                let offsetX = 0;
                let offsetY = 0;
                let zIndex = 20;

                if (stackIdx !== -1) {
                    offsetX = (stackIdx - (totalInStack - 1) / 2) * 20;
                    offsetY = -22 - (stackIdx * 4);
                    zIndex = 20 + stackIdx;
                } else {
                    const radius = 50;
                    const angle = (idx / this.playerCount) * Math.PI * 2;
                    offsetX = Math.cos(angle) * radius;
                    offsetY = Math.sin(angle) * radius - 20;
                    zIndex = 25;
                }

                token.style.left = `calc(${node.x}% + ${offsetX}px)`;
                token.style.top = `calc(${node.y}% + ${offsetY}px)`;
                token.style.zIndex = zIndex;

                token.title = `${p.name} ${stackIdx !== -1 ? `(Stack Pos: ${stackIdx})` : '(Initial Pos)'} `;
                this.tokensLayer.appendChild(token);
            }
        });
    }

    /**
     * 統計データのエクスポート
     * 現在の統計情報をJSONファイルとしてダウンロードします
     */
    exportStats() {
        if (!this.stats) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.stats, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `ail_lime_stats_r${this.round}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        this.log("Statistics exported as JSON.");
    }

    /**
     * ノードハイライト処理
     * 指定されたノードIDリストをハイライトし、クリックコールバックを設定します
     * @param {number[]} nodeIds ハイライトするノードIDの配列
     * @param {Function} callback クリック時に呼ばれるコールバック (nodeId) => void
     */
    highlightNodes(nodeIds, callback) {
        // 既存のハイライトを全消去
        document.querySelectorAll('.reachable').forEach(el => {
            el.classList.remove('reachable');
            el.style.zIndex = '';
        });

        this.highlightCallback = (id) => {
            // クリックされたIDがハイライト対象かチェック
            if (!nodeIds.includes(id)) return;

            // ハイライトをクリア
            nodeIds.forEach(nid => {
                const el = document.getElementById(`node-${nid}`);
                if (el) {
                    el.classList.remove('reachable');
                    el.style.zIndex = '';
                }
            });
            this.highlightCallback = null;
            if (callback) callback(id);
        };

        nodeIds.forEach(nid => {
            const el = document.getElementById(`node-${nid}`);
            if (el) {
                el.classList.add('reachable');
                el.style.zIndex = '100'; // 上に表示
            }
        });

        if (nodeIds.length > 0) {
            this.log(`Select destination: <span class="log-highlight">${nodeIds.join(', ')}</span>`);
        }
    }
}

function cardDataByInstance(inst) {
    if (!inst) return null;
    return cardsData.find(c => c.id === inst.id);
}

// ユーザーフィードバック用のグローバルエラーハンドラー
window.onerror = function (msg, url, line, col, error) {
    alert(`Error: ${msg} \nLine: ${line} \nCol: ${col} `);
    console.error(error);
};

// 安全な初期化
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.game = new Game();
        console.log("Game initialized via DOMContentLoaded");
    } catch (e) {
        alert("Critical Error initializing game: " + e.message);
        console.error(e);
    }
});

