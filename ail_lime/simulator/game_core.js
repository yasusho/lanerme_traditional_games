/**
 * AIL LIME - ゲームコアロジック
 * game.js と batch_simulation.html で共有されるゲームルール
 * UI非依存の純粋なゲームロジックのみを含む
 */

const GameCore = {
    /**
     * コスト支払い可能性判定
     * ワイルドカード(W)を含めて資源が足りているかチェック
     */
    checkCost(playerResources, cost, isConstruction = false) {
        if (!cost) return true;

        // 建設の場合、W1個が「手数料」として確保されるため、支払いに使えるWが1減る
        let constructionFee = isConstruction ? 1 : 0;
        let wAvailable = (playerResources.W || 0) - constructionFee;

        if (wAvailable < 0) return false; // そもそも足りない

        if (cost.multi === "same3") {
            const maxRaw = Math.max(
                playerResources.F || 0,
                playerResources.M || 0,
                playerResources.K || 0
            );
            return (maxRaw + wAvailable >= 3);
        }
        if (cost.multi === "same4") {
            const maxRaw = Math.max(
                playerResources.F || 0,
                playerResources.M || 0,
                playerResources.K || 0
            );
            return (maxRaw + wAvailable >= 4);
        }

        // W自体が直接コストとして要求されている場合
        let wRequired = cost.W || 0;

        if (wAvailable < wRequired) return false;

        // 残りのWを使って、他資源の不足分を補えるかチェック
        let wRemaining = wAvailable - wRequired;
        let totalDeficit = 0;

        for (let key in cost) {
            if (key === 'multi' || key === 'W') continue;
            let required = cost[key];
            let available = (playerResources[key] || 0);
            if (available < required) {
                totalDeficit += (required - available);
            }
        }

        return wRemaining >= totalDeficit;
    },

    /**
     * 建設可能性チェック
     */
    canBuild(playerResources, card) {
        if (!card || !card.cost) return { canBuild: false, reason: "no_card_or_cost" };

        // 【新ルール】建設にはWトークンが1つ必須（コストとは別）
        // つまり、少なくともWが1個必要で、それは建設手数料として消える。
        // コスト充当に使えるWは (所持数 - 1) 個になる。
        if ((playerResources.W || 0) < 1) {
            return { canBuild: false, reason: "needs_w_token" };
        }

        if (this.checkCost(playerResources, card.cost, true)) { // true = isConstruction (deduct 1 W fee)
            return { canBuild: true };
        } else {
            return { canBuild: false, reason: "insufficient_resources" };
        }
    },

    /**
     * コスト支払い実行
     * @returns {boolean} 支払い成功ならtrue
     */
    payCost(playerResources, cost) {
        // canBuild(checkCost)は呼び出し元で済んでいる前提だが、念のため
        // ただしここでは手数料込みでのチェックはできない（引数がないため）。
        // 呼び出し元の責任とする。

        // 建設手数料の支払い (W-1)
        if ((playerResources.W || 0) > 0) {
            playerResources.W--;
        } else {
            console.error("Construction Fee payment failed in payCost: No W token.");
            return false;
        }

        if (!cost) return true;

        if (cost.multi === "same3" || cost.multi === "same4") {
            const amount = (cost.multi === "same3") ? 3 : 4;
            // 最も多い資源から支払う
            const types = ['F', 'M', 'K'];
            let sorted = types.sort((a, b) => (playerResources[b] || 0) - (playerResources[a] || 0));
            let remaining = amount;

            for (let t of sorted) {
                if (remaining <= 0) break;
                const available = playerResources[t] || 0;
                const take = Math.min(available, remaining);
                playerResources[t] -= take;
                remaining -= take;
            }
            // 足りない場合はWで支払う
            if (remaining > 0) {
                playerResources.W = (playerResources.W || 0) - remaining;
            }
            return true;
        }

        // 通常コスト支払い
        let wUsed = 0;
        for (let key in cost) {
            if (key === 'multi' || key === 'W') continue;
            let required = cost[key];
            let available = (playerResources[key] || 0);
            if (available >= required) {
                playerResources[key] -= required;
            } else {
                playerResources[key] = 0;
                wUsed += (required - available);
            }
        }
        // Wを直接支払い
        if (cost.W) wUsed += cost.W;
        playerResources.W = (playerResources.W || 0) - wUsed;

        return true;
    },

    /**
     * 経路が周回（10 -> 01）を含むか判定
     */
    checkPathForLoop(path) {
        if (!path || path.length < 2) return false;
        for (let i = 0; i < path.length - 1; i++) {
            if (path[i] === 10 && path[i + 1] === 1) return true;
        }
        return false;
    },

    /**
     * 指定歩数で到達可能な全ノードIDを取得
     * @param {Array} mapNodesData マップノードデータ
     * @param {number} startId 開始ノードID
     * @param {number} steps 移動歩数
     * @returns {Array<number>} 到達可能なノードIDの配列
     */
    getReachableNodes(mapNodesData, startId, steps) {
        if (steps <= 0) return [startId];

        const visited = new Set();
        let currentLevel = [{ id: startId, path: [startId] }];
        let results = [];

        for (let step = 1; step <= steps; step++) {
            const nextLevel = [];
            for (let { id: cur, path } of currentLevel) {
                const node = mapNodesData.find(n => n.id === cur);
                if (!node || !node.connections) continue;

                for (let neighbor of node.connections) {
                    // 行き止まり（接続先1つ）でなければ、折り返し禁止
                    const neighborNode = mapNodesData.find(n => n.id === neighbor);
                    const isDeadEnd = neighborNode && neighborNode.connections && neighborNode.connections.length === 1;

                    // パス内で既に訪れていたら、行き止まり以外スキップ
                    if (path.includes(neighbor) && !isDeadEnd) continue;

                    const newPath = [...path, neighbor];
                    if (step === steps) {
                        results.push(neighbor);
                    } else {
                        nextLevel.push({ id: neighbor, path: newPath });
                    }
                }
            }
            currentLevel = nextLevel;
        }

        return [...new Set(results)];
    },

    /**
     * 最短経路探索（幅優先探索）
     * @param {Array} mapNodesData マップノードデータ
     * @param {number} from 開始ノードID
     * @param {number} to 目標ノードID
     * @param {number} steps 正確な歩数
     * @returns {Array<number>} 経路（ノードID配列）
     */
    findPath(mapNodesData, from, to, steps) {
        if (from === to && steps === 0) return [from];
        if (steps <= 0) return [from];

        const queue = [{ id: from, path: [from] }];

        while (queue.length > 0) {
            const { id: cur, path } = queue.shift();

            if (path.length - 1 === steps) {
                if (cur === to) return path;
                continue;
            }

            const node = mapNodesData.find(n => n.id === cur);
            if (!node || !node.connections) continue;

            for (let neighbor of node.connections) {
                const neighborNode = mapNodesData.find(n => n.id === neighbor);
                const isDeadEnd = neighborNode && neighborNode.connections && neighborNode.connections.length === 1;

                if (path.includes(neighbor) && !isDeadEnd) continue;

                queue.push({ id: neighbor, path: [...path, neighbor] });
            }
        }

        return [from]; // 経路が見つからない場合
    },

    /**
     * 変換効果の可否チェック
     */
    canConvert(playerResources, effectType) {
        switch (effectType) {
            case 'convert_same3_to_W':
                return (playerResources.F >= 3 || playerResources.M >= 3 || playerResources.K >= 3);
            case 'convert_K2_to_W':
                return (playerResources.K || 0) >= 2; // Simplify: pure K check for AI safety
            case 'convert_W2_to_W3':
                return (playerResources.W || 0) >= 2;
            case 'convert_W2_to_FMK':
                return (playerResources.W || 0) >= 2;
            default:
                return false;
        }
    },

    /**
     * AI戦略リスト
     */
    AI_STRATEGIES: ['Builder', 'Looper', 'Balanced'],

    /**
     * ランダムなAI戦略を取得
     */
    getRandomAIStrategy() {
        return this.AI_STRATEGIES[Math.floor(Math.random() * this.AI_STRATEGIES.length)];
    },

    /**
     * VP計算（ゲーム終了時）
     */
    calculateVP(player, allPlayers = []) {
        let vp = 0;

        // 1. 建物点
        player.construction.forEach(card => {
            let s = 0;
            if (card.vp_logic === 'static' || !card.vp_logic) {
                s = (card.vp || 0);
            } else if (card.vp_logic === 'variable') {
                const counts = {
                    culture: player.construction.filter(c => c.type === 'culture').length,
                    industry: player.construction.filter(c => c.type === 'industry').length,
                    politics: player.construction.filter(c => c.type === 'politics').length
                };
                if (card.id === 15) s = counts.culture * 2;
                else if (card.id === 16) s = counts.industry * 2;
                else if (card.id === 17) s = counts.politics * 2;
                else if (card.id === 18) s = (player.resources.W || 0) * 2;
                else if (card.id === 19) s = Math.min(counts.culture, counts.industry, counts.politics) * 3;
            }
            vp += s;
        });

        // 2. W成長ボーナス: 建物とWのペア数 * 3
        const buildingCount = player.construction.length;
        const wCount = player.resources.W || 0;
        const pairs = Math.min(buildingCount, wCount);
        vp += pairs * 3;

        return {
            total: vp,
            breakdown: {
                card: vp - pairs * 3, // 単純化のため
                loop: pairs * 3
            }
        };
    }
};

// Node.js環境でのexport対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameCore;
}
