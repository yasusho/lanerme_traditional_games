const fs = require('fs');
const path = require('path');

const LOG_DIR = 'c:\\Users\\yasus\\Documents\\lanerme_traditional_games\\ail_lime\\batch_log';

function analyzeFiles() {
    let files = [];
    // Check if specific file is provided via args
    if (process.argv[2]) {
        // If args provided, just use that one file (basename)
        files = [path.basename(process.argv[2])];
    } else {
        // Otherwise load all
        files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
    }

    let aggregateStats = {
        byPlayerCount: {}
    };

    files.forEach(file => {
        console.log(`Processing ${file}...`);
        try {
            const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
            const data = JSON.parse(content);
            const playerCount = data.playerCount;

            if (!aggregateStats.byPlayerCount[playerCount]) {
                aggregateStats.byPlayerCount[playerCount] = {
                    totalGames: 0,
                    winsBySeat: {},
                    roundCounts: [],
                    cardWins: {},
                    cardTotal: {},
                    strategies: {}, // Strategy -> { wins, total, totalVP }
                    peakResources: { F: 0, M: 0, K: 0, W: 0, total: 0 } // Peak resource tracking
                };
                for (let i = 1; i <= playerCount; i++) {
                    aggregateStats.byPlayerCount[playerCount].winsBySeat[`Player ${i}`] = 0;
                }
            }

            const stats = aggregateStats.byPlayerCount[playerCount];

            data.games.forEach(game => {
                if (game.error) return; // Skip failed games
                stats.totalGames++;

                // Win Rate by Seat
                if (stats.winsBySeat[game.winner] !== undefined) {
                    stats.winsBySeat[game.winner]++;
                }

                // Game Length
                stats.roundCounts.push(game.totalRounds);

                // Peak Resources (if available)
                if (game.peakResources) {
                    if (game.peakResources.F > stats.peakResources.F) stats.peakResources.F = game.peakResources.F;
                    if (game.peakResources.M > stats.peakResources.M) stats.peakResources.M = game.peakResources.M;
                    if (game.peakResources.K > stats.peakResources.K) stats.peakResources.K = game.peakResources.K;
                    if (game.peakResources.W > stats.peakResources.W) stats.peakResources.W = game.peakResources.W;
                    if (game.peakResources.total > stats.peakResources.total) stats.peakResources.total = game.peakResources.total;
                }

                // Strategy Analysis
                game.players.forEach(p => {
                    const strategy = p.aiStrategy || 'Human/Unknown';
                    if (!stats.strategies[strategy]) {
                        stats.strategies[strategy] = { wins: 0, total: 0, totalVP: 0 };
                    }
                    stats.strategies[strategy].total++;
                    stats.strategies[strategy].totalVP += p.vp;

                    if (p.name === game.winner) {
                        stats.strategies[strategy].wins++;
                    }

                    // Card Stats
                    const isWinner = (p.name === game.winner);
                    p.builtCards.forEach(cardEntry => {
                        const cardName = typeof cardEntry === 'string' ? cardEntry : cardEntry.name;
                        const round = (typeof cardEntry === 'object' && cardEntry.round) ? cardEntry.round : null;

                        stats.cardTotal[cardName] = (stats.cardTotal[cardName] || 0) + 1;
                        if (isWinner) {
                            stats.cardWins[cardName] = (stats.cardWins[cardName] || 0) + 1;
                        }

                        if (round !== null) {
                            if (!stats.cardBuildRounds) stats.cardBuildRounds = {};
                            if (!stats.cardBuildRounds[cardName]) stats.cardBuildRounds[cardName] = { sum: 0, count: 0 };
                            stats.cardBuildRounds[cardName].sum += round;
                            stats.cardBuildRounds[cardName].count++;
                        }
                    });
                });
            });
        } catch (e) {
            console.error(`Error processing ${file}: ${e.message}`);
        }
    });

    // Report Generation
    console.log("\n====== ANALYSIS REPORT ======\n");

    for (const pCount in aggregateStats.byPlayerCount) {
        const s = aggregateStats.byPlayerCount[pCount];
        console.log(`--- ${pCount} Player Games (${s.totalGames} games) ---`);

        // Win Rates By Seat
        console.log("Win Rates by Seat Order:");
        for (const seat in s.winsBySeat) {
            const wins = s.winsBySeat[seat];
            const rate = s.totalGames > 0 ? ((wins / s.totalGames) * 100).toFixed(2) : 0;
            console.log(`  ${seat}: ${rate}% (${wins})`);
        }

        // Game Length Analysis
        const avgRounds = s.roundCounts.reduce((a, b) => a + b, 0) / s.totalGames;
        const minRounds = Math.min(...s.roundCounts);
        const maxRounds = Math.max(...s.roundCounts);
        console.log(`\nGame Length (Rounds):`);
        console.log(`  Average: ${avgRounds.toFixed(1)} rounds`);
        console.log(`  Range: ${minRounds} - ${maxRounds} rounds`);

        // Peak Resource Usage
        if (s.peakResources.total > 0) {
            console.log(`\nPeak Resource Usage (for token planning):`);
            console.log(`  F: ${s.peakResources.F} at most`);
            console.log(`  M: ${s.peakResources.M} at most`);
            console.log(`  K: ${s.peakResources.K} at most`);
            console.log(`  W: ${s.peakResources.W} at most`);
            console.log(`  Total: ${s.peakResources.total} tokens needed at peak`);
        }

        // Win Rates By Strategy
        console.log("\nAI Strategy Performance:");
        const stratTable = [];
        for (const strat in s.strategies) {
            const d = s.strategies[strat];
            const winRate = d.total > 0 ? ((d.wins / d.total) * 100).toFixed(2) : 0;
            const avgVP = d.total > 0 ? (d.totalVP / d.total).toFixed(2) : 0;
            stratTable.push({ strat, winRate, avgVP, wins: d.wins, total: d.total });
        }
        // Sort by Win Rate
        stratTable.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));

        console.table(stratTable); // Console table is nice if environment supports it, else use loop
        stratTable.forEach(r => {
            console.log(`  ${r.strat.padEnd(10)}: Win Rate ${r.winRate}% (Avg VP: ${r.avgVP}) [${r.wins}/${r.total}]`);
        });



        // Calculate Card Metrics
        const cardMetrics = Object.keys(s.cardTotal).map(card => {
            const wins = s.cardWins[card] || 0;
            const total = s.cardTotal[card] || 0;
            const winRate = total > 0 ? (wins / total).toFixed(2) : 0;

            let avgRoundStr = "N/A";
            if (s.cardBuildRounds && s.cardBuildRounds[card] && s.cardBuildRounds[card].count > 0) {
                avgRoundStr = (s.cardBuildRounds[card].sum / s.cardBuildRounds[card].count).toFixed(1);
            }

            return { card, wins, total, winRate, avgRound: avgRoundStr };
        });

        // Watchlist Analysis
        console.log("\nSpecific Card Performance (Previously Weak):");
        const watchlist = [
            '他国の書物', '10月8日', 'アイル共和国憲法', '良き文化',
            '投資', '旅',
            'アイル標準机戦', 'シェプオキヤウの大経済',
            '機械油の力', 'アイル国民の力',
            '古きを思い新しきに行く', '筆兵無傾', 'アイルの道'
        ];
        const watchMetrics = cardMetrics.filter(m => watchlist.includes(m.card));
        if (watchMetrics.length === 0) {
            console.log("  No watchlist cards found in logs.");
        } else {
            watchMetrics.forEach(m => {
                console.log(`  ${m.card.padEnd(10)}: Built ${m.total} times. Win Rate (in deck): ${m.winRate} (Avg Round: ${m.avgRound})`);
            });
        }



        console.log("\n");
    }
}

analyzeFiles();
