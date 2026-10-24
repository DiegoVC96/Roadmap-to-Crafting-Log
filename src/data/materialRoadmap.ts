import type { FfxivRecipe, RecipeIngredient } from './ffxivApi'

export type MaterialBreakdownEntry = {
  recipeId: string
  recipeName: string
  crafter: FfxivRecipe['crafter']
  crafts: number
  quantity: number
  kind: 'direct' | 'intermediate'
}

export type BaseMaterialTotal = RecipeIngredient & {
  breakdown: MaterialBreakdownEntry[]
}

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
 * Calcula cuántas veces hay que ejecutar cada receta para fabricar todas las
 * recetas pendientes del log, incluyendo los componentes intermedios.
 */
export function calculateRecipeCraftTotals(
  recipes: FfxivRecipe[],
  completedRecipeIds: string[],
) {
  const completed = new Set(completedRecipeIds)
  const producersByItem = new Map<number, FfxivRecipe[]>()
  const needs = new Map<number, RecipeIngredient>()
  const expandedCrafts = new Map<number, number>()
  const craftTotals = new Map<string, number>()

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

  function addCrafts(recipe: FfxivRecipe, crafts: number) {
    craftTotals.set(recipe.id, (craftTotals.get(recipe.id) ?? 0) + crafts)
  }

  for (const recipe of recipes) {
    if (completed.has(recipe.id)) {
      continue
    }

    addCrafts(recipe, 1)

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
      const requiredCrafts = Math.ceil(
        material.quantity / (recipe.resultAmount || 1),
      )
      const alreadyExpanded = expandedCrafts.get(material.itemId) ?? 0

      if (requiredCrafts <= alreadyExpanded) {
        continue
      }

      const additionalCrafts = requiredCrafts - alreadyExpanded
      expandedCrafts.set(material.itemId, requiredCrafts)
      addCrafts(recipe, additionalCrafts)

      for (const ingredient of recipe.ingredients) {
        addNeed(ingredient, ingredient.quantity * additionalCrafts)
      }

      didExpand = true
    }
  }

  return craftTotals
}

/**
 * Convierte los ingredientes de las recetas pendientes en sus materiales base.
 * Si un ingrediente es fabricable, se sigue su receta hasta llegar a una fuente
 * que debe obtenerse fuera del crafting. También respeta los resultados por tanda.
 */
export function calculateBaseMaterialTotals(
  recipes: FfxivRecipe[],
  completedRecipeIds: string[],
  includesRootRecipe: (recipe: FfxivRecipe) => boolean = () => true,
) {
  const completed = new Set(completedRecipeIds)
  const producersByItem = new Map<number, FfxivRecipe[]>()
  const needs = new Map<number, RecipeIngredient>()
  const expandedCrafts = new Map<number, number>()
  const expandedRecipes = new Map<number, FfxivRecipe>()
  const breakdownByMaterial = new Map<
    number,
    Map<string, MaterialBreakdownEntry>
  >()

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

  function addBreakdown(
    ingredient: RecipeIngredient,
    recipe: FfxivRecipe,
    crafts: number,
    kind: MaterialBreakdownEntry['kind'],
  ) {
    if (producersByItem.has(ingredient.itemId)) {
      return
    }

    const entries = breakdownByMaterial.get(ingredient.itemId) ?? new Map()
    const key = `${recipe.id}-${kind}`
    const current = entries.get(key)

    entries.set(key, {
      recipeId: recipe.id,
      recipeName: recipe.name,
      crafter: recipe.crafter,
      crafts: (current?.crafts ?? 0) + crafts,
      quantity: (current?.quantity ?? 0) + ingredient.quantity * crafts,
      kind,
    })
    breakdownByMaterial.set(ingredient.itemId, entries)
  }

  for (const recipe of recipes) {
    if (completed.has(recipe.id) || !includesRootRecipe(recipe)) {
      continue
    }

    for (const ingredient of recipe.ingredients) {
      addNeed(ingredient, ingredient.quantity)
      addBreakdown(ingredient, recipe, 1, 'direct')
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
      // Los catálogos creados por versiones anteriores no tenían este campo.
      // La protección permite interpretarlos como una receta que produce una unidad.
      const resultAmount = recipe.resultAmount || 1
      const requiredCrafts = Math.ceil(material.quantity / resultAmount)
      const alreadyExpanded = expandedCrafts.get(material.itemId) ?? 0

      if (requiredCrafts <= alreadyExpanded) {
        continue
      }

      expandedCrafts.set(material.itemId, requiredCrafts)
      expandedRecipes.set(material.itemId, recipe)
      const additionalCrafts = requiredCrafts - alreadyExpanded

      for (const ingredient of recipe.ingredients) {
        addNeed(ingredient, ingredient.quantity * additionalCrafts)
      }

      didExpand = true
    }
  }

  for (const [itemId, crafts] of expandedCrafts) {
    const recipe = expandedRecipes.get(itemId)

    if (!recipe) {
      continue
    }

    for (const ingredient of recipe.ingredients) {
      addBreakdown(ingredient, recipe, crafts, 'intermediate')
    }
  }

  return [...needs.values()]
    .filter((material) => !producersByItem.has(material.itemId))
    .map<BaseMaterialTotal>((material) => ({
      ...material,
      breakdown: [
        ...(breakdownByMaterial.get(material.itemId)?.values() ?? []),
      ].sort((first, second) => second.quantity - first.quantity),
    }))
    .sort(
      (first, second) =>
        second.quantity - first.quantity || first.name.localeCompare(second.name),
    )
}
