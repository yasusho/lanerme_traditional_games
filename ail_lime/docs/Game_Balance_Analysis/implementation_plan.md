# Game Balance Analysis Plan

## Goal
Analyze the provided batch simulation logs to identify the strengths and weaknesses of the current game balance.

## Data Source
`batch_log` directory containing JSON files for 2-5 player games (1000 & 10000 iterations).

## Analysis Metrics

### 1. Game Balance (Fairness)
- **Win Rate by Turn Order**: Does the starting player have a significant advantage?
- **Win Rate by Player Strategy**: (If strategy is recorded) specific AI types vs others? *Note: Strategies might be homogeneous in these logs, need to check.*

### 2. Game Pacing
- **Turn Count Distribution**: Average, Min, Max, and Standard Deviation of turns to finish.
- **Score Distribution**: Average winning score, losing scores.

### 3. Card Balance
- **Key Card Analysis**: Which cards appear most frequently in winning decks?
- **Useless Card Analysis**: Which cards are rarely built or appear mostly in losing decks?

## Execution Steps
1.  **Data Parsing**: Write a Python script (or just use JS in browser console if simpler, but Python is better for data crunching) to parse the JSON files. *Self-correction: I don't have python installed in the environment (or I shouldn't rely on it). I will use a simple Node.js script since I have `node` available (assumed from `npm` availability).*
2.  **Script Implementation**:
    - Create `analyze_logs.js` in `scripts/` (or root if temp).
    - Read all JSON files.
    - Aggregate stats.
3.  **Report Generation**:
    - Output findings to `docs/Game_Balance_Analysis/walkthrough.md`.
    - Categorize into "Good Points" (e.g., " Balanced turn order win rate") and "Bad Points" (e.g., "Card X is overpowered").

## Verification
- Run the script and inspect the output.
- Sanity check: Total games should match filenames.
