const fs = require('fs');
const path = require('path');

const LOG_DIR = 'c:\\Users\\yasus\\Documents\\lanerme_traditional_games\\ail_lime\\batch_log';

function analyzeTrends() {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));

    // Data structure: count -> stats
    const trends = {};

    files.forEach(file => {
        console.log(`Processing ${file}...`);
        const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
        const data = JSON.parse(content);
        const pCount = data.playerCount;

        if (!trends[pCount]) {
            trends[pCount] = {
                totalGames: 0,
                totalRounds: 0,
                p1Wins: 0,
                strategyWins: {},
                strategyTotal: {}
            };
        }

        const t = trends[pCount];

        data.games.forEach(game => {
            t.totalGames++;
            t.totalRounds += game.totalRounds;

            // P1 Win? (P1 is always the player with id 0 in the players array? 
            // We need to be careful. In previous script we saw players array is sorted by VP.
            // But we can find the player with id 0.)
            const p1 = game.players.find(p => p.id === 0);
            if (p1 && p1.name === game.winner) {
                t.p1Wins++;
            }

            // Strategy Stats
            game.players.forEach(p => {
                const strat = p.aiStrategy || 'Unknown';
                if (!t.strategyWins[strat]) t.strategyWins[strat] = 0;
                if (!t.strategyTotal[strat]) t.strategyTotal[strat] = 0;

                t.strategyTotal[strat]++;
                if (p.name === game.winner) {
                    t.strategyWins[strat]++;
                }
            });
        });
    });

    console.log("\n=== PLAYER COUNT TREND ANALYSIS ===\n");

    const counts = Object.keys(trends).sort((a, b) => parseInt(a) - parseInt(b));

    // 1. Game Duration
    console.log("1. Game Speed (Average Rounds):");
    counts.forEach(c => {
        const avg = trends[c].totalRounds / trends[c].totalGames;
        console.log(`  ${c} Player: ${avg.toFixed(2)} rounds`);
    });

    // 2. First Player Advantage
    console.log("\n2. First Player Advantage (P1 Win Rate):");
    counts.forEach(c => {
        const rate = (trends[c].p1Wins / trends[c].totalGames) * 100;
        const expected = 100 / parseInt(c);
        const bias = rate - expected;
        console.log(`  ${c} Player: ${rate.toFixed(2)}% (Expected: ${expected.toFixed(2)}%, Bias: +${bias.toFixed(2)}%)`);
    });

    // 3. Strategy Effectiveness (Win Rate)
    console.log("\n3. Strategy Effectiveness per Player Count:");
    const allStrats = ['Balanced', 'Hoarder', 'Rusher', 'Naive'];

    // Header
    console.log('Count   ' + allStrats.map(s => s.padEnd(10)).join(' '));

    counts.forEach(c => {
        const t = trends[c];
        const row = allStrats.map(s => {
            const wins = t.strategyWins[s] || 0;
            const total = t.strategyTotal[s] || 0;
            const rate = total > 0 ? ((wins / total) * 100).toFixed(1) + '%' : '-';
            return rate.padEnd(10);
        }).join(' ');
        console.log(`${c.padEnd(7)} ${row}`);
    });
}

analyzeTrends();
