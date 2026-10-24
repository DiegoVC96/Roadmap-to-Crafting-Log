export const crafterIds = [
  'Carpenter',
  'Blacksmith',
  'Armorer',
  'Goldsmith',
  'Leatherworker',
  'Weaver',
  'Alchemist',
  'Culinarian',
] as const

export type CrafterId = (typeof crafterIds)[number]

export type FfxivRecipe = {
  id: string
  rowId: number
  resultItemId: number
  iconPath: string | null
  name: string
  crafter: CrafterId
  level: number | null
  resultAmount: number
  ingredients: RecipeIngredient[]
}

export type RecipeIngredient = {
  itemId: number
  iconPath: string | null
  name: string
  quantity: number
}

type ApiRow = {
  row_id: number
  fields: Record<string, unknown>
}

type ApiResponse = {
  rows?: ApiRow[]
}

const apiUrl = 'https://v2.xivapi.com/api/sheet/Recipe'

const craftTypeToCrafter: Record<string, CrafterId> = {
  Woodworking: 'Carpenter',
  Smithing: 'Blacksmith',
  Armorcraft: 'Armorer',
  Goldsmithing: 'Goldsmith',
  Leatherworking: 'Leatherworker',
  Clothcraft: 'Weaver',
  Alchemy: 'Alchemist',
  Cooking: 'Culinarian',
}

function readName(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const relation = value as {
    Name?: unknown
    fields?: { Name?: unknown }
  }

  const name = relation.fields?.Name ?? relation.Name

  return typeof name === 'string' && name.length > 0 ? name : null
}

function readLevel(value: unknown): number | null {
  if (typeof value === 'number') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const relation = value as {
    ClassJobLevel?: unknown
    fields?: { ClassJobLevel?: unknown }
  }

  const level = relation.fields?.ClassJobLevel ?? relation.ClassJobLevel

  return typeof level === 'number' ? level : null
}

function readRowId(value: unknown): number | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const relation = value as { row_id?: unknown }

  return typeof relation.row_id === 'number' ? relation.row_id : null
}

function readIconPath(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const relation = value as {
    Icon?: unknown
    fields?: { Icon?: unknown }
  }

  const icon = relation.fields?.Icon ?? relation.Icon

  if (!icon || typeof icon !== 'object') {
    return null
  }

  const path = (icon as { path?: unknown }).path

  return typeof path === 'string' ? path : null
}

function readIngredients(fields: Record<string, unknown>): RecipeIngredient[] {
  const ingredientRows = Array.isArray(fields.Ingredient)
    ? fields.Ingredient
    : []

  const ingredientAmounts = Array.isArray(fields.AmountIngredient)
    ? fields.AmountIngredient
    : []

  return ingredientRows.flatMap((ingredient, index): RecipeIngredient[] => {
    const name = readName(ingredient)
    const itemId = readRowId(ingredient)
    const iconPath = readIconPath(ingredient)
    const quantity = ingredientAmounts[index]

    if (
      !name ||
      itemId === null ||
      typeof quantity !== 'number' ||
      quantity <= 0
    ) {
      return []
    }

    return [{ itemId, name, quantity, iconPath }]
  })
}

export function getIconUrl(iconPath: string) {
  const url = new URL('https://v2.xivapi.com/api/asset')

  url.searchParams.set('path', iconPath)
  url.searchParams.set('format', 'png')

  return url.toString()
}

export async function loadRecipePage(after?: number) {
  const url = new URL(apiUrl)

  url.searchParams.set('language', 'en')
  url.searchParams.set('limit', '500')
  url.searchParams.set(
    'fields',
    'CraftType.Name,ItemResult.Name,ItemResult.Icon,RecipeLevelTable.ClassJobLevel,AmountResult,Ingredient[].Name,Ingredient[].Icon,AmountIngredient',
  )

  if (after !== undefined) {
    url.searchParams.set('after', String(after))
  }

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('No se pudieron cargar las recetas de FFXIV.')
  }

  const payload = (await response.json()) as ApiResponse
  const rows = payload.rows ?? []

  const recipes = rows.flatMap((row): FfxivRecipe[] => {
    const craftTypeName =
      readName(row.fields.CraftType) ??
      readName(row.fields['CraftType.Name'])

    const recipeName =
      readName(row.fields.ItemResult) ??
      readName(row.fields['ItemResult.Name'])

    const resultItemId = readRowId(row.fields.ItemResult)
    const iconPath = readIconPath(row.fields.ItemResult)

const crafter = craftTypeName
  ? craftTypeToCrafter[craftTypeName]
  : undefined

if (!crafter || !recipeName || resultItemId === null) {
  return []
  }

    return [
      {
        id: `xiv-recipe-${row.row_id}`,
        rowId: row.row_id,
        resultItemId,
        iconPath,
        ingredients: readIngredients(row.fields),
        name: recipeName,
        crafter,
        level:
          readLevel(row.fields.RecipeLevelTable) ??
          readLevel(row.fields['RecipeLevelTable.ClassJobLevel']),
        resultAmount:
          typeof row.fields.AmountResult === 'number' &&
          row.fields.AmountResult > 0
            ? row.fields.AmountResult
            : 1,
      },
    ]
  })

  return {
    recipes,
    lastRowId: rows.at(-1)?.row_id,
    hasMore: rows.length === 500,
  }
}

export async function loadAllRecipes() {
  const allRecipes: FfxivRecipe[] = []
  let nextRowId: number | undefined

  while (true) {
    const page = await loadRecipePage(nextRowId)

    allRecipes.push(...page.recipes)

    if (!page.hasMore || page.lastRowId === undefined) {
      break
    }

    nextRowId = page.lastRowId
  }

  return allRecipes.sort((firstRecipe, secondRecipe) => {
    if (firstRecipe.crafter !== secondRecipe.crafter) {
      return firstRecipe.crafter.localeCompare(secondRecipe.crafter)
    }

    return (
      (firstRecipe.level ?? 0) - (secondRecipe.level ?? 0) ||
      firstRecipe.name.localeCompare(secondRecipe.name)
    )
  })
}

export async function loadRecipeIngredients(recipeRowId: number) {
  const url = new URL(`${apiUrl}/${recipeRowId}`)

  url.searchParams.set('language', 'en')
  url.searchParams.set(
    'fields',
    'Ingredient[].Name,Ingredient[].Icon,AmountIngredient',
  )

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('No se pudieron cargar los materiales de la receta.')
  }

  const payload = (await response.json()) as {
    fields?: Record<string, unknown>
  }

  return readIngredients(payload.fields ?? {})
}
