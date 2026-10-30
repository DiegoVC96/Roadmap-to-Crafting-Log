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
  /** Orden con el que la receta aparece dentro del Recipe Notebook del juego. */
  notebookOrder: number
  category: 'level' | 'special' | 'master'
  specialSection: 'society' | 'housing' | 'other' | null
  masterRecipeBook: string | null
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

const housingCategoryKeywords = [
  'furnishing',
  'fixture',
  'housing',
  'interior',
  'outdoor',
  'garden',
  'partition',
  'wall-mounted',
  'wall',
  'table',
  'rug',
]

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

function readRelatedName(value: unknown, relationName: string): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const relation = value as {
    [key: string]: unknown
    fields?: Record<string, unknown>
  }

  return readName(relation.fields?.[relationName] ?? relation[relationName])
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

  const relation = value as { row_id?: unknown; value?: unknown }

  const rowId = relation.row_id ?? relation.value

  return typeof rowId === 'number' ? rowId : null
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

function readBoolean(value: unknown) {
  return value === true || value === 1
}

function isHousingRecipe(...categories: Array<string | null>) {
  return categories.some((category) => {
    const normalizedCategory = category?.toLocaleLowerCase() ?? ''

    return housingCategoryKeywords.some((keyword) =>
      normalizedCategory.includes(keyword),
    )
  })
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
    'CraftType.Name,ItemResult.Name,ItemResult.Icon,ItemResult.ItemUICategory.Name,ItemResult.ItemSearchCategory.Name,RecipeLevelTable.ClassJobLevel,AmountResult,Number,IsSpecializationRequired,IsExpert,SecretRecipeBook.Name,ItemRequired.Name,StatusRequired.Name,Ingredient[].Name,Ingredient[].Icon,AmountIngredient',
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
    const requiredItemId = readRowId(row.fields.ItemRequired) ?? 0
    const requiredStatusId = readRowId(row.fields.StatusRequired) ?? 0
    const itemUiCategory =
      readName(row.fields['ItemResult.ItemUICategory']) ??
      readRelatedName(row.fields.ItemResult, 'ItemUICategory')
    const itemSearchCategory =
      readName(row.fields['ItemResult.ItemSearchCategory']) ??
      readRelatedName(row.fields.ItemResult, 'ItemSearchCategory')
    const masterRecipeBook =
      readName(row.fields.SecretRecipeBook) ??
      readName(row.fields['SecretRecipeBook.Name'])
    const isSpecialRecipe =
      readBoolean(row.fields.IsSpecializationRequired) ||
      readBoolean(row.fields.IsExpert)
    const isSocietyRecipe = requiredItemId > 0 || requiredStatusId > 0
    const isHousing = isHousingRecipe(itemUiCategory, itemSearchCategory)

const crafter = craftTypeName
  ? craftTypeToCrafter[craftTypeName]
  : undefined

    if (!crafter || !recipeName || resultItemId === null) {
      return []
    }

    const category = masterRecipeBook
      ? 'master'
      : isSocietyRecipe || isHousing || isSpecialRecipe
        ? 'special'
        : 'level'
    const specialSection =
      category !== 'special'
        ? null
        : isSocietyRecipe
          ? 'society'
          : isHousing
            ? 'housing'
            : 'other'

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
        notebookOrder:
          typeof row.fields.Number === 'number' ? row.fields.Number : row.row_id,
        category,
        specialSection,
        masterRecipeBook,
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

  return allRecipes.sort(compareRecipesByNotebookOrder)
}

/**
 * Mantiene el orden del Recipe Notebook dentro de cada profesión y categoría.
 * El campo Number es el índice de presentación del juego; el nombre queda solo
 * como desempate estable para las pocas recetas que comparten índice.
 */
export function compareRecipesByNotebookOrder(
  firstRecipe: FfxivRecipe,
  secondRecipe: FfxivRecipe,
) {
  if (firstRecipe.crafter !== secondRecipe.crafter) {
    return firstRecipe.crafter.localeCompare(secondRecipe.crafter)
  }

  if (firstRecipe.category !== secondRecipe.category) {
    return firstRecipe.category.localeCompare(secondRecipe.category)
  }

  return (
    (firstRecipe.level ?? 0) - (secondRecipe.level ?? 0) ||
    firstRecipe.notebookOrder - secondRecipe.notebookOrder ||
    firstRecipe.rowId - secondRecipe.rowId
  )
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
