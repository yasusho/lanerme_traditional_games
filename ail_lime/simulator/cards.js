const cardsData = [
    {
        id: 1,
        name_jp: "燐字の光",
        name_original: "linman leti kapa",
        type: "culture",
        level: 1,
        count: 5,
        move: 1,
        move_resource: [],
        cost: { K: 2 },
        production_condition: 'K',
        production: { K: 1 },
        vp_logic: "static",
        vp: 1,
        chain_build: 1,
        image_src: "../cards_new/cards_1 ページ.png"
    },
    {
        id: 2,
        name_jp: "アイルのパンとアイルの芋",
        name_original: "ail onec at ail dectok",
        type: "culture",
        level: 1,
        count: 5,
        move: 1,
        move_resource: [],
        cost: { K: 1, F: 2 },
        production_condition: 'K',
        production: { F: 1 },
        vp_logic: "static",
        vp: 1,
        chain_build: 1,
        image_src: "../cards_new/cards_2 ページ.png"
    },
    {
        id: 3,
        name_jp: "他国の書物",
        name_original: "etleti icco leti kulante",
        type: "culture",
        level: 2,
        count: 4,
        move: 2,
        move_resource: [],
        cost: { K: 3 },
        production_condition: 'K',
        production: { K: 2 },
        vp_logic: "static",
        vp: 2,
        image_src: "../cards_new/cards_3 ページ.png"
    },
    {
        id: 4,
        name_jp: "アイル標準机戦",
        name_original: "ail panit leti cetkaik",
        type: "culture",
        level: 3,
        count: 2,
        move: 1,
        move_resource: ["K"],
        cost: { K: 2, F: 2, W: 1 },
        production_condition: 'K',
        production: { M: "variable" }, // Dynamic production
        vp_logic: "static",
        vp: 2,
        production_logic: "variable",
        production_formula: "count(culture_cards)",
        production_resource: "M",
        image_src: "../cards_new/cards_4 ページ.png"
    },
    {
        id: 5,
        name_jp: "資源の採掘",
        name_original: "letit kile inimoc",
        type: "industry",
        level: 1,
        count: 5,
        move: 0,
        move_resource: [],
        cost: { M: 2 },
        production_condition: 'M',
        production: { M: 1 },
        vp_logic: "static",
        vp: 1,
        chain_build: 1,
        image_src: "../cards_new/cards_5 ページ.png"
    },
    {
        id: 6,
        name_jp: "ナナラ港",
        name_original: "nanala junalika",
        type: "industry",
        level: 1,
        count: 5,
        move: 3,
        move_resource: [],
        cost: { M: 1, K: 2 },
        production_condition: 'M',
        production: { K: 1 },
        vp_logic: "none",
        vp: 0,
        effect: "convert_same3_to_W",
        chain_build: 2,
        image_src: "../cards_new/cards_6 ページ.png"
    },
    {
        id: 7,
        name_jp: "機械油の力",
        name_original: "ben leti anpe",
        type: "industry",
        level: 2,
        count: 4,
        move: 2,
        move_resource: [],
        cost: { M: 3 },
        production_condition: 'M',
        production: { M: 2 },
        vp_logic: "static",
        vp: 2,
        image_src: "../cards_new/cards_7 ページ.png"
    },
    {
        id: 8,
        name_jp: "シェプオキヤウの大経済",
        name_original: "xep okijau leti xep kukol",
        type: "industry",
        level: 3,
        count: 2,
        move: 3,
        move_resource: ["M"],
        cost: { M: 2, K: 2, W: 1 },
        production_condition: 'M',
        production: { F: "variable" }, // Dynamic production
        vp_logic: "static",
        vp: 1,
        production_logic: "variable",
        production_formula: "count(industry_cards)",
        production_resource: "F",
        image_src: "../cards_new/cards_8 ページ.png"
    },
    {
        id: 9,
        name_jp: "法改正",
        name_original: "dutucunit cepkulante",
        type: "politics",
        level: 1,
        count: 5,
        move: 1,
        move_resource: [],
        cost: { F: 2 },
        production_condition: 'F',
        production: { F: 1 },
        vp_logic: "static",
        vp: 1,
        draw_extra: 1,
        image_src: "../cards_new/cards_9 ページ.png"
    },
    {
        id: 10,
        name_jp: "敵などいないアイル兵",
        name_original: "zik molip leti ail elme",
        type: "politics",
        level: 1,
        count: 5,
        move: 2,
        move_resource: [],
        cost: { F: 1, M: 2 },
        production_condition: 'F',
        production: { M: 1 },
        vp_logic: "none",
        vp: 0,
        draw_extra: 2,

        // Rule says for #11 (this one? No #11 is next): "M+1" VP? 
        // Wait, I need to check the row alignment in rule.md carefully.
        // Row 111: | 政治 | F | M | 1 | 5 | 敵などいないアイル兵 | ... | 2 | | F1M2 | F | M+1 | | | 2 | |
        // VP is "M+1"? No, that's "VP" column? No...
        // Header: | 分野 | 主資源 | 副資源 | Lv | 枚数 | カード名(日) | カード名(原) | 移動数 | 移動時獲得資源 | コスト | 産出発動条件 | 産出 | VP | 変換 | ドロー追加 | 建設連鎖 |
        // Row 111: "M+1" is under "VP"?
        // Wait, "M+1" usually means Gain M+1 resource? Or VP is M+1? 
        // My rule reading: "M+1" under VP column means getting 1 VP for something? Or maybe 1VP per M?
        // Actually, looking at others: "K+1", "F+1". 
        // Maybe it means "Provides 1 VP"?
        // But for #104 (culture lv2): "K+2". And VP column says "3".
        // Wait, let's re-read line 104 in rule.md.
        // | 文化 | ... | 2 | 4 | 他国の書物 | ... | 2 | | K3 | K | K+2 | 3 | | | |
        // Ah, "産出発動条件" (Production Condition) is "K" (Resource). "産出" (Production) is "K+2"? No.
        // Column mapping:
        // 1: 分野 (Category)
        // 2: 主資源 (Main Res)
        // 3: 副資源 (Sub Res)
        // 4: Lv
        // 5: 枚数 (Count)
        // 6: Name JP
        // 7: Name Original
        // 8: Move
        // 9: Move Res
        // 10: Cost
        // 11: Production Condition
        // 12: Production
        // 13: VP
        // 14: Conversion
        // 15: Draw Add
        // 16: Build Chain

        // Let's trace Row 111 (Politics Lv1 2nd card):
        // | 政治 | F | M | 1 | 5 | 敵などいないアイル兵 | ... | 2 | | F1M2 | F | M+1 | | | 2 | |
        // Cost: F1M2. Prod Condition: F. Production: M+1 (Gain 1 M?). VP: Empty. Conversion: Empty. Draw Add: 2? No, 2 is under "Draw Add"?
        // Wait, let's count pipes.
        // | 政治(1) | F(2) | M(3) | 1(4) | 5(5) | 敵などいないアイル兵(6) | zik...(7) | 2(8) | (9) | F1M2(10) | F(11) | M+1(12) | (13) | (14) | 2(15) | (16)?
        // Wait, last column is empty?
        // Let's check Row 102 (First card):
        // | 文化 | K | F | 1 | 5 | 燐字の光 | ... | 1 | | K2 | K | K+1 | 1 | | | 1 |
        // Col 11: K. Col 12: K+1. Col 13: 1 (VP). Col 16: 1 (Chain).
        // It seems "Producton" is K+1?
        // But Rule text says: "産出: 以下の2つの資源...". "効果: 産出など".
        // Maybe "K+1" means "Gain 1 K"? Yes.

        // Back to #110 (Politics Lv1 1st card):
        // | ... | 法改正 | ... | 1 | | F2 | F | F+1 | 1 | | 1 | |
        // Cost: F2. Prod Cond: F. Prod: F+1. VP: 1. Draw Add: 1. Chain: Empty.
        //
        // #111 (Politics Lv1 2nd card):
        // | ... | 敵などいないアイル兵 | ... | 2 | | F1M2 | F | M+1 | | | 2 | |
        // VP is empty. Draw Add is 2.

        // So for #10 (my id):
        image_src: "../cards_new/cards_10 ページ.png"
    },
    {
        id: 11,
        // Row 112
        name_jp: "アイル国民の力",
        name_original: "ail lata leti anpe",
        type: "politics",
        level: 2,
        count: 4,
        move: 1,
        move_resource: [],
        cost: { F: 3 },
        production_condition: 'F',
        production: { F: 2 },
        vp_logic: "static",
        vp: 2,
        image_src: "../cards_new/cards_11 ページ.png"
    },
    {
        id: 12,
        // Row 113
        name_jp: "10月8日",
        name_original: "ana leti lekka",
        type: "politics",
        level: 3,
        count: 2,
        move: 2,
        move_resource: ["F"],
        cost: { F: 2, M: 2, W: 1 },
        production_condition: "F",
        production: { K: "dynamic" }, // "K x 政治カード" is under VP??
        // Row 113: | ... | F2M2W1 | F | K x政治カード | 1 | | | |
        // Prod: F? No, "K x 政治 cards" is in Production column (12)??
        // Let's check headers again.
        // 11: 産出発動条件 (Condition)
        // 12: 産出 (Production)
        // 13: VP
        // Row 113 (10月8日): Col 11: F. Col 12: K x 政治カード. Col 13: 1.
        // So this card produces K based on politics cards count!
        vp_logic: "static",
        vp: 1,
        production_logic: "variable",
        production_formula: "count(politics_cards)",
        production_resource: "K",
        image_src: "../cards_new/cards_12 ページ.png"
    },
    {
        id: 13,
        // Row 114
        name_jp: "投資",
        name_original: "amolit cu",
        type: "colorless",
        level: null,
        count: 4,
        move: 0,
        cost: { multi: "same3" }, // "同種3" (3 of same kind)
        effect: "convert_W2_to_W3", // W2 -> W3
        vp: 1,
        chain_build: 1,
        image_src: "../cards_new/cards_13 ページ.png"
    },
    {
        id: 14,
        // Row 115
        name_jp: "旅",
        name_original: "xuwelic",
        type: "colorless",
        level: null,
        count: 4,
        move: 2,
        move_resource: ["W"],
        cost: { multi: "same3" },
        effect: "convert_K2_to_W",
        vp: 1,
        chain_build: 1,
        image_src: "../cards_new/cards_14 ページ.png"
    },
    {
        id: 15,
        // Row 116
        name_jp: "良き文化",
        name_original: "pankaleti mo",
        type: "colorless",
        level: null,
        count: 2,
        move: 3,
        move_resource: ["K", "M", "F"], // "K/M/F"
        cost: { K: 3, F: 3 },
        vp_logic: "variable",
        vp_text: "1 x 文化",
        vp_formula: "1 * count(culture_cards)",
        image_src: "../cards_new/cards_15 ページ.png"
    },
    {
        id: 16,
        // Row 117
        name_jp: "古きを思い新しきに行く",
        name_original: "ticotit penulleti pi tude jo dutucunleti",
        type: "colorless",
        level: null,
        count: 2,
        move: 3,
        move_resource: ["K", "M", "F"],
        cost: { M: 3, K: 2 },
        vp_logic: "variable",
        vp_text: "1 x 産業",
        vp_formula: "1 * count(industry_cards)",
        image_src: "../cards_new/cards_16 ページ.png"
    },
    {
        id: 17,
        // Row 118
        name_jp: "筆兵無傾",
        name_original: "kuwa at elme",
        type: "colorless",
        level: null,
        count: 1, // Rule says 2 copies! Row 118 col 5 says "2".
        // Wait, my file list says "cards_17", "18", "19", "20".
        // Row 118 is 17th item.
        // Row 119 is 18th item.
        // Row 120 is 19th item.
        // Total types = 19.
        count: 2,
        move: 3,
        move_resource: ["K", "M", "F"],
        cost: { F: 3, M: 3 },
        vp_logic: "variable",
        vp_text: "1 x 政治",
        vp_formula: "1 * count(politics_cards)",
        image_src: "../cards_new/cards_17 ページ.png"
    },
    {
        id: 18,
        // Row 119
        name_jp: "アイルの道",
        name_original: "ail lime",
        type: "colorless",
        level: null,
        count: 1,
        move: 3,
        move_resource: ["W"],
        cost: { F: 2, K: 2, M: 2 },
        vp_logic: "variable",
        vp_formula: "2 * count(round_tokens)",
        vp_text: "周回トークン x2",
        image_src: "../cards_new/cards_18 ページ.png"
    },
    {
        id: 19,
        // Row 120
        name_jp: "アイル共和国憲法",
        name_original: "ail xep cepkulante",
        type: "colorless",
        level: null,
        count: 1,
        move: 3,
        move_resource: ["W"],
        cost: { F: 2, K: 2, M: 2 },
        vp_logic: "variable",
        vp_formula: "2 * min(culture, industry, politics)",
        vp_text: "文化産業政治セット x2",
        image_src: "../cards_new/cards_19 ページ.png"
    }
];

const cardBackImage = "../cards_new/cards_20 ページ.png";
