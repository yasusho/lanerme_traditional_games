const fs = require('fs');
const path = require('path');

const LOG_DIR = 'c:\\Users\\yasus\\Documents\\lanerme_traditional_games\\ail_lime\\batch_log';

function analyzeNitpicks() {
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));

    let detailedStats = {
        strategyRunStats: {}, // Strategy -> { totalRounds: [], winRounds: [] }
        seatStrategyMatrix: {}, // Seat -> { Strategy -> { wins: 0, total: 0 } }
        cardTraps: {}, // Card -> { wins: 0, total: 0 } for ALL players
        rusherCards: {}, // Card -> count (what do rushers build?)
        balancedCards: {} // Card -> count
    };

    files.forEach(file => {
        // Focus on 5 player games for maximum chaos/stress test
        if (!file.includes('5pl')) return;

        console.log(`Processing ${file}...`);
        const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
        const data = JSON.parse(content);

        data.games.forEach(game => {
            // 1. Duration by Winner Strategy
            const winner = game.players.find(p => p.name === game.winner);
            const winStrat = winner.aiStrategy || 'Unknown';

            if (!detailedStats.strategyRunStats[winStrat]) {
                detailedStats.strategyRunStats[winStrat] = { totalRounds: [], winRounds: [] };
            }
            detailedStats.strategyRunStats[winStrat].winRounds.push(game.totalRounds);

            game.players.forEach((p, idx) => {
                const strat = p.aiStrategy || 'Unknown';
                const seat = `P${p.id + 1}`; // p.id is 0-based seat index

                // 2. Seat x Strategy Win Rates
                if (!detailedStats.seatStrategyMatrix[seat]) detailedStats.seatStrategyMatrix[seat] = {};
                if (!detailedStats.seatStrategyMatrix[seat][strat]) detailedStats.seatStrategyMatrix[seat][strat] = { wins: 0, total: 0 };

                detailedStats.seatStrategyMatrix[seat][strat].total++;
                if (p.name === game.winner) {
                    detailedStats.seatStrategyMatrix[seat][strat].wins++;
                }

                // 3. Card Usage by Strategy
                p.builtCards.forEach(c => {
                    if (strat === 'Rusher') {
                        detailedStats.rusherCards[c] = (detailedStats.rusherCards[c] || 0) + 1;
                    } else if (strat === 'Balanced') {
                        detailedStats.balancedCards[c] = (detailedStats.balancedCards[c] || 0) + 1;
                    }

                    // 4. Trap Detection (Global)
                    if (!detailedStats.cardTraps[c]) detailedStats.cardTraps[c] = { wins: 0, total: 0 };
                    detailedStats.cardTraps[c].total++;
                    if (p.name === game.winner) detailedStats.cardTraps[c].wins++;
                });
            });
        });
    });

    console.log("\n=== NITPICK REPORT (5 Player Games) ===\n");

    // Report 1: Speed Kills? (Avg Rounds to Win)
    console.log("1. Strategy Speed (Avg Rounds to Win):");
    for (const s in detailedStats.strategyRunStats) {
        const r = detailedStats.strategyRunStats[s].winRounds;
        if (r.length === 0) continue;
        const avg = r.reduce((a, b) => a + b, 0) / r.length;
        console.log(`  ${s.padEnd(10)}: ${avg.toFixed(2)} rounds`);
    }

    // Report 2: Seat Handicap vs Skill
    console.log("\n2. Seat Bias vs Strategy (Win Rate):");
    const seats = Object.keys(detailedStats.seatStrategyMatrix).sort();

    // Header
    const strats = ['Balanced', 'Hoarder', 'Rusher', 'Naive'];
    console.log('       ' + strats.map(s => s.padEnd(10)).join(' '));

    seats.forEach(seat => {
        const row = strats.map(strat => {
            const d = detailedStats.seatStrategyMatrix[seat][strat];
            const rate = d && d.total > 0 ? ((d.wins / d.total) * 100).toFixed(1) + '%' : '-';
            return rate.padEnd(10);
        }).join(' ');
        console.log(`${seat}   ${row}`);
    });

    // Report 3: "Trap" Cards (Low Win Rate but High Pick Rate?)
    console.log("\n3. Potential 'Trap' Cards (Win Rate < 15% but built > 100 times):");
    const traps = Object.keys(detailedStats.cardTraps).map(c => {
        const d = detailedStats.cardTraps[c];
        return { card: c, rate: d.total > 0 ? d.wins / d.total : 0, total: d.total };
    }).filter(x => x.rate < 0.18 && x.total > 100).sort((a, b) => a.rate - b.rate);

    traps.forEach(t => {
        console.log(`  ${t.card.padEnd(20)}: Win Rate ${(t.rate * 100).toFixed(1)}% (Built ${t.total} times)`);
    });

    // Report 4: Rusher's Obsession (What are they building?)
    console.log("\n4. Rusher's Favorites (Diff vs Balanced):");
    // Sort Rusher cards by count
    const rushTop = Object.keys(detailedStats.rusherCards).sort((a, b) => detailedStats.rusherCards[b] - detailedStats.rusherCards[a]).slice(0, 5);
    rushTop.forEach(c => {
        console.log(`  ${c}: ${detailedStats.rusherCards[c]} times`);
    });

}

analyzeNitpicks();
