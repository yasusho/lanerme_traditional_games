class Game {
    constructor() {
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.roundTokens = 0;
        this.round = 1;
        this.phase = "setup"; // setup, plan, execute, replenish（フェーズ）
        this.startPlayerIndex = 0;
        this.currentPlayerIndex = 0;
        this.playerCount = 5; // デフォルトは5人
        this.turnsPlayedInRound = 0; // 安全のため初期化
        this.simulationMode = false;
        this.turnsPlayedInRound = 0; // 安全のため初期化
        this.simulationMode = false;
        this.simSpeed = 500; // 適度な速度（0.5秒）

        // UI要素
        this.setupModal = document.getElementById('setup-modal-overlay');
        this.gameContainer = document.getElementById('game-container');
        this.mapContainer = document.getElementById('map-container');
        this.tokensLayer = document.getElementById('tokens-layer');
        // this.playersArea は削除済み
        this.humanArea = document.getElementById('human-player-area');
        this.opponentsArea = document.getElementById('opponents-area');
        this.logPanel = document.getElementById('log-area');
        this.nextPhaseBtn = document.getElementById('btn-next-phase');
        this.dynamicActions = document.getElementById('dynamic-actions');

        this.resolvingAction = false;
        this.mainActionTaken = false; // 1ターン1アクション制御用
        this.roundTokens = 30; // デフォルト値、_initGameLogicで設定

        this.initStats();

        this.nextPhaseBtn.addEventListener('click', () => this.advancePhase());

        this.initSetupUI();
    }

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
            cardsBuilt: {}, // id: { count: 0, name: "", vpContribution: 0 }（カード建設記録）
            totalVPBySource: {
                static: 0,
                variable: 0,
                tokens: 0
            },
            roundHistory: [] // ラウンド履歴: { round: N, playerStats: [...] }
        };
    }

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


    initSetupUI() {
        const countBtns = document.querySelectorAll('.count-btn');
        countBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                countBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.playerCount = parseInt(btn.dataset.count);
            });
        });

        document.getElementById('btn-start-normal').addEventListener('click', () => {
            this.simulationMode = false;
            this.startSetup();
        });

        document.getElementById('btn-start-simulation').addEventListener('click', () => {
            this.simulationMode = true;
            this.startSetup();
        });
    }

    startSetup() {
        this.setupModal.classList.add('hidden');
        this.gameContainer.style.display = 'flex';
        this.initializeGame();
    }

    log(msg, highlight = false) {
        const div = document.createElement('div');
        div.className = 'log-entry';

        const phaseSpan = document.createElement('span');
        phaseSpan.className = 'log-phase';
        phaseSpan.textContent = this.phase.toUpperCase();

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-msg' + (highlight ? ' log-highlight' : '');
        msgSpan.innerHTML = msg; // アイコン用にHTMLもサポート

        div.appendChild(phaseSpan);
        div.appendChild(msgSpan);

        if (this.logPanel) {
            this.logPanel.prepend(div);
            // ログ件数制限
            if (this.logPanel.childNodes.length > 50) {
                this.logPanel.removeChild(this.logPanel.lastChild);
            }
        }
        console.log(`[${this.phase}] ${msg}`);
    }

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
                    // エラーでも初期化を試みる
                    this._initGameLogic();
                };
            }
        } else {
            this._initGameLogic();
        }

        // デバッグ: クリックで座標取得
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

    _initGameLogic() {
        if (this.initialized) return;
        this.initialized = true;

        this.log("ゲームロジックを初期化中...");
        this.recordRoundStats(); // 初期状態を記録
        // 1. 資源初期化
        // this.playerCount はセットアップUIで設定済み
        this.roundTokens = this.playerCount * 3;
        this.log(`ラウンドトークン数: ${this.roundTokens}`);

        // 2. プレイヤー初期化
        this.players = []; // 空にする
        const colors = ['white', 'blue', 'black', 'red', 'yellow'];
        const humanIndex = this.simulationMode ? -1 : Math.floor(Math.random() * this.playerCount);

        for (let i = 0; i < this.playerCount; i++) {
            this.players.push({
                id: i,
                name: `Player ${i + 1} ${i === humanIndex ? '(You)' : '(AI)'}`,
                color: colors[i % colors.length],
                location: 1, // スタート地点: ノード01
                hand: [],
                construction: [],
                resources: { F: 0, M: 0, K: 0, W: 0 },
                selectedCard: null, // 計画フェーズ用
                vp: 0,
                isAI: (i !== humanIndex), // humanIndex以外はAI
                aiStrategy: (i !== humanIndex) ? this.getRandomAIStrategy() : null,
                lastAction: null
            });
        }
        this.log(`あなたはプレイヤー ${humanIndex + 1} (${colors[humanIndex]}) です`);

        // 3. デッキ作成
        this.createDeck();
        this.shuffleDeck();

        // 4. 初期手札配布（3枚ずつ）
        this.players.forEach(p => {
            this.drawCards(p, 3);
        });

        // 5. ノードスタック初期化
        this.nodeStacks = {};
        mapNodes.forEach(node => {
            this.nodeStacks[node.id] = [];
        });
        // スタート時はスタックに入れない（相乗り防止）
        // this.nodeStacks[1].push(p.id); ← 削除

        // 6. ゲーム開始
        this.phase = "plan";
        this.updateUI();
        this.log("ゲーム開始！フェイズ: 計画");

        // AIの計画フェーズ実行
        this.checkAIPlan();
    }

    checkAIPlan() {
        if (this.phase !== 'plan') return;

        try {
            // AIは即座にカード選択
            this.players.forEach(p => {
                if (p.isAI && !p.selectedCard) {
                    // スマート選択
                    // ... (existing logic)
                    // 元のロジックが長いので、ここは内容を変えずにエラーハンドリングだけ追加したいのですが
                    // 全体を再記述するのはリスクがあるため、簡略版を挿入するのは避けたい
                    // 実際には元のロジックをここに書く必要があります
                    this._performAISelect(p);
                }
            });
        } catch (e) {
            console.error("AI Plan Error:", e);
            this.log(`AI Error: ${e.message}`, true);
        }

        this.updateUI();
        // ...
    }

    _performAISelect(p) {
        let bestCard = null;
        let maxScore = -Infinity;

        p.hand.forEach(card => {
            const score = this.calculateCardScore(p, card);
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

    advancePhase() {
        if (this.phase === 'plan') {
            // まずAIにカードを選択させる
            this.checkAIPlan();

            // その後で全員選択完了かチェック
            const unselected = this.players.filter(p => p.selectedCard === null);
            if (unselected.length > 0) {
                // 人間がまだ選択していない場合（AIは既に選択済み）
                const names = unselected.map(p => p.name).join(', ');
                if (unselected.some(p => !p.isAI)) {
                    this.log("カードを選択してください", true);
                } else {
                    this.log(`Waiting for AI: ${names}`, true);
                }
                return;
            }
            this.phase = 'execute';
            this.currentPlayerIndex = this.startPlayerIndex;
            this.turnsPlayedInRound = 0;

            // 遷移中の複数クリック防止のため即座にボタン無効化
            if (this.nextPhaseBtn) this.nextPhaseBtn.disabled = true;
            const quickBtn = document.getElementById('quick-confirm-btn');
            if (quickBtn) quickBtn.disabled = true;

            this.startExecuteTurn();
        } else if (this.phase === 'execute') {
            // ステップ別に処理
        }
    }

    calculateCardScore(player, card) {
        let score = 0;
        const { canBuild } = this.canBuild(player, card);

        if (canBuild) {
            score += 1000; // 建設可能なら基本スコア加算

            // VP価値（可変VPカードは概算）
            let vpVal = card.vp || 0;
            if (card.vp_logic === 'variable') vpVal = 2; // 可変は適度なVPとして扱う
            score += vpVal * 20;

            // 産出価値
            if (card.production) score += 50;

            // 効果価値
            if (card.effect) score += 30;

            // コスト要素: 安いほうが良い？高いほうが資源消費に良い？
            // VP/産出の最大化を優先
        } else {
            // 建設不可なら移動カードとしての有用性を優先

            // 移動の柔軟性
            score += (card.move || 0) * 10;
            if (card.move >= 3) score += 20; // 高機動力ボーナス

            // 移動時資源獲得（簡易チェック）
            if (card.move_resource && card.move_resource.length > 0) {
                score += 30;
            }

            // 建設不可で移動0のカードはペナルティ
            if (card.move === 0) score -= 50;

            // --- AI性格ロジック ---
            const strategy = player.aiStrategy || 'Naive';

            // 「カード価値」を計算して保持すべきか判断
            let cardValue = 0;
            if (card.vp >= 2 || (card.vp_logic && card.vp_logic !== 'none')) cardValue += 50;
            if (card.production) cardValue += 30;
            if (card.cost && (card.cost.F + card.cost.M + card.cost.K >= 4)) cardValue += 40; // 高コストカード

            if (strategy === 'Balanced') {
                score -= cardValue * 2; // 良いカードを移動に使うのは中程度のペナルティ
                if (card.move >= 3) score += 10;
            } else if (strategy === 'Hoarder') {
                score -= cardValue * 10; // 極端なペナルティ - 良いカードはほぼ捨てない
            } else if (strategy === 'Rusher') {
                if (card.move >= 3) score += 100; // 巨大なボーナス - 高速移動優先
                // Rusherはカード価値を気にしない
            }
            // Naive: ペナルティなし、元のロジックのまま
        }

        return score;
    }

    createDeck() {
        this.deck = [];
        cardsData.forEach(card => {
            for (let i = 0; i < card.count; i++) {
                this.deck.push({ ...card, instanceId: Math.random().toString(36).substr(2, 9) });
            }
        });
        this.log(`デッキ作成: ${this.deck.length} 枚`);
    }

    getRandomAIStrategy() {
        const strategies = ['Balanced', 'Hoarder', 'Rusher', 'Naive'];
        return strategies[Math.floor(Math.random() * strategies.length)];
    }

    getReachableNodes(startId, steps) {
        if (steps === 0) return [startId];
        let queue = [{ id: startId, path: [startId], dist: 0 }];
        let valid = new Set();
        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur.dist === steps) { valid.add(cur.id); continue; }
            const node = mapNodes.find(n => n.id === cur.id);
            if (node && node.connections) {
                node.connections.forEach(next => {
                    if (!cur.path.includes(next)) {
                        queue.push({ id: next, path: [...cur.path, next], dist: cur.dist + 1 });
                    }
                });
            }
        }
        return valid.size > 0 ? Array.from(valid) : [startId];
    }

    findPath(from, to, steps) {
        if (from === to) return [from];
        let queue = [{ id: from, path: [from] }];
        while (queue.length > 0) {
            const cur = queue.shift();
            if (cur.path.length > steps + 1) continue;
            if (cur.id === to && cur.path.length === steps + 1) return cur.path;
            const node = mapNodes.find(n => n.id === cur.id);
            if (node && node.connections) {
                node.connections.forEach(next => {
                    if (!cur.path.includes(next)) {
                        queue.push({ id: next, path: [...cur.path, next] });
                    }
                });
            }
        }
        return [from];
    }

    checkPathForLoop(path) {
        for (let i = 0; i < path.length - 1; i++) {
            if (path[i] === 10 && path[i + 1] === 1) return true;
        }
        return false;
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    drawCards(player, count) {
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
            player.hand.push(this.deck.pop());
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

            // 遷移中の複数クリック防止のため即座にボタン無効化
            if (this.nextPhaseBtn) this.nextPhaseBtn.disabled = true;
            const quickBtn = document.getElementById('quick-confirm-btn');
            if (quickBtn) quickBtn.disabled = true;

            this.startExecuteTurn();
        } else if (this.phase === 'execute') {
            // ステップ別に処理
        }
    }

    // --- フェーズのロジック ---

    selectCardForPlan(player, cardIndex) {
        // 計画・実行フェーズ両方で人間のターンなら選択可能
        if (player.isAI) return;

        // ルール修正: 実行フェーズ中はカード変更不可
        if (this.phase === 'execute') {
            if (player.selectedCard) {
                this.log("実行フェーズ中はカードを変更できません", true);
                return;
            }
        }

        const card = player.hand[cardIndex];

        // 計画フェーズで既に選択済みのカードをクリックした場合
        if (this.phase === 'plan' && player.selectedCard === card) {
            // 解除せずにフェーズ進行
            this.advancePhase();
            return;
        }

        // 通常の選択/解除トグル
        if (player.selectedCard === card) {
            player.selectedCard = null;
            this.log(`[plan] ${player.name} はカード選択を解除しました。`);
        } else {
            player.selectedCard = card;
            this.log(`[plan] ${player.name} は ${card.name_jp || card.name} を選択しました。`);
        }

        // 選択を表示するためUIを即座に更新
        this.updateUI();

        // 計画フェーズでカード選択時に実行フェーズへ自動進行
        if (this.phase === 'plan' && player.selectedCard) {
            this.advancePhase();
        }
    }

    // ... （省略） ...

    updateUI() {
        if (!this.humanArea || !this.opponentsArea) return; // 安全チェック
        this.humanArea.innerHTML = '';
        this.opponentsArea.innerHTML = '';

        this.players.forEach((p, idx) => {
            const isHuman = !p.isAI;
            const container = isHuman ? this.humanArea : this.opponentsArea;
            const div = document.createElement('div');

            if (isHuman) {
                div.className = `human-board ${idx === this.currentPlayerIndex && this.phase === 'execute' ? 'active-human' : ''}`;
                div.style.borderLeft = `5px solid ${p.color}`;
            } else {
                div.className = `opponent-board ${idx === this.currentPlayerIndex && this.phase === 'execute' ? 'active-opponent' : ''}`;
                div.style.borderTop = `5px solid ${p.color}`;
            }

            let handHtml = '';
            p.hand.filter(c => c).forEach((card, cIdx) => {
                const isSel = (p.selectedCard === card);
                let cardActionHtml = '';

                if (isHuman && isSel) {
                    // このカード専用のアクションブロックを生成
                    if (this.phase === 'execute') {
                        if (idx === this.currentPlayerIndex) {
                            const { canBuild } = this.canBuild(p, card);
                            const moveResDisplay = card.move_resource && card.move_resource.length > 0 ? card.move_resource.join('/') : '-';
                            cardActionHtml = `
                <div class="card-actions-popover" style="margin-bottom:5px; padding:5px; background:#f0f8ff; border:2px solid #bdd7ee; border-radius:8px; width:200px; text-align:center; position:absolute; bottom:100%; left:50%; transform:translateX(-50%); z-index:50; box-shadow:0 4px 10px rgba(0,0,0,0.2);">
                    <div style="font-size:0.8rem; margin-bottom:3px; font-weight:bold;">${card.name_jp}</div>
                    <div style="font-size:0.7rem; margin-bottom:5px;">移動:${card.move} 資源:${moveResDisplay} / コスト:${this.formatCost(card.cost)}</div>
                    <div style="display:flex; gap:3px;">
                        <button class="btn-primary" style="font-size:0.8rem; padding:3px 8px; flex:1;" onclick="event.stopPropagation(); window.game.executeMove(window.game.players[${idx}], window.game.players[${idx}].hand[${cIdx}])">
                            進む
                        </button>
                        <button class="btn-secondary" style="font-size:0.8rem; padding:3px 8px; flex:1;" ${!canBuild ? 'disabled' : ''} onclick="event.stopPropagation(); window.game.executeBuild(window.game.players[${idx}], window.game.players[${idx}].hand[${cIdx}])">
                            建てる
                        </button>
                    </div>
                    <div style="position:absolute; bottom:-6px; left:50%; margin-left:-6px; border-width:6px; border-style:solid; border-color:#bdd7ee transparent transparent transparent;"></div>
                </div>
            `;
                        } else {
                            cardActionHtml = `
                <div class="card-actions-popover" style="margin-bottom:5px; padding:5px; background:#fff0f5; border:2px solid #ffb6c1; border-radius:8px; width:140px; text-align:center; position:absolute; bottom:100%; left:50%; transform:translateX(-50%); z-index:50;">
                    <div style="font-size:0.7rem;">他プレイヤーの手番待ち...</div>
                    <div style="position:absolute; bottom:-6px; left:50%; margin-left:-6px; border-width:6px; border-style:solid; border-color:#ffb6c1 transparent transparent transparent;"></div>
                </div>
            `;
                        }
                    } else if (this.phase === 'plan') {
                        cardActionHtml = `
            <div class="card-actions-popover" style="margin-bottom:5px; padding:5px; background:#e6e6fa; border:2px solid #d8bfd8; border-radius:8px; width:120px; text-align:center; position:absolute; bottom:100%; left:50%; transform:translateX(-50%); z-index:50;">
                <div style="font-size:0.7rem;">選択中</div>
                <div style="position:absolute; bottom:-6px; left:50%; margin-left:-6px; border-width:6px; border-style:solid; border-color:#d8bfd8 transparent transparent transparent;"></div>
            </div>
        `;
                    }
                }

                // ポップオーバー配置用に相対コンテナでラップ
                if (p.isAI) {
                    handHtml += `<div style="position:relative; margin:0 2px;"><img src="${cardBackImage}" class="card-preview" style="${isSel ? 'border:2px solid red;' : ''}"></div>`;
                } else {
                    handHtml += `
        <div style="position:relative; display:flex; flex-direction:column; align-items:center; margin:0 2px;">
            ${cardActionHtml}
            <img src="${card.image_src}" class="card-preview ${isSel ? 'selected-card' : ''}" 
                 onclick="window.game.selectCardForPlan(window.game.players[${idx}], ${cIdx})"
                 style="cursor:pointer; transition: transform 0.2s;">
        </div>
    `;
                }
            });

            // 手札エリアは別のアクションブロック不要
            const handBlock = `
<div class="hand-area" style="display:flex; flex-direction:row; align-items:flex-end; padding-top:60px; overflow-x:visible;">
    ${handHtml}
</div>
            `;

            const tableauBlock = `
<div class="tableau">
    <div style="font-size: 0.9em; margin-bottom: 5px;" class="tableau-label">${isHuman ? 'Tableau' : 'Built'}:</div>
    <div class="tableau-cards">
        ${p.construction.filter(c => c).map(c => `<img src="${c.image_src}" class="card-thumb" title="${c.name_jp}">`).join('')}
    </div>
</div>
            `;

            div.innerHTML = infoBlock + handBlock + tableauBlock;

            container.appendChild(div);
        });
    }

    startExecuteTurn() {
        const p = this.players[this.currentPlayerIndex];
        this.log(`${p.name} の番`);

        // ターンごとの使用フラグをリセット
        p.construction.forEach(c => c.usedThisTurn = false);
        this.mainActionTaken = false; // 新しいターンなのでリセット
        this.highlightCallback = null; // ハイライト状態もリセット

        this.updateUI();

        if (p.isAI) {
            const delay = this.simulationMode ? this.simSpeed : 50;
            setTimeout(() => this.executeAITurn(p), delay);
        } else {
            // dynamicActionsをクリア - ボタンは手札エリアにある
            this.dynamicActions.innerHTML = '';
            const panel = document.getElementById('action-panel');
            if (panel) panel.style.display = 'none';
        }
    }

    executeAITurn(player) {
        const card = player.selectedCard;
        if (!card) { this.endTurn(); return; }

        this.log(`${player.name} が ${card.name_jp} を公開`);
        this.dynamicActions.innerHTML = '';
        const panel = document.getElementById('action-panel');
        if (panel) panel.style.display = 'none';

        if (this.nextPhaseBtn) this.nextPhaseBtn.disabled = true;

        // AIはメインアクション前に変換アクション（フリーアクション）を使用
        this.executeAIConversions(player);

        const { canBuild } = this.canBuild(player, card);

        // 1. スコア最大化のためBUILDを優先
        if (canBuild) {
            this.executeBuild(player, card);
        } else {
            // 2. 戦略的なMOVE
            this.discardPile.push(card);
            this.removeCardFromHand(player, card);
            player.selectedCard = null;

            const steps = card.move;
            if (steps === 0) {
                this.finishMove(player, player.location, card);
                return;
            }

            const reachable = this.getReachableNodes(player.location, steps);
            if (reachable.length === 0) {
                this.finishMove(player, player.location, card);
            } else {
                // 到達可能ノードをスコアリングして最適なターゲットを見つける
                const scoredTargets = reachable.map(targetId => {
                    let score = 0;
                    const nodeData = mapNodes.find(n => n.id === targetId);
                    const path = this.findPath(player.location, targetId, steps);

                    // 優先度A: 周回完了
                    let loopBonus = 50;
                    if (player.aiStrategy === 'Rusher') loopBonus = 150; // Rusherは周回が大好き
                    if (this.checkPathForLoop(path)) {
                        score += loopBonus;
                    }

                    // 優先度B: 必要な資源（+20ポイント）- 将来の建設に役立つ
                    // マスの資源が手札のカードに必要かチェック
                    const needed = new Set();
                    player.hand.forEach(hCard => {
                        if (hCard.cost) {
                            Object.keys(hCard.cost).forEach(res => {
                                // Hoarderは特に高コストカードを見る
                                if (player.aiStrategy === 'Hoarder') {
                                    // 「どれだけ必要」か合計？ここでは汎用的なチェック
                                    if (player.resources[res] < hCard.cost[res]) needed.add(res);
                                } else {
                                    if (player.resources[res] < hCard.cost[res]) {
                                        needed.add(res);
                                    }
                                }
                            });
                        }
                    });

                    let needBonus = 20;
                    if (player.aiStrategy === 'Hoarder') needBonus = 80; // Hoarderは資源を高く評価
                    if (player.aiStrategy === 'Rusher') needBonus = 10; // Rusherはあまり気にしない

                    if (needed.has(nodeData.resource)) {
                        score += needBonus;
                    }

                    // 優先度C: 前進（+1〜+10ポイント）
                    // (TargetIdx - CurrentIdx + 10) % 10 で前進距離を計算
                    const currIdx = parseInt(player.location);
                    const targetIdx = parseInt(targetId);
                    const progress = (targetIdx - currIdx + 10) % 10 || 10;
                    score += progress;

                    return { id: targetId, score };
                });

                // スコア降順でソートして最良を選択
                scoredTargets.sort((a, b) => b.score - a.score);
                const bestTarget = scoredTargets[0].id;

                const passengers = this.getPassengers(player);
                if (passengers.length > 0) {
                    this.log(`${player.name} carries: ${passengers.map(p => p.name).join(', ')}`);
                    passengers.forEach(p => {
                        const nodeData = mapNodes.find(n => n.id === bestTarget);
                        this.gainResource(p, nodeData.resource);
                    });
                }

                const finalPath = this.findPath(player.location, bestTarget, steps);
                if (this.checkPathForLoop(finalPath)) {
                    this.log(`${player.name} passed 10->01! Round Token Get!`);
                    player.roundTokens = (player.roundTokens || 0) + 1;
                    this.roundTokens--;
                }

                this.updateNodeStacks(player, bestTarget, passengers);
                this.finishMove(player, bestTarget, card);
                this.checkGameEnd();
            }
        }
    }

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
                // 修正: 'card'オブジェクトではなく'effect'文字列を渡す
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
                        // 混合セットのシミュレーションを簡略化: 非Wが合計3あると仮定？
                        // ゲームのロジックは複雑（W代替可）
                        // AIシミュレーションでは厳密な要件が安全
                        // 複雑なシミュレーションはスキップ -> 不確実なら使わない
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

    getPassengers(player) {
        const stack = this.nodeStacks[player.location];
        if (!stack) return [];
        const idx = stack.indexOf(player.id);
        if (idx === -1) return [];

        // スタック内で現在のプレイヤーより上のプレイヤーが同乗者
        const passengerIds = stack.slice(idx + 1);
        return this.players.filter(p => passengerIds.includes(p.id));
    }

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

    finishMove(player, targetNodeId, card) {
        // プレイヤーの位置を更新
        player.location = targetNodeId;

        // ノードデータを取得
        const node = mapNodes.find(n => n.id === targetNodeId);

        // 1. カード移動資源
        if (card && card.move_resource && card.move_resource.length > 0) {
            card.move_resource.forEach(r => {
                this.gainResource(player, r, 1, 'card_move');
            });
        }

        // 2. マス資源
        if (node) {
            if (node.resource === 'FMK') {
                // プレイヤーに選ばせる - AIはランダム選択
                if (player.isAI) {
                    const choice = ['F', 'M', 'K'][Math.floor(Math.random() * 3)];
                    this.gainResource(player, choice, 1, 'node');
                } else {
                    // 人間 - 簡略化: 今はランダム選択（UIを表示すべき）
                    const choice = ['F', 'M', 'K'][Math.floor(Math.random() * 3)];
                    this.gainResource(player, choice, 1, 'node');
                    this.log(`ペデ到着！${choice}を獲得！`);
                }
            } else if (node.resource === 'Card') {
                this.drawCards(player, 1);
                this.log(`カードを1枚引きました！`);
            } else if (node.resource) {
                this.gainResource(player, node.resource, 1, 'node');
            }
        }

        // 3. トリガー産出（F/M/Kマスの場合）
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

        // このターンの変換フラグをリセット
        player.construction.forEach(c => c.usedThisTurn = false);

        // UIを更新してターン終了
        this.updateUI();
        this.renderMap();
        this.endTurn();
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
        // 移動確定時にボタンを消す（カード上のポップオーバーも）
        if (!player.isAI) {
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
            // 注意: 同乗者は通常移動ボーナス/トークンを得ない、ただ乗っているだけ
            // 得る場合はここにロジックが必要。アクティブプレイヤーのみ周回チェックをトリガーと仮定
        }

        const path = this.findPath(player.location, targetNodeId, card.move);
        if (this.checkPathForLoop(path)) {
            this.log(`10->01を通過！周回トークン獲得！`);
            this.roundTokens--;
            player.roundTokens = (player.roundTokens || 0) + 1;
            this.checkGameEnd();
        }

        this.updateNodeStacks(player, targetNodeId, passengers);
        this.finishMove(player, targetNodeId, card);
    }

    finishMove(player, nodeId, card) {
        player.location = nodeId;

        // カード移動資源を処理するヘルパー
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

        // マス資源を処理するヘルパー
        const processNodeResource = (callback) => {
            const node = mapNodes.find(n => n.id === nodeId);
            if (node && node.resource) {
                if (node.resource === 'FMK' && !player.isAI) {
                    this.showResourceChoiceModal(player, (choice) => {
                        this.gainResource(player, choice, 1, node.name);
                        callback();
                    });
                    return;
                } else if (node.resource === 'FMK' && player.isAI) {
                    const choice = ['F', 'M', 'K'][Math.floor(Math.random() * 3)];
                    this.gainResource(player, choice, 1, node.name);
                } else {
                    this.gainResource(player, node.resource, 1, node.name);
                }
            }
            callback();
        };

        // 順番に処理: カード資源 → マス資源 → 終了
        processCardMoveResource(() => {
            processNodeResource(() => {
                this.continueFinishMove(player, card);
            });
        });
    }

    continueFinishMove(player, card) {
        this.updateUI();
        this.renderMap();
        // ここで endTurn は呼ばず、ポストアクションチェックへ
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

    canBuild(player, card) {
        // 1. （削除）重複チェック - ユーザーは重複OKと言った

        // 2. コストチェック
        if (this.checkCost(player, card.cost)) {
            return { canBuild: true };
        } else {
            return { canBuild: false, reason: "insufficient_resources" };
        }
    }

    checkCost(player, cost) {
        if (cost.multi === "same3") {
            const maxRaw = Math.max(player.resources.F, player.resources.M, player.resources.K);
            return (maxRaw + player.resources.W >= 3);
        }

        // ワイルド用のグローバル赤字チェック
        let totalDeficit = 0;
        for (let key in cost) {
            if (key === 'multi') continue;
            let required = cost[key];
            let available = (player.resources[key] || 0);
            if (available < required) {
                totalDeficit += (required - available);
            }
        }
        return player.resources.W >= totalDeficit;
    }

    canConvert(player, cardOrEffect) {
        let effect = cardOrEffect;
        let card = null;
        if (typeof cardOrEffect === 'object') {
            effect = cardOrEffect.effect;
            card = cardOrEffect;
        }

        if (card && card.usedThisTurn) return false;

        if (effect === 'convert_same3_to_W') {
            const r = player.resources;
            const w = r.W || 0;
            return ((r.F || 0) + w >= 3) || ((r.M || 0) + w >= 3) || ((r.K || 0) + w >= 3);
        } else if (effect === 'convert_K2_to_W') {
            return ((player.resources.K || 0) + (player.resources.W || 0) >= 2);
        } else if (effect === 'convert_W2_to_W3') {
            // 更新: W >= 2 のみ
            return (player.resources.W || 0) >= 2;
        } else if (effect === 'action_gain_1_choice') {
            return true; // 使用制限は上で処理
        }
        return false;
    }

    getConversionLabel(effect) {
        if (effect === 'convert_same3_to_W') return '同種3 → W';
        if (effect === 'convert_K2_to_W') return 'K2 → W';
        if (effect === 'convert_W2_to_W3') return 'W2+K1 → W3';
        if (effect === 'action_gain_1_choice') return '獲得: F/M/Kの1つ';
        return effect;
    }

    formatCost(cost) {
        if (!cost) return 'なし';
        if (cost.multi === 'same3') return '同種3';
        const parts = [];
        for (const [key, val] of Object.entries(cost)) {
            if (key !== 'multi') parts.push(`${key}${val}`);
        }
        return parts.join(' ') || 'なし';
    }

    // カードに定義された変換効果を適用
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
            const resources = ['F', 'M', 'K'];
            let targetRes = null;
            // 1. 純粋に3を試す
            for (let r of resources) {
                if ((player.resources[r] || 0) >= 3) { targetRes = r; break; }
            }
            // 2. ワイルド併用を試す
            if (!targetRes) {
                for (let r of resources) {
                    if ((player.resources[r] || 0) + (player.resources.W || 0) >= 3) { targetRes = r; break; }
                }
            }

            if (targetRes) {
                // 差し引き
                let paid = 0;
                let currentRes = player.resources[targetRes] || 0;
                let fromRes = Math.min(3, currentRes);
                player.resources[targetRes] = currentRes - fromRes;
                paid += fromRes;

                if (paid < 3) {
                    player.resources.W = (player.resources.W || 0) - (3 - paid);
                }

                player.resources.W = (player.resources.W || 0) + 1;
                this.log(`${player.name} は ${targetRes}など3つ を W に変換しました。`);
            }

        } else if (effect === 'convert_K2_to_W') {
            // K 2を支払う（またはW）
            let paid = 0;
            let currentK = player.resources.K || 0;
            let fromK = Math.min(2, currentK);

            player.resources.K = currentK - fromK;
            paid += fromK;

            if (paid < 2) {
                player.resources.W = (player.resources.W || 0) - (2 - paid);
            }
            this.log(`${player.name} は K2(またはW) を W に変換しました。`);

        } else if (effect === 'convert_W2_to_W3') {
            // W2 -> W3
            if (player.resources.W >= 2) {
                player.resources.W -= 2;
            }
            player.resources.W = (player.resources.W || 0) + 3;
            this.log(`${player.name} は W2 を W3 に変換しました。`);

        } else if (effect === 'action_gain_1_choice') {
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
    }

    payCost(player, cost) {
        for (let key in cost) {
            if (key === 'multi') {
                const types = ['F', 'M', 'K'];
                let paid = false;
                for (let t of types) {
                    if (player.resources[t] >= 3) {
                        player.resources[t] -= 3;
                        paid = true; break;
                    }
                }
                if (paid) return;
                for (let t of types) {
                    if (player.resources[t] + player.resources.W >= 3) {
                        let neededW = 3 - player.resources[t];
                        player.resources[t] = 0;
                        player.resources.W -= neededW;
                        paid = true; break;
                    }
                }
                if (!paid && player.resources.W >= 3) {
                    player.resources.W -= 3;
                    paid = true;
                }
                return;
            }

            let required = cost[key];
            if (player.resources[key] >= required) {
                player.resources[key] -= required;
            } else {
                let avail = player.resources[key];
                player.resources[key] = 0;
                let borrowing = required - avail;
                player.resources.W -= borrowing;
            }
        }
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

        // 支払い選択UI
        const paymentState = { F: 0, M: 0, K: 0, W_as_F: 0, W_as_M: 0, W_as_K: 0 };

        const updatePaymentUI = () => {
            selectorsDiv.querySelectorAll('.pay-count').forEach(span => {
                const res = span.dataset.res;
                span.textContent = paymentState[res] || 0;
            });
            // 合計チェック
            let totalPaid = 0;
            let valid = false;

            if (cost.multi === 'same3') {
                // 同種3のチェック
                for (const r of ['F', 'M', 'K']) {
                    const direct = paymentState[r] || 0;
                    const wild = paymentState[`W_as_${r}`] || 0;
                    if (direct + wild >= 3) {
                        valid = true;
                        break;
                    }
                }
            } else {
                valid = true;
                for (const key in cost) {
                    if (key === 'multi') continue;
                    const required = cost[key];
                    const paid = (paymentState[key] || 0) + (paymentState[`W_as_${key}`] || 0);
                    if (paid < required) {
                        valid = false;
                        break;
                    }
                }
            }
            btnConfirm.disabled = !valid;
        };

        const selectorsDiv = document.createElement('div');
        selectorsDiv.className = 'selectors-grid';

        ['F', 'M', 'K'].forEach(res => {
            const box = document.createElement('div');
            box.className = `pay-box pay-box-${res.toLowerCase()}`;

            const label = document.createElement('div');
            label.className = 'pay-label';
            label.textContent = res;
            box.appendChild(label);

            // 直接支払い
            const directRow = document.createElement('div');
            directRow.className = 'pay-row';
            directRow.innerHTML = `<span class="pay-row-label">直接:</span> <button class="pay-minus" data-res="${res}">−</button> <span class="pay-count" data-res="${res}">0</span> <button class="pay-plus" data-res="${res}">+</button>`;
            box.appendChild(directRow);

            // W代替
            const wildRow = document.createElement('div');
            wildRow.className = 'pay-row';
            wildRow.innerHTML = `<span class="pay-row-label">W代替:</span> <button class="pay-minus" data-res="W_as_${res}">−</button> <span class="pay-count" data-res="W_as_${res}">0</span> <button class="pay-plus" data-res="W_as_${res}">+</button>`;
            box.appendChild(wildRow);

            selectorsDiv.appendChild(box);
        });

        content.appendChild(selectorsDiv);

        // ボタンイベント
        selectorsDiv.querySelectorAll('.pay-plus').forEach(btn => {
            btn.onclick = () => {
                const res = btn.dataset.res;
                const isWild = res.startsWith('W_as_');
                const baseRes = isWild ? res : res;
                const maxAvail = isWild ? (player.resources.W || 0) : (player.resources[res] || 0);
                const currentTotal = isWild
                    ? (paymentState.W_as_F || 0) + (paymentState.W_as_M || 0) + (paymentState.W_as_K || 0)
                    : paymentState[res];
                const maxForThis = isWild ? maxAvail - (currentTotal - (paymentState[res] || 0)) : maxAvail;

                if ((paymentState[res] || 0) < maxForThis) {
                    paymentState[res] = (paymentState[res] || 0) + 1;
                    updatePaymentUI();
                }
            };
        });

        selectorsDiv.querySelectorAll('.pay-minus').forEach(btn => {
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
        // ワイルドで代替した分
        for (const key of ['F', 'M', 'K']) {
            const wildKey = `W_as_${key}`;
            if (paymentPlan[wildKey]) {
                player.resources.W -= paymentPlan[wildKey];
                if (this.stats) this.stats.resourcesSpent[wildKey] += paymentPlan[wildKey];
            }
        }
    }

    // チェーンビルドアクションを表示（人間プレイヤー用）
    showChainBuildActions(player, chainRemaining) {
        // まずUIを更新して古いMove/Buildボタンを消す（selectedCardがnullなので消える）
        this.updateUI();
        // ハイライトとコールバックを確実にクリア
        this.highlightNodes([], null);
        this.highlightCallback = null;

        this.dynamicActions.innerHTML = '';

        const info = document.createElement('div');
        info.innerHTML = `<strong>チェーン建設</strong>: 残り ${chainRemaining} 回`;
        info.style.marginBottom = '10px';
        this.dynamicActions.appendChild(info);

        const buildableCards = player.hand.filter(c => this.canBuild(player, c).canBuild);

        if (buildableCards.length === 0) {
            const msg = document.createElement('div');
            msg.textContent = '建設可能なカードがありません。';
            msg.style.color = '#999';
            this.dynamicActions.appendChild(msg);
        } else {
            buildableCards.forEach(card => {
                const btn = document.createElement('button');
                btn.textContent = `${card.name_jp} (${this.formatCost(card.cost)})`;
                btn.style.display = 'block';
                btn.style.marginTop = '5px';
                btn.style.width = '100%';
                btn.onclick = () => {
                    this.log(`${player.name} continues chain: Building ${card.name_jp}`);
                    this.executeBuild(player, card, chainRemaining - 1);
                };
                this.dynamicActions.appendChild(btn);
            });
        }

        const btnSkip = document.createElement('button');
        btnSkip.textContent = 'チェーンをスキップ';
        btnSkip.className = 'btn-secondary';
        btnSkip.style.marginTop = '15px';
        btnSkip.style.width = '100%';
        btnSkip.onclick = () => {
            this.log(`${player.name} はチェーン建設をスキップしました。`);
            this.checkPostAction(player);
        };
        this.dynamicActions.appendChild(btnSkip);

        // パネルを表示（updateUIで非表示になっている可能性があるため）
        const panel = document.getElementById('action-panel');
        if (panel) panel.style.display = 'block';
    }

    // 移動を実行
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

    executeBuild(player, card, chainRemaining = 0) {
        // 初回建設（チェーン継続でない）ならアクション済みチェック
        if (chainRemaining === 0 && this.mainActionTaken) {
            console.warn("executeBuild: Action already taken this turn");
            return;
        }

        // 移動ハイライトを消去（誤って移動しないように）
        this.highlightNodes([], null);
        this.highlightCallback = null; // 念のため明示的にnull

        // カードが手札にあるか確認（連打防止）
        if (!card || (!player.hand.includes(card) && chainRemaining === 0)) {
            console.warn("executeBuild: Card not in hand or null", card);
            return;
        }

        // ボタン連打/誤操作防止のためアクションボタンを消去
        if (!player.isAI) {
            this.dynamicActions.innerHTML = ''; // 念のため
            document.querySelectorAll('.card-actions-popover').forEach(el => el.style.display = 'none');
        }

        // 初回建設ならアクション済みフラグを立てる
        if (chainRemaining === 0) {
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

    finalizeBuild(player, card, chainRemaining = 0) {
        this.removeCardFromHand(player, card);
        player.selectedCard = null;
        player.construction.push(card);
        player.lastAction = '建設';
        // AIやシミュレーションモードではトースト抑制
        if (!player.isAI && !this.simulationMode) {
            this.playSFX('build');
        }

        // ビルドチェーンを処理
        let newChainRemaining = chainRemaining;
        if (card.chain_build) {
            newChainRemaining += card.chain_build;
        }

        if (newChainRemaining > 0 && player.hand.length > 0) {
            this.log(`${player.name} は残り ${newChainRemaining} 回のチェーン建設が可能です。`);
            if (player.isAI) {
                const delay = this.simulationMode ? this.simSpeed : 50;
                setTimeout(() => this.executeAITurnChain(player, newChainRemaining), delay);
            } else {
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

    gainResource(player, type, amount = 1, source = 'other') {
        if (!type) return;

        // 統計トラッキング
        if (this.stats) {
            if (type === 'FMK') {
                ['F', 'M', 'K'].forEach(r => {
                    this.stats.resourcesGained[r]++;
                    if (this.stats.gainsBySource[source]) this.stats.gainsBySource[source][r]++;
                });
            } else if (this.stats.resourcesGained[type] !== undefined) {
                this.stats.resourcesGained[type] += amount;
                if (this.stats.gainsBySource[source]) this.stats.gainsBySource[source][type] += amount;
            }
        }

        if (type === 'Card') {
            this.drawCards(player, 1);
            this.log(`${player.name} はカードを引きました。`, true);
            return;
        }
        if (type === 'FMK') {
            const pick = ['F', 'M', 'K'][Math.floor(Math.random() * 3)];
            player.resources[pick] = (player.resources[pick] || 0) + 1;
            this.log(`${player.name} は ${pick} を獲得しました (Pede effect)`, true);
            return;
        }

        if (player.resources[type] !== undefined) {
            player.resources[type] += amount;
            this.log(`${player.name} は ${amount} <span class="res-tag ${type.toLowerCase()}">${type}</span> を獲得しました`, true);
        }
    }

    removeCardFromHand(player, card) {
        const idx = player.hand.indexOf(card);
        if (idx > -1) player.hand.splice(idx, 1);
        this.updateUI();
    }

    endTurn() {
        const pCount = this.players.length || this.playerCount;
        // console.log(`[DEBUG] EndTurn: current=${this.currentPlayerIndex}, played=${this.turnsPlayedInRound}, pCount=${pCount}`);
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % pCount;
        this.turnsPlayedInRound++;

        if (this.turnsPlayedInRound >= pCount) {
            // このラウンド中にゲーム終了がトリガーされたかチェック
            if (this.gameEndTriggered) {
                this.endGame();
            } else {
                this.startReplenishPhase();
            }
        } else {
            const delay = this.simulationMode ? 20 : this.simSpeed;
            // console.log(`Waiting ${delay}ms before next turn`);
            setTimeout(() => {
                this.startExecuteTurn();
            }, delay);
        }
    }

    startReplenishPhase() {
        this.turnsPlayedInRound = 0; // 安全のためリセット
        this.log("フェイズ: 補充");
        this.players.forEach(p => p.lastAction = null); // 新ラウンド用にリセット
        this.updateUI();
        this.dynamicActions.innerHTML = '';

        this.players.forEach(p => {
            // 建設済みカードからのdraw_extraボーナスを計算
            let drawExtra = 0;
            p.construction.forEach(c => {
                if (c.draw_extra) drawExtra += c.draw_extra;
            });
            let limit = 3 + drawExtra;
            let need = limit - p.hand.length;
            // デバッグログ
            console.log(`[Replenish] ${p.name}: Hand=${p.hand.length}, Limit=${limit}, Need=${need}`);
            if (need > 0) {
                this.drawCards(p, need);
                // 新しいサイズを確認
                console.log(`[Replenish] -> New Hand=${p.hand.length}`);
            }
        });

        this.startPlayerIndex = (this.startPlayerIndex + 1) % this.playerCount;
        this.log(`スタートプレイヤーは ${this.players[this.startPlayerIndex].name} になりました`);

        // this.drawCards(this.players[this.startPlayerIndex], 1); // 削除: スタートプレイヤーボーナス

        if (this.roundTokens <= 0) {
            this.endGame();
        } else {
            this.recordRoundStats();
            this.round++;
            this.phase = 'plan';
            this.nextPhaseBtn.disabled = false;
            this.log("次のラウンドを開始します...");
            this.updateUI();
            this.checkAIPlan();

            // シミュレーションモードでの自動進行（必要なら）
            // checkAIPlanはその役割をすでに処理、しかしトリガーが必要かも
        }
    }

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

        // VPでソート
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


    // VP計算用のフォーミュラテーブル（データ駆動）
    static VP_FORMULAS = {
        4: (p, c) => (p.resources.M || 0) * c.culture,   // 文化Lv3: M × 文化数
        8: (p, c) => (p.resources.F || 0) * c.industry,  // 産業Lv3: F × 産業数
        15: (p, c) => c.culture,                           // 良き文化: 1 × 文化数
        16: (p, c) => c.industry,                          // 古きを思い: 1 × 産業数
        17: (p, c) => c.politics                           // 政治: 1 × 政治数
    };

    // 周回トークンVPテーブル（インデックス = トークン数）
    static ROUND_TOKEN_VP = [0, 1, 3, 6, 10];

    calculateVP(player, recordStats = false) {
        let score = 0;
        const validCards = player.construction.filter(c => c);

        // 1. カード種別カウント
        const counts = {
            culture: validCards.filter(c => c.type === 'culture').length,
            industry: validCards.filter(c => c.type === 'industry').length,
            politics: validCards.filter(c => c.type === 'politics').length
        };

        // 2. カード別VP計算
        validCards.forEach(c => {
            let cardScore = 0;

            if (c.vp_logic === 'static') {
                cardScore = c.vp || 0;
                if (recordStats && this.stats) this.stats.totalVPBySource.static += cardScore;
            } else if (c.vp_logic === 'variable') {
                // データ駆動: VP_FORMULASテーブルから関数を取得
                const formula = Game.VP_FORMULAS[c.id];
                if (formula) {
                    cardScore = formula(player, counts);
                } else if (c.vp_formula) {
                    // フォールバック: vp_formula文字列を解析
                    cardScore = this.parseVpFormula(c.vp_formula, player, counts);
                }
                if (recordStats && this.stats) this.stats.totalVPBySource.variable += cardScore;
            }

            score += cardScore;

            if (recordStats && this.stats) {
                if (!this.stats.cardsBuilt[c.id]) {
                    this.stats.cardsBuilt[c.id] = { count: 0, name: c.name_jp, vpContribution: 0 };
                }
                this.stats.cardsBuilt[c.id].vpContribution += cardScore;
                this.stats.cardsBuilt[c.id].count++;
            }
        });

        // 3. 周回トークンVP（テーブルルックアップ）
        const tokens = player.roundTokens || 0;
        const tokenVp = tokens < 5
            ? Game.ROUND_TOKEN_VP[tokens]
            : tokens * 3;

        score += tokenVp;
        if (recordStats && this.stats) this.stats.totalVPBySource.round_tokens = tokenVp;

        return score;
    }

    // vp_formula文字列を解析するヘルパー（フォールバック用）
    parseVpFormula(formula, player, counts) {
        if (formula.includes('min(culture, industry, politics)')) {
            return 2 * Math.min(counts.culture, counts.industry, counts.politics);
        }
        if (formula.includes('round_tokens')) {
            return 2 * (player.roundTokens || 0);
        }
        if (formula.includes('politics')) return counts.politics;
        if (formula.includes('culture')) return counts.culture;
        if (formula.includes('industry')) return counts.industry;
        return 0;
    }

    // --- UIレンダリング ---

    tryConversion(player, card) {
        if (player.isAI) return;
        if (this.currentPlayerIndex !== this.players.indexOf(player)) return;
        if (this.resolvingAction) {
            console.log("Action in progress, conversion blocked.");
            return;
        }

        // "convert_"と"action_"の両方をサポート
        if (card.effect && (card.effect.startsWith('convert_') || card.effect.startsWith('action_'))) {
            if (this.canConvert(player, card)) {

                this.showConfirmModal(`${card.name_jp} の効果を使用しますか？`, `(${this.getConversionLabel(card.effect)})`, () => {
                    this.applyConversionEffect(player, card);
                    this.playSFX('convert');
                    this.updateUI();

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

    showConfirmModal(title, message, onConfirm) {
        // モーダルを再利用または作成
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

    playSFX(type) {
        // 削除: フラッシュ効果（ユーザーが削除を要求）

        // トーストメッセージ（'move'はスキップ -> サウンドのみ）
        if (type !== 'move') {
            const toast = document.createElement('div');
            toast.className = 'sfx-toast';
            let msg = "ACTION!";
            if (type === 'convert') msg = "CONVERSION!";
            if (type === 'build') msg = "BUILD!";
            toast.textContent = msg;

            // トーストの色分け
            if (type === 'build') toast.style.backgroundColor = 'rgba(231, 76, 60, 0.9)'; // 赤

            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 1000);
        }

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                const now = ctx.currentTime;
                if (type === 'convert') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
                } else if (type === 'build') {
                    // 建設音　クラングまたはコード
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(220, now);
                    osc.frequency.linearRampToValueAtTime(440, now + 0.1);
                    // 単一のoscでは不可能だが2次高調波を追加して豊かさを出す、簡単にしておく
                } else if (type === 'move') {
                    // クイックスウォッシュ
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.linearRampToValueAtTime(300, now + 0.1);
                } else {
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(440, now);
                }

                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + (type === 'move' ? 0.15 : 0.2));

                osc.start();
                osc.stop(now + 0.2);
            }
        } catch (e) { }
    }

    updateUI() {
        if (!this.humanArea || !this.opponentsArea) return; // 安全チェック
        this.humanArea.innerHTML = '';
        this.opponentsArea.innerHTML = '';

        this.players.forEach((p, idx) => {
            const isHuman = !p.isAI;
            const container = isHuman ? this.humanArea : this.opponentsArea;
            const div = document.createElement('div');

            if (isHuman) {
                div.className = `human-board ${idx === this.currentPlayerIndex && this.phase === 'execute' ? 'active-human' : ''}`;
                div.style.borderLeft = `5px solid ${p.color}`;
            } else {
                div.className = `opponent-board ${idx === this.currentPlayerIndex && this.phase === 'execute' ? 'active-opponent' : ''}`;
                div.style.borderTop = `5px solid ${p.color}`;
            }

            let handHtml = '';
            p.hand.filter(c => c).forEach((card, cIdx) => {
                const isSel = (p.selectedCard === card);
                if (p.isAI) {
                    handHtml += `<img src="${cardBackImage}" class="card-preview" style="${isSel ? 'border:2px solid red;' : ''}">`;
                } else {
                    handHtml += `<img src="${card.image_src}" class="card-preview ${isSel ? 'selected-card' : ''}" onclick="window.game.selectCardForPlan(window.game.players[${idx}], ${cIdx})">`;
                }
            });

            let infoActionsHtml = '';
            if (isHuman && p.selectedCard) {
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

            const infoBlock = `
<div class="player-info">
    <div class="player-name">
        <span>${p.name} ${this.startPlayerIndex === idx ? '★' : ''}</span>
        <span style="font-size: 0.8rem; opacity: 0.8;">VP: ${this.calculateVP(p)}</span>
    </div>
    <div class="resources">
        <span class="res-tag f" title="Fuel">F: ${p.resources.F}</span>
        <span class="res-tag m" title="Material">M: ${p.resources.M}</span>
        <span class="res-tag k" title="K-Culture">K: ${p.resources.K}</span>
        <span class="res-tag w" title="Wild">W: ${p.resources.W}</span>
        <span class="res-tag rt" title="Round Tokens">RT: ${p.roundTokens || 0}</span>
    </div>
    ${infoActionsHtml}
</div>
            `;

            const handBlock = `
<div class="hand-area">
    ${handHtml}
</div>
            `;

            // 手札上限を計算
            let drawExtra = 0;
            const validCards = p.construction.filter(c => c);

            validCards.forEach(c => {
                if (c.draw_extra) drawExtra += c.draw_extra;
            });
            const handLimit = 3 + drawExtra;

            // タブローの力を計算（合計潜在産出）
            const power = { F: 0, M: 0, K: 0, W: 0 };
            const counts = {
                culture: validCards.filter(c => c.type === 'culture').length,
                industry: validCards.filter(c => c.type === 'industry').length,
                politics: validCards.filter(c => c.type === 'politics').length
            };
            // 削除: 憲法ブースト（VPのみに）

            validCards.forEach(c => {
                if (c.production) {
                    if (c.production_logic === 'variable') {
                        let amt = 0;
                        if (c.id === 12 || c.production_formula.includes('politics')) amt = counts.politics;
                        else if (c.production_formula.includes('culture')) amt = counts.culture;
                        else if (c.production_formula.includes('industry')) amt = counts.industry;

                        const res = c.production_resource || 'W';
                        power[res] = (power[res] || 0) + amt;
                    } else {
                        for (let r in c.production) {
                            power[r] = (power[r] || 0) + c.production[r];
                        }
                    }
                }
            });

            const powerStr =
                `<span class="res-tag f" style="padding:2px 6px; font-size:0.8em;">F:${power.F}</span> ` +
                `<span class="res-tag m" style="padding:2px 6px; font-size:0.8em;">M:${power.M}</span> ` +
                `<span class="res-tag k" style="padding:2px 6px; font-size:0.8em;">K:${power.K}</span>` +
                (power.W ? ` <span class="res-tag w" style="padding:2px 6px; font-size:0.8em;">W:${power.W}</span>` : '');

            const tableauBlock = `
<div class="tableau">
    <div style="font-size: 0.85em; margin-bottom: 5px; display:flex; justify-content:space-between; align-items:center; background:#eee; padding:4px 8px; border-radius:4px;" class="tableau-label">
        <span><strong>Limit:</strong> ${handLimit}</span>
        <span title="Total Production Power" style="display:flex; gap:3px;"><strong>Prod:</strong> ${powerStr}</span>
    </div>
    <div class="tableau-cards">
        ${p.construction.filter(c => c).map(c => {
                // 産出バッジはユーザーの要求で削除

                const isConv = c.effect && c.effect.startsWith('convert_');
                // resolvingActionをチェックしてボタンを無効化
                const canConv = isConv && isHuman && !this.resolvingAction && this.currentPlayerIndex === idx && this.canConvert(p, c.effect);
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

        const roundEl = document.getElementById('current-round');
        if (roundEl) roundEl.textContent = this.round;
        const phaseEl = document.getElementById('current-phase');
        if (phaseEl) phaseEl.textContent = this.phase;

        const rtHeaderEl = document.getElementById('remaining-rt');
        if (rtHeaderEl) rtHeaderEl.textContent = this.roundTokens;

        // ボタン管理
        if (this.nextPhaseBtn) {
            const panel = document.getElementById('action-panel');
            if (this.phase === 'plan' || this.phase === 'execute') {
                // 計画と実行中はnextPhaseBtnを非表示（実行中は何もしない）
                this.nextPhaseBtn.style.display = 'none';
                if (panel && this.dynamicActions.innerHTML.trim() === '') {
                    panel.style.display = 'none';
                }
            } else {
                this.nextPhaseBtn.style.display = '';
                this.nextPhaseBtn.disabled = true;
                this.nextPhaseBtn.textContent = 'フェイズ: ' + this.phase;
                if (panel) panel.style.display = 'block';

                // 計画フェーズでない場合はクイック確認ボタンを削除
                const existing = document.getElementById('quick-confirm-btn');
                if (existing) existing.remove();
            }
        }

        this.renderMap();
    }

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

            // 資源バッジ
            if (node.resource) {
                const badge = document.createElement('div');
                badge.className = `node-res-badge res-${node.resource.toLowerCase()}`;
                // 有効な資源を決定（ノード + カードボーナス）
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
                    if (player && !player.isAI) {
                        // 1. 選択カード移動ボーナス
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
                                        // 可変産出は複雑かも（例: 0か5）
                                        // 表示の簡素化のため、+1として扱う？
                                        // または実際に再計算？再計算を試す
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
                                        // countが0なら何か表示する？たぶんしない
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
                // スタイルはCSSで処理
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
            if (!player.isAI && player.selectedCard) {
                this.highlightReachableNodesForDirectAction(player, player.selectedCard);
            }
        }

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

