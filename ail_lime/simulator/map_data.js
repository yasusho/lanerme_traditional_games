// Map Data for AIL LIME
// Coordinates extracted from map.svg shapes (circles/rects) generally near text labels.

const mapNodes = [
    // 01: Makati (Start)
    { id: 1, name: "マカティ", type: "start", resource: "W", x: 26.6, y: 68.5, connections: [2, 12] },

    // 02: Kuwake
    { id: 2, name: "クワケ", type: "normal", resource: "K", x: 22.8, y: 51.2, connections: [3] },

    // 03: Kukeka
    { id: 3, name: "クケカ", type: "normal", resource: "M", x: 42.8, y: 45.5, connections: [4, 13] },

    // 04: Ikkijau
    { id: 4, name: "イッキャウ", type: "branch", resource: "M", x: 49.23, y: 33.77, connections: [5, 6] },

    // 05: Taupo
    { id: 5, name: "タウポ", type: "normal", resource: "M", x: 57.2, y: 8.1, connections: [6] },

    // 06: Xep-Okijau
    { id: 6, name: "シェプ・オキヤウ", type: "hub", resource: "F", x: 67.4, y: 45.9, connections: [7, 11, 14] },

    // 07: Pacilxalija
    { id: 7, name: "パシルシャリヤ", type: "normal", resource: "F", x: 62.43, y: 73.85, connections: [8] },

    // 08: Kutija
    { id: 8, name: "クティヤ", type: "normal", resource: "K", x: 63.3, y: 87.7, connections: [9] },

    // 09: Nanala
    { id: 9, name: "ナナラ", type: "normal", resource: "K", x: 50.1, y: 87.7, connections: [10] },

    // 10: Inuci
    { id: 10, name: "イヌシ", type: "normal", resource: "F", x: 41.7, y: 81.0, connections: [1] },

    // Shortcuts / Loops

    // 11: Spukebec
    // Note: Auto-detection mapped to same as Inuci. Manually offset to estimated position.
    { id: 11, name: "スプケベス", type: "shortcut", resource: "M", x: 53.43, y: 70.19, connections: [9] },

    // 12: Atalan (Loop 1)
    { id: 12, name: "アタラム", type: "loop", resource: "Card", x: 15.4, y: 77.7, connections: [1] },

    // 13: Aikit (Loop 3)
    { id: 13, name: "アイキト", type: "loop", resource: "Card", x: 34.46, y: 35.10, connections: [3] },

    // 14: Pede (Loop 6)
    { id: 14, name: "ペデ", type: "loop", resource: "FMK", x: 84.36, y: 51.84, connections: [6] },
];
