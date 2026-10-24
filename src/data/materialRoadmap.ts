import type { FfxivRecipe, RecipeIngredient } from './ffxivApi'

function chooseCraftingRecipe(recipes: FfxivRecipe[]) {
  return [...recipes].sort(
    (first, second) =>
      (first.level ?? Number.MAX_SAFE_INTEGER) -
        (second.level ?? Number.MAX_SAFE_INTEGER) ||
      first.ingredients.length - second.ingredients.length ||
      first.rowId - second.rowId,
  )[0]
}

/**
 * Convierte los ingredientes de las recetas pendientes en sus materiales base.
 * Si un ingrediente es fabricable, se sigue su receta hasta llegar a una fuente
 * que debe obtenerse fuera del crafting. También respeta los resultados por tanda.
 */
export function calculateBaseMaterialTotals(
  recipes: FfxivRecipe[],
  completedRecipeIds: string[],
) {
  const completed = new Set(completedRecipeIds)
  const producersByItem = new Map<number, FfxivRecipe[]>()
  const needs = new Map<number, RecipeIngredient>()
  const expandedCrafts = new Map<number, number>()

  for (const recipe of recipes) {
    const producers = producersByItem.get(recipe.resultItemId) ?? []
    producers.push(recipe)
    producersByItem.set(recipe.resultItemId, producers)
  }

  function addNeed(ingredient: RecipeIngredient, quantity: number) {
    const current = needs.get(ingredient.itemId)
    needs.set(ingredient.itemId, {
      ...ingredient,
      quantity: (current?.quantity ?? 0) + quantity,
    })
  }

  for (const recipe of recipes) {
    if (completed.has(recipe.id)) {
      continue
    }

    for (const ingredient of recipe.ingredients) {
      addNeed(ingredient, ingredient.quantity)
    }
  }

  let didExpand = true
  while (didExpand) {
    didExpand = false

    for (const material of [...needs.values()]) {
      const candidates = producersByItem.get(material.itemId)

      if (!candidates?.length) {
        continue
      }

      const recipe = chooseCraftingRecipe(candidates)
      const requiredCrafts = Math.ceil(material.quantity / recipe.resultAmount)
      const alreadyExpanded = expandedCrafts.get(material.itemId) ?? 0

      if (requiredCrafts <= alreadyExpanded) {
        continue
      }

      expandedCrafts.set(material.itemId, requiredCrafts)
      const additionalCrafts = requiredCrafts - alreadyExpanded

      for (const ingredient of recipe.ingredients) {
        addNeed(ingredient, ingredient.quantity * additionalCrafts)
      }

      didExpand = true
    }
  }

  return [...needs.values()]
    .filter((material) => !producersByItem.has(material.itemId))
    .sort(
      (first, second) =>
        second.quantity - first.quantity || first.name.localeCompare(second.name),
    )
}
