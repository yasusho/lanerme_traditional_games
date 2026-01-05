finalizeBuild(player, card, chainRemaining = 0) {
    this.removeCardFromHand(player, card);
    player.selectedCard = null;
    player.construction.push(card);
    player.lastAction = '建設';
    this.playSFX('build');

    // Handle Build Chain
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
        if (!this.checkGameEnd()) {
            this.checkPostAction(player);
        }
    }
}

checkGameEnd() {
    if (this.roundTokens <= 0) {
        this.endGame();
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
}

gainResource(player, type, amount = 1, source = 'other') {
    if (!type) return;

    // Stats tracking
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
