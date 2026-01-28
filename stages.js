export const STAGES = [
  { id: 1,  name:"Tutorial 1", w:3, h:3, start:[0,0], goal:[2,2], blocked:[] },
  { id: 2,  name:"Tutorial 2", w:3, h:3, start:[2,0], goal:[0,2], blocked:[] },

  { id: 3,  name:"Easy 1", w:4, h:4, start:[0,0], goal:[3,3], blocked:[[1,1]] },
  { id: 4,  name:"Easy 2", w:4, h:4, start:[3,0], goal:[0,3], blocked:[[2,1]] },

  { id: 5,  name:"Easy 3", w:5, h:5, start:[0,0], goal:[4,4], blocked:[[2,2]] },
  { id: 6,  name:"Easy 4", w:5, h:5, start:[4,0], goal:[0,4], blocked:[[1,2],[3,2]] },

  { id: 7,  name:"Medium 1", w:5, h:5, start:[0,2], goal:[4,2], blocked:[[2,0],[2,1],[2,3],[2,4]] },

  { id: 8,  name:"Medium 2", w:6, h:6, start:[0,0], goal:[5,5], blocked:[[2,2],[2,3],[3,2],[3,3]] },

  { id: 9,  name:"Medium 3", w:6, h:6, start:[5,0], goal:[0,5], blocked:[[1,1],[2,1],[3,1],[4,1]] },

  { id:10,  name:"Medium 4", w:6, h:6, start:[0,5], goal:[5,0], blocked:[[1,4],[2,4],[3,4],[4,4]] },
];
