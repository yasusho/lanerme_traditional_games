# Verification Walkthrough - Reliable Interaction & Turn Order

## Changes Applied

### Simulator
#### [MODIFY] [game.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/game.js)
- **Panel Persistence**: Moved the cleanup of `Action Selection Panel` in `updateUI` to the **start** of the function. Previously, it was inside the player loop, causing the panel created for Player 1 to be immediately removed when the loop processed Player 2. This was the root cause of the "invisible panel".
- **Panel Visibility**: The panel is now appended to `document.body` to avoid transform/clipping issues from parent containers.
- **Turn Order Logic**: Fixed `endTurn` to correctly rotate through players using modulo arithmetic, ensuring fair turn distribution and correct phase transitions.

#### [MODIFY] [style.css](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/style.css)
- **Panel Styling**: Updated `.action-selection-panel` to use `position: fixed` with **z-index: 3000** to guarantee it floats above all other elements (including overlays).

## Verification Steps

### 1. Panel Visibility & Action reliability
1. **Start Game**: Open `index.html`.
2. **Execute Phase**: Wait for your turn.
3. **Selection**: Double-click a card.
    - [ ] **Check**: The **Blue Action Panel** appears floating in the bottom center.
    - [ ] **Check**: It stays visible even if other players' areas update.
4. **Action**: Click "Move" or "Build".
    - [ ] **Check**: The action executes correctly.

### 2. Turn Order Verification
1. **Round 1**:
    - [ ] Note who the Start Player is (marked with ★).
    - [ ] Verify turns proceed: P1 -> P2 -> P3 -> P4 -> P5.
    - [ ] Verify `Replenish` phase starts after the last player.
2. **Round 2**:
    - [ ] Verify Start Player rotates (e.g., P2 is now ★).
    - [ ] Verify P1 gets their turn at the end of the round.
