const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
    console.error("Usage: node analyze_sim.js <json_path>");
    process.exit(1);
}

const rawData = fs.readFileSync(filePath, 'utf-8');
const rootData = JSON.parse(rawData);
const results = Array.isArray(rootData) ? rootData : rootData.games;

console.log("First game sample:", JSON.stringify(results[0], null, 2));

console.log(`Analyzing ${results.length} games...`);

const strategyStats = {};
let totalRounds = 0;

const cardStats = {};
const startPlayerStats = {}; // Tracks wins by initial player/turn order (Seat 1-4)
const nodeStrengthStats = {};

const nodeNames = {
    1: "マカティ", 2: "クワケ", 3: "クケカ", 4: "イッキャウ", 5: "タウポ",
    6: "シェプ・オキヤウ", 7: "パシルシャリヤ", 8: "クティヤ", 9: "ナナラ", 10: "イヌシ",
    11: "スプケベス", 12: "アタラム", 13: "アイキト", 14: "ペデ"
};

results.forEach(game => {
    totalRounds += game.totalRounds;

    // Find winner
    const maxVP = Math.max(...game.players.map(p => p.vp));
    // Seat order is implicit in 'players' array? 
    // Usually players are checked in order 0,1,2,3?
    // Let's assume players[0] is Seat 1.
    // However, start player rotates. But initial advantage usually given to Seat 1.
    // Or we can track absolute turn order?
    // In game.js, players are init with ID 0..3.
    // Let's track by Player ID (Seat position).

    // Card Analysis
    game.players.forEach(p => {
        const isWinner = (p.vp === maxVP);

        // Seat Win Rate
        if (!startPlayerStats[p.id]) startPlayerStats[p.id] = { games: 0, wins: 0 };
        startPlayerStats[p.id].games++;
        if (isWinner) startPlayerStats[p.id].wins++;

        // Built Cards
        if (p.builtCards) {
            p.builtCards.forEach(c => {
                if (!cardStats[c.name]) cardStats[c.name] = { builtC: 0, winC: 0, roundSum: 0 };
                cardStats[c.name].builtC++;
                cardStats[c.name].roundSum += c.round;
                if (isWinner) cardStats[c.name].winC++;
            });
        }
    });

    // Previous strategy logic...
    game.players.forEach(p => {
        const strat = p.aiStrategy || 'Unknown';
        if (!strategyStats[strat]) {
            strategyStats[strat] = {
                games: 0,
                wins: 0,
                totalVP: 0,
                minVP: Infinity,
                maxVP: -Infinity,
                handSize: 0,
                construction: 0,
                totalW: 0,
                totalWVP: 0
            };
        }

        const s = strategyStats[strat];
        s.games++;
        s.totalVP += p.vp;
        s.totalW += (p.roundTokens || 0);

        // Calculate W VP (Simplified reproduction of game logic)
        const rt = p.roundTokens || 0;
        let wVP = 0;
        if (rt === 1) wVP = 1;
        else if (rt === 2) wVP = 2;
        else if (rt > 2) wVP = (rt - 1) * 2;

        s.totalWVP += wVP;
        if (p.vp < s.minVP) s.minVP = p.vp;
        if (p.vp > s.maxVP) s.maxVP = p.vp;
        s.handSize += p.handSize || 0;
        s.construction += (p.builtCount || 0);

        if (p.vp === maxVP) s.wins++;
    });

    // Node Stats Analysis
    if (game.nodeStats) {
        for (const [id, s] of Object.entries(game.nodeStats)) {
            if (!nodeStrengthStats[id]) {
                nodeStrengthStats[id] = { visits: 0, resGained: 0, prodGained: 0, cardsGained: 0 };
            }
            nodeStrengthStats[id].visits += s.visits;
            nodeStrengthStats[id].resGained += s.resGained;
            nodeStrengthStats[id].prodGained += s.prodGained;
            nodeStrengthStats[id].cardsGained += s.cardsGained;
        }
    }
});
// Output
console.log("\n=== Turn Order Advantage (Seat Position) ===");
console.log("| Seat | Win Rate |");
console.log("|---|---|");
Object.keys(startPlayerStats).sort((a, b) => a - b).forEach(id => {
    const s = startPlayerStats[id];
    console.log(`| Seat ${parseInt(id) + 1} | ${((s.wins / s.games) * 100).toFixed(1)}% |`);
});

console.log("\n=== Card Strength & Timing (Top 15 by Win Rate) ===");
console.log("| Card Name | Win Rate | Avg Build Round | Usage Freq |");
console.log("|---|---|---|---|");

const cardList = Object.entries(cardStats).map(([name, s]) => ({
    name,
    winRate: s.winC / s.builtC,
    avgRound: s.roundSum / s.builtC,
    usage: s.builtC
}));

cardList.sort((a, b) => b.winRate - a.winRate);

cardList.slice(0, 15).forEach(c => {
    console.log(`| ${c.name.padEnd(20)} | ${(c.winRate * 100).toFixed(1)}% | ${c.avgRound.toFixed(1)} | ${c.usage} |`);
});

console.log("\n=== Card Strength & Timing (Bottom 5 by Win Rate) ===");
cardList.slice(-5).forEach(c => {
    console.log(`| ${c.name.padEnd(20)} | ${(c.winRate * 100).toFixed(1)}% | ${c.avgRound.toFixed(1)} | ${c.usage} |`);
});
console.log("\n=== Simulation Results Analysis ===");
console.log(`Total Games: ${results.length}`);
console.log(`Average Rounds: ${(totalRounds / results.length).toFixed(2)}`);

console.log("\n=== Strategy Performance ===");
// Table header
console.log(`| Strategy | Win Rate | Avg VP | Avg W | Avg W-VP | Min/Max |`);
console.log(`|---|---|---|---|---|---|`);

for (const [strat, stats] of Object.entries(strategyStats)) {
    const winRate = ((stats.wins / stats.games) * 100).toFixed(1) + '%';
    const avgVP = (stats.totalVP / stats.games).toFixed(2);
    const avgW = (stats.totalW / stats.games).toFixed(2);
    const avgWVP = (stats.totalWVP / stats.games).toFixed(2);
    const avgBuilt = (stats.construction / stats.games).toFixed(1);

    // Note: Win rate calculation here is "Percentage of games participated in that ended in a win".
    // Since games might have multiple AI of same strategy, "games" count is actually "player-slots".
    // So "Win Rate" is: (Wins / Player-Slots) * PlayerCount? 
    // No, simpler: "Win Share".
    // But easiest metric is: (Total Wins by Strat) / (Total Games) ??
    // No, if there are 2 Balanced AIs in a game, they both contribute to 'games'.

    // Let's stick to per-slot stats.
    // "Win %": probability that a slot with this strategy wins.

    console.log(`| ${strat.padEnd(10)} | ${winRate.padStart(8)} | ${avgVP.padStart(6)} | ${avgW.padStart(5)} | ${avgWVP.padStart(8)} | ${stats.minVP}/${stats.maxVP} |`);
}

console.log("\n=== Map Node Strength (Performance) ===");
console.log("| Node | Visits | Res Yield | Prod Boost | Card Yield | Score |");
console.log("|---|---|---|---|---|---|");

const nodeList = Object.entries(nodeStrengthStats).map(([id, s]) => {
    const avgVisits = s.visits / results.length;
    const avgRes = s.resGained / results.length;
    const avgProd = s.prodGained / results.length;
    const avgCards = s.cardsGained / results.length;
    // Score calculation: Weight resources, production and cards
    const score = (avgRes * 1.0) + (avgProd * 1.5) + (avgCards * 2.5);
    return {
        name: nodeNames[id] || `Node ${id}`,
        visits: avgVisits.toFixed(2),
        res: avgRes.toFixed(2),
        prod: avgProd.toFixed(2),
        cards: avgCards.toFixed(2),
        score: score.toFixed(2)
    };
});

nodeList.sort((a, b) => b.score - a.score);
nodeList.forEach(n => {
    console.log(`| ${n.name.padEnd(15)} | ${n.visits.padStart(6)} | ${n.res.padStart(9)} | ${n.prod.padStart(10)} | ${n.cards.padStart(10)} | ${n.score.padStart(5)} |`);
});

console.log("\n* Score = (AvgRes * 1.0) + (AvgProd * 1.5) + (AvgCards * 2.5)");
