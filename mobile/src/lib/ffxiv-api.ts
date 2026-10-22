export const crafterIds = [
  'Carpenter',
  'Blacksmith',
  'Armorer',
  'Goldsmith',
  'Leatherworker',
  'Weaver',
  'Alchemist',
  'Culinarian',
] as const;

export type CrafterId = (typeof crafterIds)[number];

export type RecipeIngredient = {
  itemId: number;
  iconPath: string | null;
  name: string;
  quantity: number;
};

export type FfxivRecipe = {
  id: string;
  rowId: number;
  resultItemId: number;
  iconPath: string | null;
  name: string;
  crafter: CrafterId;
  level: number | null;
  ingredients: RecipeIngredient[];
};

type ApiRow = { row_id: number; fields: Record<string, unknown> };
type ApiResponse = { rows?: ApiRow[] };

const apiUrl = 'https://v2.xivapi.com/api/sheet/Recipe';

const craftTypeToCrafter: Record<string, CrafterId> = {
  Woodworking: 'Carpenter', Smithing: 'Blacksmith', Armorcraft: 'Armorer', Goldsmithing: 'Goldsmith',
  Leatherworking: 'Leatherworker', Clothcraft: 'Weaver', Alchemy: 'Alchemist', Cooking: 'Culinarian',
};

function readName(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (!value || typeof value !== 'object') return null;
  const relation = value as { Name?: unknown; fields?: { Name?: unknown } };
  const name = relation.fields?.Name ?? relation.Name;
  return typeof name === 'string' && name ? name : null;
}

function readLevel(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object') return null;
  const relation = value as { ClassJobLevel?: unknown; fields?: { ClassJobLevel?: unknown } };
  const level = relation.fields?.ClassJobLevel ?? relation.ClassJobLevel;
  return typeof level === 'number' ? level : null;
}

function readRowId(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const rowId = (value as { row_id?: unknown }).row_id;
  return typeof rowId === 'number' ? rowId : null;
}

function readIconPath(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const relation = value as { Icon?: unknown; fields?: { Icon?: unknown } };
  const icon = relation.fields?.Icon ?? relation.Icon;
  const path = icon && typeof icon === 'object' ? (icon as { path?: unknown }).path : null;
  return typeof path === 'string' ? path : null;
}

function readIngredients(fields: Record<string, unknown>): RecipeIngredient[] {
  const ingredients = Array.isArray(fields.Ingredient) ? fields.Ingredient : [];
  const amounts = Array.isArray(fields.AmountIngredient) ? fields.AmountIngredient : [];

  return ingredients.flatMap((ingredient, index): RecipeIngredient[] => {
    const name = readName(ingredient);
    const itemId = readRowId(ingredient);
    const quantity = amounts[index];
    if (!name || itemId === null || typeof quantity !== 'number' || quantity <= 0) return [];
    return [{ itemId, name, quantity, iconPath: readIconPath(ingredient) }];
  });
}

export function getIconUrl(iconPath: string) {
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(iconPath)}&format=png`;
}

async function loadRecipePage(after?: number) {
  const url = new URL(apiUrl);
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', '500');
  url.searchParams.set('fields', 'CraftType.Name,ItemResult.Name,ItemResult.Icon,RecipeLevelTable.ClassJobLevel,Ingredient[].Name,Ingredient[].Icon,AmountIngredient');
  if (after !== undefined) url.searchParams.set('after', String(after));

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('No se pudieron cargar las recetas de FFXIV.');

  const rows = ((await response.json()) as ApiResponse).rows ?? [];
  const recipes = rows.flatMap((row): FfxivRecipe[] => {
    const crafterName = readName(row.fields.CraftType) ?? readName(row.fields['CraftType.Name']);
    const name = readName(row.fields.ItemResult) ?? readName(row.fields['ItemResult.Name']);
    const resultItemId = readRowId(row.fields.ItemResult);
    const crafter = crafterName ? craftTypeToCrafter[crafterName] : undefined;
    if (!crafter || !name || resultItemId === null) return [];
    return [{
      id: `xiv-recipe-${row.row_id}`, rowId: row.row_id, resultItemId, name, crafter,
      iconPath: readIconPath(row.fields.ItemResult), ingredients: readIngredients(row.fields),
      level: readLevel(row.fields.RecipeLevelTable) ?? readLevel(row.fields['RecipeLevelTable.ClassJobLevel']),
    }];
  });

  return { recipes, lastRowId: rows.length ? rows[rows.length - 1].row_id : undefined, hasMore: rows.length === 500 };
}

export async function loadAllRecipes() {
  const allRecipes: FfxivRecipe[] = [];
  let nextRowId: number | undefined;
  while (true) {
    const page = await loadRecipePage(nextRowId);
    allRecipes.push(...page.recipes);
    if (!page.hasMore || page.lastRowId === undefined) break;
    nextRowId = page.lastRowId;
  }

  return allRecipes.sort((first, second) => first.crafter !== second.crafter
    ? first.crafter.localeCompare(second.crafter)
    : (first.level ?? 0) - (second.level ?? 0) || first.name.localeCompare(second.name));
}
