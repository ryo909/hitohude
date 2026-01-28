export const STAGES = [
  { id: 1, name: "Tutorial 1", w: 3, h: 3, start: [0, 0], goal: [2, 2], blocked: [] },
  { id: 2, name: "Tutorial 2", w: 3, h: 3, start: [2, 0], goal: [0, 2], blocked: [] },

  { id: 3, name: "Easy 1", w: 4, h: 4, start: [0, 0], goal: [0, 3], blocked: [] },
  { id: 4, name: "Easy 2", w: 4, h: 4, start: [3, 0], goal: [0, 2], blocked: [] },
  { id: 5, name: "Easy 3", w: 4, h: 4, start: [0, 0], goal: [1, 3], blocked: [[0, 1]] },

  { id: 6, name: "Easy 4", w: 5, h: 5, start: [0, 0], goal: [4, 4], blocked: [] },
  { id: 7, name: "Medium 1", w: 5, h: 5, start: [0, 0], goal: [4, 3], blocked: [[2, 2]] },
  { id: 8, name: "Medium 2", w: 5, h: 5, start: [4, 0], goal: [0, 3], blocked: [[2, 2]] },
  { id: 9, name: "Medium 3", w: 5, h: 5, start: [0, 2], goal: [4, 1], blocked: [[2, 2]] },
  { id: 10, name: "Medium 4", w: 5, h: 5, start: [0, 0], goal: [4, 4], blocked: [[0, 1], [1, 1]] },
];
