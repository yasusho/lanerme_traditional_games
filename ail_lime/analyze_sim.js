const fs = require('fs');

const data = JSON.parse(fs.readFileSync('C:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/batch_log/ail_lime_sim_5000g_1768334805477.json', 'utf8'));
const games = data.games;

const stats = {};

games.forEach(g => {
    g.players.forEach(p => {
        const strat = p.aiStrategy || 'Unknown';
        if (!stats[strat]) {
            stats[strat] = {
                games: 0,
                wins: 0,
                totalVp: 0,
                totalCardVp: 0,
                totalLoopVp: 0,
                totalBuiltCount: 0,
                totalW: 0
            };
        }
        const s = stats[strat];
        s.games++;
        s.totalVp += p.vp;
        s.totalCardVp += (p.cardVp || 0);
        s.totalLoopVp += (p.loopVp || 0);
        s.totalBuiltCount += (p.builtCount || 0);
        s.totalW += (p.roundTokens || 0);

        if (p.vp === g.winnerVP) {
            s.wins++;
        }
    });
});

console.log("--- Simulation Stats (5000 Games) ---");
for (const strat in stats) {
    const s = stats[strat];
    console.log(`\n[Strategy: ${strat}]`);
    console.log(`Win Count: ${s.wins}`);
    console.log(`Win Rate: ${(s.wins / s.games * 100).toFixed(1)}%`);
    console.log(`Avg Total VP: ${(s.totalVp / s.games).toFixed(2)}`);
    console.log(`Avg Card VP: ${(s.totalCardVp / s.games).toFixed(2)}`);
    console.log(`Avg Loop VP: ${(s.totalLoopVp / s.games).toFixed(2)}`);
    console.log(`Avg Built Cards: ${(s.totalBuiltCount / s.games).toFixed(2)}`);
    console.log(`Avg W Tokens: ${(s.totalW / s.games).toFixed(2)}`);
}
