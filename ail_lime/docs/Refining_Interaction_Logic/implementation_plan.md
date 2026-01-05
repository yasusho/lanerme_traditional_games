# Implementation Plan - Reliable Action Selection

## Goal Description
Ensure that the "Move" and "Build" action choices are presented reliably to the user when a card is selected, and do not disappear unexpectedly or fail to trigger.

## User Review Required
- **Double-click vs Single-click**: Confirming that double-click is for selection/confirmation, while ensuring the action panel appears immediately upon selection.

## Proposed Changes

### Simulator
#### [MODIFY] [game.js](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/game.js)
- **State Management**: Ensure `selectedCard` persists correctly during the `execute` phase.
- **UI Rendering**: 
    - Verify `updateUI` correctly renders the `action-selection-panel`.
    - Ensure the panel is prominent and distinct.
- **Event Handling**:
    - Ensure `executeMove` and `executeBuild` handlers are robust.

#### [MODIFY] [style.css](file:///c:/Users/yasus/Documents/lanerme_traditional_games/ail_lime/simulator/style.css)
- **Styling**: Enhance the `action-selection-panel` visibility (z-index, positioning).

## Verification Plan
### Manual Verification
1. Start a game.
2. Select a card in the Execute phase.
3. Verify the "Action Selection" panel appears and buttons work.
