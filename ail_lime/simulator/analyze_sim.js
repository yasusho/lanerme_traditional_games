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
                construction: 0
            };
        }

        const s = strategyStats[strat];
        s.games++;
        s.totalVP += p.vp;
        if (p.vp < s.minVP) s.minVP = p.vp;
        if (p.vp > s.maxVP) s.maxVP = p.vp;
        s.handSize += p.handSize || 0;
        s.construction += (p.builtCount || 0);

        if (p.vp === maxVP) s.wins++;
    });
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
console.log(`| Strategy | Win Rate | Avg VP | Min/Max | Avg Built |`);
console.log(`|---|---|---|---|---|`);

for (const [strat, stats] of Object.entries(strategyStats)) {
    const winRate = ((stats.wins / stats.games) * 100).toFixed(1) + '%';
    const avgVP = (stats.totalVP / stats.games).toFixed(2);
    const avgBuilt = (stats.construction / stats.games).toFixed(1);

    // Note: Win rate calculation here is "Percentage of games participated in that ended in a win".
    // Since games might have multiple AI of same strategy, "games" count is actually "player-slots".
    // So "Win Rate" is: (Wins / Player-Slots) * PlayerCount? 
    // No, simpler: "Win Share".
    // But easiest metric is: (Total Wins by Strat) / (Total Games) ??
    // No, if there are 2 Balanced AIs in a game, they both contribute to 'games'.

    // Let's stick to per-slot stats.
    // "Win %": probability that a slot with this strategy wins.

    console.log(`| ${strat.padEnd(10)} | ${winRate.padStart(8)} | ${avgVP.padStart(6)} | ${stats.minVP}/${stats.maxVP} | ${avgBuilt.padStart(9)} |`);
}

// Peak Resources (if available in schema)
// ...
