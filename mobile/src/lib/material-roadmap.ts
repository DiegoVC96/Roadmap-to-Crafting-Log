import type { FfxivRecipe, RecipeIngredient } from '@/lib/ffxiv-api';

export type BaseMaterialTotal = RecipeIngredient & {
  total: number;
};

function chooseCraftingRecipe(recipes: FfxivRecipe[]) {
  return [...recipes].sort((first, second) =>
    (first.level ?? Number.MAX_SAFE_INTEGER) - (second.level ?? Number.MAX_SAFE_INTEGER)
    || first.ingredients.length - second.ingredients.length
    || first.rowId - second.rowId,
  )[0];
}

/**
 * Expande recursivamente los ingredientes de todas las recetas pendientes.
 * Cada receta pendiente se fabrica una vez; si un ingrediente también se puede
 * fabricar, se sustituye por los materiales de su receta hasta llegar a un
 * material base. Las tandas respetan la cantidad producida por cada receta.
 */
export function calculateBaseMaterialTotals(recipes: FfxivRecipe[], completedIds: string[]) {
  const completed = new Set(completedIds);
  const producersByItem = new Map<number, FfxivRecipe[]>();
  const needs = new Map<number, BaseMaterialTotal>();
  const processedCrafts = new Map<number, number>();

  for (const recipe of recipes) {
    const existing = producersByItem.get(recipe.resultItemId) ?? [];
    existing.push(recipe);
    producersByItem.set(recipe.resultItemId, existing);
  }

  function addNeed(ingredient: RecipeIngredient, quantity: number) {
    const existing = needs.get(ingredient.itemId);
    needs.set(ingredient.itemId, existing
      ? { ...existing, total: existing.total + quantity }
      : { ...ingredient, quantity, total: quantity });
  }

  for (const recipe of recipes) {
    if (completed.has(recipe.id)) continue;
    for (const ingredient of recipe.ingredients) addNeed(ingredient, ingredient.quantity);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const material of [...needs.values()]) {
      const candidates = producersByItem.get(material.itemId);
      if (!candidates?.length) continue;

      const recipe = chooseCraftingRecipe(candidates);
      const requiredCrafts = Math.ceil(material.total / recipe.resultAmount);
      const alreadyExpanded = processedCrafts.get(material.itemId) ?? 0;
      if (requiredCrafts <= alreadyExpanded) continue;

      processedCrafts.set(material.itemId, requiredCrafts);
      const additionalCrafts = requiredCrafts - alreadyExpanded;
      for (const ingredient of recipe.ingredients) addNeed(ingredient, ingredient.quantity * additionalCrafts);
      changed = true;
    }
  }

  return [...needs.values()]
    .filter((material) => !producersByItem.has(material.itemId))
    .sort((first, second) => second.total - first.total || first.name.localeCompare(second.name));
}
