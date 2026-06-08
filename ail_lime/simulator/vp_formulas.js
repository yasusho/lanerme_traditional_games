/**
 * VP計算用フォーミュラテーブル
 * vp_logic: 'variable' のカード用
 * 各カードIDに対応するVP計算関数を定義
 */
const VP_FORMULAS = {
    // カード15: 良き文化 - 建設済み文化カード数 × 2
    15: (player, counts) => counts.culture * 2,

    // カード16: 古きを思い新しきに行く - 建設済み産業カード数 × 2
    16: (player, counts) => counts.industry * 2,

    // カード17: 筆兵無傾 - 建設済み政治カード数 × 2
    17: (player, counts) => counts.politics * 2,

    // カード18: アイルの道 - Wトークン数 × 2
    18: (player, counts) => (player.resources.W || 0) * 2,

    // カード19: アイル共和国憲法 - 文化/産業/政治の最小値 × 3
    19: (player, counts) => Math.min(counts.culture, counts.industry, counts.politics) * 3
};
