// Shared drawing and hit-area coordinates keep the physical trays aligned at
// every viewport size. Labels and keyboard input stay in the accessible DOM.
export const COUNTER_WIDTH = 720;
export const COUNTER_HEIGHT = 590;
export const COUNTER_INGREDIENTS = [
  { id: 'quay', x: 34, y: 10, width: 146, height: 96 },
  { id: 'noodle', x: 22, y: 122, width: 212, height: 96 },
  { id: 'tai', x: 254, y: 128, width: 212, height: 96 },
  { id: 'chin', x: 486, y: 122, width: 212, height: 96 },
  { id: 'scallion', x: 22, y: 231, width: 96, height: 96 },
  { id: 'onion', x: 138, y: 228, width: 96, height: 96 },
  { id: 'herbs', x: 254, y: 229, width: 96, height: 96 },
  { id: 'chili', x: 374, y: 231, width: 96, height: 96 },
  { id: 'lime', x: 486, y: 229, width: 96, height: 96 },
  { id: 'sauce', x: 606, y: 225, width: 96, height: 96 },
] as const;
export type CounterIngredientId = typeof COUNTER_INGREDIENTS[number]['id'];
