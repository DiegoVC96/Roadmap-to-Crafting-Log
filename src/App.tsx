import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import './App.css'
import appLogo from './assets/roadmap-logo.png'
import { AccountActions } from './components/AccountActions'
import { AdminAccessPanel } from './components/AdminAccessPanel'
import { AuthScreen } from './components/AuthScreen'
import { PendingApprovalScreen } from './components/PendingApprovalScreen'
import {
  loadAccessState,
  requestAccess,
  type AccessState,
} from './data/accessControl'
import { auth } from './data/firebase'
import {
  getIconUrl,
  loadAllRecipes,
  loadRecipeIngredients,
  type CrafterId,
  type FfxivRecipe,
  type RecipeIngredient,
} from './data/ffxivApi'
import { loadItemSources, type ItemSource } from './data/itemSources'
import {
  loadMarketLocations,
  loadMarketPrices,
  type MarketLocations,
  type MarketPrice,
  type MarketScope,
} from './data/marketBoard'
import {
  buildCraftingTree,
  calculateBaseMaterialTotals,
  calculateRecipeCraftTotals,
  type BaseMaterialTotal,
  type CraftingTreeNode,
} from './data/materialRoadmap'
import {
  readRecipeCatalog,
  saveRecipeCatalog,
} from './data/localDatabase'
import { loadUserProgress, saveUserProgress } from './data/userProgress'

type Crafter = {
  id: CrafterId
  icon: string
}

type VendorShoppingItem = {
  material: BaseMaterialTotal
  quantity: number
  vendors: ItemSource[]
  unitPrice: number | null
}

type AcquisitionMaterial = Pick<
  RecipeIngredient,
  'itemId' | 'name' | 'iconPath' | 'quantity'
>

type SmartPlanItem = {
  material: AcquisitionMaterial
  method: 'gather' | 'npc' | 'market' | 'unknown'
  source: ItemSource | null
  unitCost: number | null
  marketPrice: number | null
}

type FreeTrialStorageLocation = 'inventory' | 'saddlebag'

type CraftingGraphNode = {
  id: string
  itemId: number
  name: string
  iconPath: string | null
  quantity: number
  description: string
}

type CraftingGraphEdge = {
  from: string
  to: string
}

type CraftingGraphPosition = {
  x: number
  y: number
}

type DataRecipeIssue = {
  recipe: FfxivRecipe
  reason: string
  suggestedCategory: FfxivRecipe['category']
}

const recipeLevelRanges = Array.from({ length: 20 }, (_, index) => {
  const start = index * 5 + 1
  const end = start + 4

  return {
    start,
    end,
    label: `${start}–${end}`,
  }
})

const materialLevelRanges = Array.from({ length: 10 }, (_, index) => {
  const start = index * 10 + 1
  const end = start + 9

  return {
    start,
    end,
    label: `${start}–${end}`,
  }
})

function getRecipeLevelRangeStart(level: number | null | undefined) {
  const normalizedLevel = Math.max(level ?? 1, 1)
  return Math.floor((normalizedLevel - 1) / 5) * 5 + 1
}

function getMaterialLevelRangeStart(level: number | null | undefined) {
  const normalizedLevel = Math.max(level ?? 1, 1)
  return Math.floor((normalizedLevel - 1) / 10) * 10 + 1
}

function collectBaseMaterials(
  node: CraftingTreeNode,
  materials = new Map<number, AcquisitionMaterial>(),
) {
  if (node.children.length === 0 && node.crafts === null) {
    const current = materials.get(node.itemId)
    materials.set(node.itemId, {
      itemId: node.itemId,
      name: node.name,
      iconPath: node.iconPath,
      quantity: (current?.quantity ?? 0) + node.quantity,
    })
    return materials
  }

  for (const child of node.children) {
    collectBaseMaterials(child, materials)
  }

  return materials
}

function chooseSmartMethod(
  material: AcquisitionMaterial,
  sources: ItemSource[],
  marketPrice: number | null,
): SmartPlanItem {
  const gatheringSource = sources.find(
    (source) =>
      source.kind === 'gathering' ||
      source.kind === 'mob' ||
      source.kind === 'quest',
  )
  const vendorSource = sources.find(
    (source) => source.kind === 'vendor' && typeof source.price === 'number',
  )

  if (gatheringSource) {
    return {
      material,
      method: 'gather',
      source: gatheringSource,
      unitCost: 0,
      marketPrice,
    }
  }

  if (
    marketPrice !== null &&
    (!vendorSource || marketPrice < (vendorSource.price ?? Number.MAX_SAFE_INTEGER))
  ) {
    return {
      material,
      method: 'market',
      source: null,
      unitCost: marketPrice,
      marketPrice,
    }
  }

  if (vendorSource) {
    return {
      material,
      method: 'npc',
      source: vendorSource,
      unitCost: vendorSource.price ?? null,
      marketPrice,
    }
  }

  return {
    material,
    method: 'unknown',
    source: null,
    unitCost: null,
    marketPrice,
  }
}

const crafters: Crafter[] = [
  {
    id: 'Carpenter',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/carpenter.png',
  },
  {
    id: 'Blacksmith',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/blacksmith.png',
  },
  {
    id: 'Armorer',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/armorer.png',
  },
  {
    id: 'Goldsmith',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/goldsmith.png',
  },
  {
    id: 'Leatherworker',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/leatherworker.png',
  },
  {
    id: 'Weaver',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/weaver.png',
  },
  {
    id: 'Alchemist',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/alchemist.png',
  },
  {
    id: 'Culinarian',
    icon: 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/culinarian.png',
  },
]

function AppHeader({ user }: { user: User }) {
  return (
    <>
      <div className="app-header">
        <a className="app-header-brand" href="#crafting-log">
          <img src={appLogo} alt="" />
          <span>Roadmap to Crafting Log</span>
        </a>
        <AccountActions user={user} />
      </div>
      <footer className="app-footer">
        <span>© 2026 Roadmap to Crafting Log</span>
        <span>Planifica, reúne y completa tu crafting log.</span>
        <a href="https://github.com/DiegoVC96/Roadmap-to-Crafting-Log" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </>
  )
}

function buildCraftingGraph(
  node: CraftingTreeNode,
  nodes = new Map<string, CraftingGraphNode>(),
  edges = new Map<string, CraftingGraphEdge>(),
) {
  const nodeId = `item-${node.itemId}`
  const current = nodes.get(nodeId)
  nodes.set(nodeId, {
    id: nodeId,
    itemId: node.itemId,
    name: node.name,
    iconPath: node.iconPath,
    quantity: Math.max(current?.quantity ?? 0, node.quantity),
    description:
      node.crafts === null
        ? 'Reunir, comprar u obtener'
        : `${node.crafter} · fabricar ×${node.crafts.toLocaleString()}`,
  })

  for (const child of node.children) {
    const childId = `item-${child.itemId}`
    edges.set(`${childId}-${nodeId}`, { from: childId, to: nodeId })
    buildCraftingGraph(child, nodes, edges)
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isAccessLoading, setIsAccessLoading] = useState(false)
  const [accessState, setAccessState] = useState<AccessState>({
    status: 'pending',
    isAdmin: false,
  })
  const [selectedCrafterId, setSelectedCrafterId] = useState<CrafterId>(
    crafters[0].id,
  )
  const [recipes, setRecipes] = useState<FfxivRecipe[]>([])
  const hasLoadedRecipes = recipes.length > 0
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoringCatalog, setIsRestoringCatalog] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [materialSearchText, setMaterialSearchText] = useState('')
  const [materialStatusFilter, setMaterialStatusFilter] = useState<
    'all' | 'missing' | 'collected' | 'session'
  >('all')
  const [materialSort, setMaterialSort] = useState<'remaining' | 'name'>(
    'remaining',
  )
  const [materialCrafterScope, setMaterialCrafterScope] = useState<
    'all' | CrafterId
  >('all')
  const [materialLevelScope, setMaterialLevelScope] = useState('all')
  const [recipeFilter, setRecipeFilter] = useState<
    'all' | 'pending' | 'completed'
  >('all')
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState<
    'level' | 'special' | 'master'
  >('level')
  const [levelFilter, setLevelFilter] = useState('all')
  const [isMaterialsRoadmapOpen, setIsMaterialsRoadmapOpen] = useState(false)
  const [isCraftingAssistantOpen, setIsCraftingAssistantOpen] = useState(false)
  const [isDataAgentOpen, setIsDataAgentOpen] = useState(false)
  const [isRunningDataAudit, setIsRunningDataAudit] = useState(false)
  const [dataAuditProgress, setDataAuditProgress] = useState({ current: 0, total: 0 })
  const [dataAuditError, setDataAuditError] = useState<string | null>(null)
  const [missingSourceMaterials, setMissingSourceMaterials] = useState<BaseMaterialTotal[]>([])
  const [dataAuditSourceFailures, setDataAuditSourceFailures] = useState(0)
  const [isFreeTrialStorageOpen, setIsFreeTrialStorageOpen] = useState(false)
  const [freeTrialSearchText, setFreeTrialSearchText] = useState('')
  const [freeTrialStorageByItemId, setFreeTrialStorageByItemId] = useState<
    Record<string, FreeTrialStorageLocation>
  >({})
  const [freeTrialStorageMessage, setFreeTrialStorageMessage] = useState<string | null>(null)
  const [isVendorShoppingOpen, setIsVendorShoppingOpen] = useState(false)
  const [vendorShoppingItems, setVendorShoppingItems] = useState<
    VendorShoppingItem[]
  >([])
  const [isLoadingVendorShopping, setIsLoadingVendorShopping] = useState(false)
  const [vendorShoppingProgress, setVendorShoppingProgress] = useState({
    current: 0,
    total: 0,
  })
  const [vendorShoppingError, setVendorShoppingError] = useState<string | null>(null)
  const [isSmartPlanOpen, setIsSmartPlanOpen] = useState(false)
  const [smartPlanItems, setSmartPlanItems] = useState<SmartPlanItem[]>([])
  const [isLoadingSmartPlan, setIsLoadingSmartPlan] = useState(false)
  const [smartPlanProgress, setSmartPlanProgress] = useState({ current: 0, total: 0 })
  const [smartPlanError, setSmartPlanError] = useState<string | null>(null)
  const [isRecipeCostOpen, setIsRecipeCostOpen] = useState(false)
  const [selectedCostRecipe, setSelectedCostRecipe] = useState<FfxivRecipe | null>(null)
  const [recipeCostItems, setRecipeCostItems] = useState<SmartPlanItem[]>([])
  const [recipeMarketPrice, setRecipeMarketPrice] = useState<number | null>(null)
  const [isLoadingRecipeCost, setIsLoadingRecipeCost] = useState(false)
  const [recipeCostError, setRecipeCostError] = useState<string | null>(null)
  const [marketScope, setMarketScope] = useState<MarketScope | null>(null)
  const [marketScopeType, setMarketScopeType] = useState<
    MarketScope['type']
  >('world')
  const [marketLocations, setMarketLocations] = useState<MarketLocations | null>(null)
  const [marketLocationsError, setMarketLocationsError] = useState<string | null>(null)
  const [marketPrices, setMarketPrices] = useState<Record<number, MarketPrice>>({})
  const [isLoadingMarketPrices, setIsLoadingMarketPrices] = useState(false)
  const [marketPricesError, setMarketPricesError] = useState<string | null>(null)
  const [isCraftingTreeOpen, setIsCraftingTreeOpen] = useState(false)
  const [selectedCraftingTreeRecipe, setSelectedCraftingTreeRecipe] =
    useState<FfxivRecipe | null>(null)
  const [craftingTreeSearchText, setCraftingTreeSearchText] = useState('')
  const [craftingTreePositions, setCraftingTreePositions] = useState<
    Record<string, CraftingGraphPosition>
  >({})
  const [draggedCraftingNodeId, setDraggedCraftingNodeId] = useState<string | null>(null)
  const craftingGraphRef = useRef<HTMLDivElement>(null)
  const [highlightedMaterialId, setHighlightedMaterialId] = useState<number | null>(null)
  const [selectedMaterialSource, setSelectedMaterialSource] =
    useState<BaseMaterialTotal | null>(null)
  const [itemSources, setItemSources] = useState<ItemSource[]>([])
  const [itemSourcesPage, setItemSourcesPage] = useState(1)
  const [isLoadingItemSources, setIsLoadingItemSources] = useState(false)
  const [isItemSourcesPageOpen, setIsItemSourcesPageOpen] = useState(false)
  const [itemSourcesError, setItemSourcesError] = useState<string | null>(null)
  const [completedRecipeIds, setCompletedRecipeIds] = useState<string[]>([])
  const [inventoryByItemId, setInventoryByItemId] = useState<
    Record<string, number>
  >({})
  const [farmingSessionItemIds, setFarmingSessionItemIds] = useState<number[]>([])
  const [loadedProgressUserId, setLoadedProgressUserId] = useState<string | null>(null)
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null)

  const selectedCrafter = crafters.find(
    (crafter) => crafter.id === selectedCrafterId,
  )!

  const completedRecipes = completedRecipeIds.filter((recipeId) =>
    recipes.some((recipe) => recipe.id === recipeId),
  )
  const totalRecipes = recipes.length
  const overallProgress =
    totalRecipes === 0
      ? 0
      : Math.round((completedRecipes.length / totalRecipes) * 100)

  const nextCraftingGoal = useMemo(() => {
    return crafters
      .map((crafter) => {
        const total = recipes.filter(
          (recipe) => recipe.crafter === crafter.id,
        ).length
        const completed = completedRecipeIds.filter((recipeId) =>
          recipes.some(
            (recipe) => recipe.id === recipeId && recipe.crafter === crafter.id,
          ),
        ).length

        return {
          crafter,
          total,
          completed,
          remaining: total - completed,
          percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
        }
      })
      .filter((goal) => goal.total > 0 && goal.remaining > 0)
      .sort(
        (first, second) =>
          second.percentage - first.percentage ||
          first.remaining - second.remaining,
      )[0]
  }, [completedRecipeIds, recipes])

  const craftingAssistantGoals = useMemo(() => {
    return crafters
      .map((crafter) => {
        const pendingLevelRecipes = recipes.filter(
          (recipe) =>
            recipe.crafter === crafter.id &&
            (recipe.category ?? 'level') === 'level' &&
            !completedRecipeIds.includes(recipe.id),
        )
        const nextRange = recipeLevelRanges.find((range) =>
          pendingLevelRecipes.some(
            (recipe) => getRecipeLevelRangeStart(recipe.level) === range.start,
          ),
        )

        return {
          crafter,
          pending: pendingLevelRecipes.length,
          nextRange,
          recipesInNextRange: nextRange
            ? pendingLevelRecipes.filter(
                (recipe) =>
                  getRecipeLevelRangeStart(recipe.level) === nextRange.start,
              ).length
            : 0,
        }
      })
      .filter((goal) => goal.pending > 0)
  }, [completedRecipeIds, recipes])

  const dataRecipeIssues = useMemo<DataRecipeIssue[]>(() => {
    return recipes.flatMap<DataRecipeIssue>((recipe) => {
      if (recipe.masterRecipeBook && recipe.category !== 'master') {
        return [{
          recipe,
          reason: `Tiene el libro ${recipe.masterRecipeBook}, pero no está marcada como Master Recipe.`,
          suggestedCategory: 'master',
        }]
      }

      if (recipe.category === 'master' && !recipe.masterRecipeBook) {
        return [{
          recipe,
          reason: 'Está marcada como Master Recipe, pero no indica un libro maestro.',
          suggestedCategory: 'special',
        }]
      }

      if (recipe.category === 'level' && recipe.level === null) {
        return [{
          recipe,
          reason: 'Es una receta Level-based sin nivel de receta.',
          suggestedCategory: 'special',
        }]
      }

      return []
    })
  }, [recipes])

  const recipesWithoutIcons = useMemo(
    () => recipes.filter((recipe) => !recipe.iconPath),
    [recipes],
  )

  const selectedRecipes = recipes.filter(
  (recipe) => recipe.crafter === selectedCrafterId,
)

const [selectedRecipe, setSelectedRecipe] = useState<FfxivRecipe | null>(null)
const [highlightedRecipeId, setHighlightedRecipeId] = useState<string | null>(null)
const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([])
const [isLoadingIngredients, setIsLoadingIngredients] = useState(false)
const [ingredientsError, setIngredientsError] = useState<string | null>(null)

const visibleSelectedRecipes = selectedRecipes.filter((recipe) => {
  const isCompleted = completedRecipeIds.includes(recipe.id)
  const matchesSearch = recipe.name
    .toLocaleLowerCase()
    .includes(searchText.trim().toLocaleLowerCase())

  const matchesFilter =
    recipeFilter === 'all' ||
    (recipeFilter === 'completed' && isCompleted) ||
    (recipeFilter === 'pending' && !isCompleted)

  const matchesLevel =
    levelFilter === 'all' ||
    getRecipeLevelRangeStart(recipe.level) === Number(levelFilter)

  const matchesCategory =
    (recipe.category ?? 'level') === recipeCategoryFilter

  return matchesSearch && matchesFilter && matchesLevel && matchesCategory
})

const visibleRecipesByLevelRange = recipeLevelRanges
  .map((range) => ({
    ...range,
    recipes: visibleSelectedRecipes.filter(
      (recipe) => getRecipeLevelRangeStart(recipe.level) === range.start,
    ),
  }))
  .filter((range) => range.recipes.length > 0)

const specialRecipeSections = [
  ['society', 'Society Quests'],
  ['housing', 'Housing'],
  ['other', 'Others'],
] as const

const visibleSpecialRecipesBySection = specialRecipeSections
  .map(([section, label]) => ({
    section,
    label,
    recipes: visibleSelectedRecipes.filter(
      (recipe) => recipe.specialSection === section,
    ),
  }))
  .filter((section) => section.recipes.length > 0)

const visibleRecipeGroups =
  recipeCategoryFilter === 'special'
    ? visibleSpecialRecipesBySection.map((section) => ({
        key: section.section,
        label: section.label,
        recipes: section.recipes,
      }))
    : visibleRecipesByLevelRange.map((range) => ({
        key: String(range.start),
        label: `Nivel ${range.label}`,
        recipes: range.recipes,
      }))

const materialTotals = useMemo(() => {
  return calculateBaseMaterialTotals(
    recipes,
    completedRecipeIds,
    (recipe) =>
      (materialCrafterScope === 'all' ||
        recipe.crafter === materialCrafterScope) &&
      (materialLevelScope === 'all' ||
        getMaterialLevelRangeStart(recipe.level) === Number(materialLevelScope)),
  )
}, [recipes, completedRecipeIds, materialCrafterScope, materialLevelScope])

const materialsWithoutIcons = useMemo(
  () => materialTotals.filter((material) => !material.iconPath),
  [materialTotals],
)

const recipeCraftTotals = useMemo(
  () => calculateRecipeCraftTotals(recipes, completedRecipeIds),
  [recipes, completedRecipeIds],
)

const craftingTreeSearchResults = useMemo(() => {
  const normalizedSearch = craftingTreeSearchText.trim().toLocaleLowerCase()

  return recipes
    .filter((recipe) =>
      recipe.name.toLocaleLowerCase().includes(normalizedSearch),
    )
    .slice(0, 60)
}, [craftingTreeSearchText, recipes])

const selectedCraftingTreeCrafts = selectedCraftingTreeRecipe
  ? recipeCraftTotals.get(selectedCraftingTreeRecipe.id) ?? 0
  : 0
const selectedCraftingTree = useMemo(
  () =>
    selectedCraftingTreeRecipe && selectedCraftingTreeCrafts > 0
      ? buildCraftingTree(
          selectedCraftingTreeRecipe,
          recipes,
          selectedCraftingTreeCrafts,
        )
      : null,
  [recipes, selectedCraftingTreeCrafts, selectedCraftingTreeRecipe],
)

const craftingGraph = useMemo(
  () =>
    selectedCraftingTree
      ? buildCraftingGraph(selectedCraftingTree)
      : { nodes: [], edges: [] },
  [selectedCraftingTree],
)

const craftingGraphLayout = useMemo(() => {
  const depths = new Map<string, number>()

  function getDepth(nodeId: string): number {
    const cached = depths.get(nodeId)
    if (cached !== undefined) {
      return cached
    }

    const inputs = craftingGraph.edges
      .filter((edge) => edge.to === nodeId)
      .map((edge) => edge.from)
    const depth = inputs.length === 0 ? 0 : Math.max(...inputs.map(getDepth)) + 1
    depths.set(nodeId, depth)
    return depth
  }

  const nodesByDepth = new Map<number, CraftingGraphNode[]>()
  for (const node of craftingGraph.nodes) {
    const depth = getDepth(node.id)
    const nodes = nodesByDepth.get(depth) ?? []
    nodes.push(node)
    nodesByDepth.set(depth, nodes)
  }

  const maxDepth = Math.max(...nodesByDepth.keys(), 0)
  const defaultPositions = new Map<string, CraftingGraphPosition>()
  let highestColumn = 0

  for (const [depth, nodes] of nodesByDepth) {
    nodes.sort((first, second) => first.name.localeCompare(second.name))
    highestColumn = Math.max(highestColumn, nodes.length)
    nodes.forEach((node, index) => {
      const savedKey = `${selectedCraftingTreeRecipe?.id}:${node.id}`
      defaultPositions.set(
        node.id,
        craftingTreePositions[savedKey] ?? {
          x: 42 + depth * 245,
          y: 48 + index * 125,
        },
      )
    })
  }

  return {
    positions: defaultPositions,
    width: Math.max(820, 42 + (maxDepth + 1) * 245),
    height: Math.max(460, 48 + highestColumn * 125),
  }
}, [craftingGraph, craftingTreePositions, selectedCraftingTreeRecipe?.id])

const vendorShoppingCost = useMemo(
  () =>
    vendorShoppingItems.reduce(
      (total, item) =>
        total + (item.unitPrice === null ? 0 : item.quantity * item.unitPrice),
      0,
    ),
  [vendorShoppingItems],
)
const vendorShoppingItemsWithoutPrice = vendorShoppingItems.filter(
  (item) => item.unitPrice === null,
).length
const marketShoppingCost = vendorShoppingItems.reduce(
  (total, item) =>
    total +
    ((marketPrices[item.material.itemId]?.pricePerUnit ?? 0) * item.quantity),
  0,
)

const materialCollectionSummary = useMemo(() => {
  const totalRequired = materialTotals.reduce(
    (total, material) => total + material.quantity,
    0,
  )
  const owned = materialTotals.reduce(
    (total, material) =>
      total +
      Math.min(
        material.quantity,
        inventoryByItemId[String(material.itemId)] ?? 0,
      ),
    0,
  )
  const completedMaterialTypes = materialTotals.filter(
    (material) =>
      (inventoryByItemId[String(material.itemId)] ?? 0) >= material.quantity,
  ).length

  return {
    totalRequired,
    owned,
    remaining: Math.max(totalRequired - owned, 0),
    completedMaterialTypes,
    percentage:
      totalRequired === 0 ? 100 : Math.round((owned / totalRequired) * 100),
  }
}, [inventoryByItemId, materialTotals])

const freeTrialMaterials = useMemo(
  () =>
    materialTotals
      .map((material) => {
        const ownedQuantity = inventoryByItemId[String(material.itemId)] ?? 0
        const remainingQuantity = Math.max(material.quantity - ownedQuantity, 0)

        return {
          ...material,
          ownedQuantity,
          remainingQuantity,
          location: freeTrialStorageByItemId[String(material.itemId)] ?? null,
          isSessionItem: farmingSessionItemIds.includes(material.itemId),
        }
      })
      .filter((material) => material.remainingQuantity > 0)
      .sort(
        (first, second) =>
          Number(second.isSessionItem) - Number(first.isSessionItem) ||
          Number(second.ownedQuantity > 0) - Number(first.ownedQuantity > 0) ||
          second.remainingQuantity - first.remainingQuantity ||
          first.name.localeCompare(second.name),
      ),
  [
    farmingSessionItemIds,
    freeTrialStorageByItemId,
    inventoryByItemId,
    materialTotals,
  ],
)

const freeTrialStorageSummary = useMemo(() => {
  const inventory = freeTrialMaterials.filter(
    (material) => material.location === 'inventory',
  ).length
  const saddlebag = freeTrialMaterials.filter(
    (material) => material.location === 'saddlebag',
  ).length

  return {
    inventory,
    saddlebag,
    unassigned: freeTrialMaterials.length - inventory - saddlebag,
  }
}, [freeTrialMaterials])

const visibleFreeTrialMaterials = useMemo(() => {
  const search = freeTrialSearchText.trim().toLocaleLowerCase()

  return freeTrialMaterials.filter((material) =>
    material.name.toLocaleLowerCase().includes(search),
  )
}, [freeTrialMaterials, freeTrialSearchText])

const visibleMaterialTotals = useMemo(() => {
  const normalizedSearch = materialSearchText.trim().toLocaleLowerCase()

  return materialTotals
    .filter((material) => {
      const ownedQuantity = inventoryByItemId[String(material.itemId)] ?? 0
      const remainingQuantity = Math.max(material.quantity - ownedQuantity, 0)
      const matchesStatus =
        materialStatusFilter === 'all' ||
        (materialStatusFilter === 'missing' && remainingQuantity > 0) ||
        (materialStatusFilter === 'collected' && remainingQuantity === 0) ||
        (materialStatusFilter === 'session' &&
          farmingSessionItemIds.includes(material.itemId))

      return (
        matchesStatus &&
        material.name.toLocaleLowerCase().includes(normalizedSearch)
      )
    })
    .sort((first, second) => {
      if (materialSort === 'name') {
        return first.name.localeCompare(second.name)
      }

      const firstRemaining = Math.max(
        first.quantity - (inventoryByItemId[String(first.itemId)] ?? 0),
        0,
      )
      const secondRemaining = Math.max(
        second.quantity - (inventoryByItemId[String(second.itemId)] ?? 0),
        0,
      )

      return (
        secondRemaining - firstRemaining || first.name.localeCompare(second.name)
      )
    })
}, [
  inventoryByItemId,
  farmingSessionItemIds,
  materialSearchText,
  materialSort,
  materialStatusFilter,
  materialTotals,
])

function getCompletedCount(crafter: Crafter) {
  return recipes.filter(
    (recipe) =>
      recipe.crafter === crafter.id &&
      completedRecipeIds.includes(recipe.id),
  ).length
}

function selectCrafterFromMenu(crafterId: CrafterId) {
  const firstPendingRange = recipeLevelRanges.find((range) =>
    recipes.some(
      (recipe) =>
        recipe.crafter === crafterId &&
        (recipe.category ?? 'level') === 'level' &&
        !completedRecipeIds.includes(recipe.id) &&
        getRecipeLevelRangeStart(recipe.level) === range.start,
    ),
  )

  setSelectedCrafterId(crafterId)
  setSearchText('')
  setSelectedRecipe(null)
  setRecipeCategoryFilter('level')
  setRecipeFilter('pending')
  setLevelFilter(firstPendingRange ? String(firstPendingRange.start) : 'all')
}

function toggleRecipe(recipeId: string) {
  setCompletedRecipeIds((currentIds) =>
    currentIds.includes(recipeId)
      ? currentIds.filter((id) => id !== recipeId)
      : [...currentIds, recipeId],
  )
}

function openNextCraftingGoal() {
  if (!nextCraftingGoal) {
    return
  }

  setSelectedCrafterId(nextCraftingGoal.crafter.id)
  setSearchText('')
  setLevelFilter('all')
  setRecipeFilter('pending')
  window.requestAnimationFrame(() => {
    document.getElementById('crafting-log')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  })
}

function resetProgress() {
  const shouldReset = window.confirm(
    '¿Quieres borrar todas las recetas marcadas como completadas?',
  )

  if (shouldReset) {
    setCompletedRecipeIds([])
  }
}

function resetInventory() {
  const shouldReset = window.confirm(
    '¿Quieres borrar todas las cantidades registradas en tu inventario? Tus recetas completadas no se modificarán.',
  )

  if (shouldReset) {
    setInventoryByItemId({})
  }
}

function updateInventory(itemId: number, value: string) {
  const parsedQuantity = Number(value)
  const quantity = Number.isFinite(parsedQuantity)
    ? Math.max(0, Math.floor(parsedQuantity))
    : 0

  setInventoryByItemId((currentInventory) => ({
    ...currentInventory,
    [itemId]: quantity,
  }))
}

function toggleFarmingSession(itemId: number) {
  setFarmingSessionItemIds((currentItemIds) =>
    currentItemIds.includes(itemId)
      ? currentItemIds.filter((currentItemId) => currentItemId !== itemId)
      : [...currentItemIds, itemId],
  )
}

function assignFreeTrialStorage(
  itemId: number,
  location: FreeTrialStorageLocation,
) {
  const itemKey = String(itemId)
  const currentLocation = freeTrialStorageByItemId[itemKey]

  if (currentLocation === location) {
    setFreeTrialStorageByItemId((current) => {
      const next = { ...current }
      delete next[itemKey]
      return next
    })
    setFreeTrialStorageMessage('Material quitado de la distribución.')
    return
  }

  const usedSlots = Object.entries(freeTrialStorageByItemId).filter(
    ([savedItemId, savedLocation]) =>
      savedItemId !== itemKey && savedLocation === location,
  ).length
  const limit = location === 'inventory' ? 140 : 70

  if (usedSlots >= limit) {
    setFreeTrialStorageMessage(
      location === 'inventory'
        ? 'Tus 140 espacios de inventario ya están asignados.'
        : 'Tus 70 espacios de alforja ya están asignados.',
    )
    return
  }

  setFreeTrialStorageByItemId((current) => ({
    ...current,
    [itemKey]: location,
  }))
  setFreeTrialStorageMessage(
    location === 'inventory'
      ? 'Material reservado para el inventario.'
      : 'Material reservado para la alforja de chocobo.',
  )
}

function applyFreeTrialSuggestion() {
  const suggestion: Record<string, FreeTrialStorageLocation> = {}

  freeTrialMaterials.forEach((material, index) => {
    if (index < 140) {
      suggestion[String(material.itemId)] = 'inventory'
    } else if (index < 210) {
      suggestion[String(material.itemId)] = 'saddlebag'
    }
  })

  setFreeTrialStorageByItemId(suggestion)
  setFreeTrialStorageMessage(
    'Distribución sugerida aplicada: primero materiales de tu sesión, después materiales que ya tienes y los de mayor cantidad pendiente.',
  )
}

function downloadMaterialList() {
  const escapeCsvValue = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`
  const rows = visibleMaterialTotals.map((material) => {
    const ownedQuantity = inventoryByItemId[String(material.itemId)] ?? 0
    const remainingQuantity = Math.max(material.quantity - ownedQuantity, 0)

    return [
      material.name,
      material.quantity,
      ownedQuantity,
      remainingQuantity,
    ]
      .map(escapeCsvValue)
      .join(';')
  })
  const csv = [
    'Material;Total necesario;En inventario;Por conseguir',
    ...rows,
  ].join('\n')
  const file = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const downloadUrl = URL.createObjectURL(file)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = 'roadmap-materiales-pendientes.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

async function handleOpenIngredients(recipe: FfxivRecipe) {
  setSelectedRecipe(recipe)
  setRecipeIngredients([])
  setIngredientsError(null)
  setIsLoadingIngredients(true)

  try {
    const ingredients = await loadRecipeIngredients(recipe.rowId)
    setRecipeIngredients(ingredients)
  } catch (error) {
    setIngredientsError(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los materiales.',
    )
  } finally {
    setIsLoadingIngredients(false)
  }
}

function openCraftingRecipe(recipe: FfxivRecipe) {
  setIsItemSourcesPageOpen(false)
  setIsMaterialsRoadmapOpen(false)
  setSelectedCrafterId(recipe.crafter)
  setSearchText('')
  setRecipeFilter('all')
  setLevelFilter('all')
  setHighlightedRecipeId(recipe.id)
  void handleOpenIngredients(recipe)
}

function openCraftingTree(recipe: FfxivRecipe | null = null) {
  setIsItemSourcesPageOpen(false)
  setIsMaterialsRoadmapOpen(false)
  setSelectedCraftingTreeRecipe(recipe)
  setCraftingTreeSearchText('')
  setDraggedCraftingNodeId(null)
  setIsCraftingTreeOpen(true)
}

function handleCraftingNodePointerDown(
  event: PointerEvent<HTMLButtonElement>,
  nodeId: string,
) {
  event.currentTarget.setPointerCapture(event.pointerId)
  setDraggedCraftingNodeId(nodeId)
}

function handleCraftingGraphPointerMove(event: PointerEvent<HTMLDivElement>) {
  if (!draggedCraftingNodeId || !craftingGraphRef.current || !selectedCraftingTreeRecipe) {
    return
  }

  const bounds = craftingGraphRef.current.getBoundingClientRect()
  const x = Math.max(10, event.clientX - bounds.left - 88)
  const y = Math.max(10, event.clientY - bounds.top - 42)
  const savedKey = `${selectedCraftingTreeRecipe.id}:${draggedCraftingNodeId}`

  setCraftingTreePositions((current) => ({
    ...current,
    [savedKey]: { x, y },
  }))
}

function openVendorShoppingList() {
  const materialsToCheck = materialTotals
    .map((material) => ({
      material,
      quantity: Math.max(
        material.quantity - (inventoryByItemId[String(material.itemId)] ?? 0),
        0,
      ),
    }))
    .filter(({ quantity }) => quantity > 0)

  setIsItemSourcesPageOpen(false)
  setIsVendorShoppingOpen(true)
  setVendorShoppingItems([])
  setVendorShoppingError(null)
  setVendorShoppingProgress({ current: 0, total: materialsToCheck.length })
  setIsLoadingVendorShopping(true)

  async function loadVendorShoppingList() {
    const shoppingItems: VendorShoppingItem[] = []
    let checkedMaterials = 0
    let failedMaterials = 0
    const batchSize = 6

    for (let index = 0; index < materialsToCheck.length; index += batchSize) {
      const batch = materialsToCheck.slice(index, index + batchSize)
      const batchResults = await Promise.all(
        batch.map(async ({ material, quantity }) => {
          try {
            const vendors = (await loadItemSources(material.itemId)).filter(
              (source) => source.kind === 'vendor',
            )
            const unitPrice = vendors.find(
              (vendor) => typeof vendor.price === 'number',
            )?.price

            return vendors.length > 0
              ? {
                  material,
                  quantity,
                  vendors,
                  unitPrice: unitPrice ?? null,
                }
              : null
          } catch {
            failedMaterials += 1
            return null
          } finally {
            checkedMaterials += 1
          }
        }),
      )

      shoppingItems.push(
        ...(batchResults.filter(
          (item): item is VendorShoppingItem => item !== null,
        )),
      )
      setVendorShoppingItems([...shoppingItems])
      setVendorShoppingProgress({
        current: checkedMaterials,
        total: materialsToCheck.length,
      })
    }

    if (failedMaterials > 0) {
      setVendorShoppingError(
        `No pudimos consultar ${failedMaterials} materiales. Puedes volver a intentarlo más tarde.`,
      )
    }

    setIsLoadingVendorShopping(false)
  }

  void loadVendorShoppingList()
}

async function buildSmartPlan(
  materials: AcquisitionMaterial[],
  onProgress: (current: number, total: number) => void,
) {
  const sourcesByItemId = new Map<number, ItemSource[]>()
  const batchSize = 6
  let checkedMaterials = 0

  for (let index = 0; index < materials.length; index += batchSize) {
    const batch = materials.slice(index, index + batchSize)

    await Promise.all(
      batch.map(async (material) => {
        try {
          sourcesByItemId.set(material.itemId, await loadItemSources(material.itemId))
        } catch {
          sourcesByItemId.set(material.itemId, [])
        } finally {
          checkedMaterials += 1
        }
      }),
    )
    onProgress(checkedMaterials, materials.length)
  }

  const marketPricesByItemId = marketScope
    ? await loadMarketPrices(
        marketScope,
        materials.map((material) => material.itemId),
      )
    : new Map<number, MarketPrice>()

  return materials
    .map((material) =>
      chooseSmartMethod(
        material,
        sourcesByItemId.get(material.itemId) ?? [],
        marketPricesByItemId.get(material.itemId)?.pricePerUnit ?? null,
      ),
    )
    .sort(
      (first, second) =>
        first.method.localeCompare(second.method) ||
        second.material.quantity - first.material.quantity ||
        first.material.name.localeCompare(second.material.name),
    )
}

function openSmartPlan() {
  const materials = materialTotals
    .map((material) => ({
      itemId: material.itemId,
      name: material.name,
      iconPath: material.iconPath,
      quantity: Math.max(
        material.quantity - (inventoryByItemId[String(material.itemId)] ?? 0),
        0,
      ),
    }))
    .filter((material) => material.quantity > 0)

  setIsSmartPlanOpen(true)
  setSmartPlanItems([])
  setSmartPlanError(null)
  setSmartPlanProgress({ current: 0, total: materials.length })
  setIsLoadingSmartPlan(true)

  void buildSmartPlan(materials, (current, total) =>
    setSmartPlanProgress({ current, total }),
  )
    .then((items) => setSmartPlanItems(items))
    .catch(() =>
      setSmartPlanError(
        'No pudimos crear el plan inteligente. Revisa tu conexión e inténtalo nuevamente.',
      ),
    )
    .finally(() => setIsLoadingSmartPlan(false))
}

function openRecipeCostComparison(recipe: FfxivRecipe) {
  const crafts = recipeCraftTotals.get(recipe.id) ?? 0
  const tree = buildCraftingTree(recipe, recipes, Math.max(crafts, 1))
  const materials = [...collectBaseMaterials(tree).values()]

  setIsRecipeCostOpen(true)
  setSelectedCostRecipe(recipe)
  setRecipeCostItems([])
  setRecipeMarketPrice(null)
  setRecipeCostError(null)
  setIsLoadingRecipeCost(true)

  void Promise.all([
    buildSmartPlan(materials, () => undefined),
    marketScope
      ? loadMarketPrices(marketScope, [recipe.resultItemId])
      : Promise.resolve(new Map<number, MarketPrice>()),
  ])
    .then(([items, prices]) => {
      setRecipeCostItems(items)
      setRecipeMarketPrice(prices.get(recipe.resultItemId)?.pricePerUnit ?? null)
    })
    .catch(() =>
      setRecipeCostError(
        'No pudimos calcular el coste de esta receta. Revisa tu conexión e inténtalo nuevamente.',
      ),
    )
    .finally(() => setIsLoadingRecipeCost(false))
}

function openMaterialTotal(materialId: number) {
  setIsMaterialsRoadmapOpen(true)
  setHighlightedMaterialId(materialId)
}

async function openItemSources(material: BaseMaterialTotal) {
  setIsItemSourcesPageOpen(true)
  setSelectedMaterialSource(material)
  setItemSources([])
  setItemSourcesPage(1)
  setItemSourcesError(null)
  setIsLoadingItemSources(true)

  try {
    const sources = await loadItemSources(material.itemId)
    setItemSources(sources)
  } catch (error) {
    setItemSourcesError(
      error instanceof Error
        ? error.message
        : 'No se pudo cargar la guía de obtención.',
    )
  } finally {
    setIsLoadingItemSources(false)
  }
}

function runDataAudit() {
  const materials = materialTotals.filter(
    (material) => material.quantity > 0,
  )

  setIsRunningDataAudit(true)
  setDataAuditError(null)
  setMissingSourceMaterials([])
  setDataAuditSourceFailures(0)
  setDataAuditProgress({ current: 0, total: materials.length })

  void (async () => {
    const materialsWithoutSources: BaseMaterialTotal[] = []
    let failedRequests = 0
    let checked = 0
    const batchSize = 6

    for (let index = 0; index < materials.length; index += batchSize) {
      const batch = materials.slice(index, index + batchSize)
      await Promise.all(
        batch.map(async (material) => {
          try {
            const sources = await loadItemSources(material.itemId)
            if (sources.length === 0) {
              materialsWithoutSources.push(material)
            }
          } catch {
            failedRequests += 1
          } finally {
            checked += 1
            setDataAuditProgress({ current: checked, total: materials.length })
          }
        }),
      )
    }

    setMissingSourceMaterials(
      materialsWithoutSources.sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    )
    setDataAuditSourceFailures(failedRequests)
  })()
    .catch(() => {
      setDataAuditError(
        'No pudimos terminar la revisión de fuentes. Inténtalo nuevamente.',
      )
    })
    .finally(() => setIsRunningDataAudit(false))
}

const craftingRecipeForSelectedMaterial = selectedMaterialSource
  ? recipes.find(
      (recipe) => recipe.resultItemId === selectedMaterialSource.itemId,
    )
  : undefined

useEffect(() => {
  if (!highlightedRecipeId) {
    return
  }

  const targetRecipe = document.getElementById(
    `recipe-${highlightedRecipeId}`,
  )

  targetRecipe?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}, [highlightedRecipeId, selectedCrafterId, recipes])

useEffect(() => {
  if (!highlightedMaterialId || !isMaterialsRoadmapOpen) {
    return
  }

  const targetMaterial = document.getElementById(
    `material-total-${highlightedMaterialId}`,
  )

  targetMaterial?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}, [highlightedMaterialId, isMaterialsRoadmapOpen, materialTotals])

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user && !user.emailVerified) {
      void signOut(auth)
      return
    }

    setCurrentUser(user)
    if (!user) {
      setCompletedRecipeIds([])
      setLoadedProgressUserId(null)
    }
    setIsAuthLoading(false)
  })

  return unsubscribe
}, [])

useEffect(() => {
  let isActive = true
  const userId = currentUser?.uid
  const email = currentUser?.email

  if (!userId || !email) {
    return () => {
      isActive = false
    }
  }

  const activeUserId = userId
  const activeEmail = email

  async function checkAccess() {
    if (isActive) {
      setIsAccessLoading(true)
    }

    try {
      await requestAccess(activeUserId, activeEmail)
      const nextAccessState = await loadAccessState(activeUserId)

      if (isActive) {
        setAccessState(nextAccessState)
      }
    } catch {
      if (isActive) {
        setAccessState({ status: 'pending', isAdmin: false })
      }
    } finally {
      if (isActive) {
        setIsAccessLoading(false)
      }
    }
  }

  void checkAccess()

  return () => {
    isActive = false
  }
}, [currentUser?.uid, currentUser?.email])

useEffect(() => {
  let isActive = true
  const userId = currentUser?.uid

  if (!userId || accessState.status !== 'approved') {
    return () => {
      isActive = false
    }
  }

  const activeUserId = userId

  async function restoreUserProgress() {
    if (isActive) {
      setLoadedProgressUserId(null)
      setProgressSyncError(null)
    }

    try {
      const savedProgress = await loadUserProgress(activeUserId)

      if (isActive) {
        setCompletedRecipeIds(savedProgress.completedRecipeIds)
        setInventoryByItemId(savedProgress.inventoryByItemId)
        setFarmingSessionItemIds(savedProgress.farmingSessionItemIds)
        setMarketScope(savedProgress.marketScope)
        setFreeTrialStorageByItemId(savedProgress.freeTrialStorageByItemId)
        setCraftingTreePositions(savedProgress.craftingTreePositions)
        setMarketScopeType(savedProgress.marketScope?.type ?? 'world')
      }
    } catch {
      if (isActive) {
        setProgressSyncError(
          'No pudimos cargar tu progreso guardado. Reintenta en unos minutos.',
        )
      }
    } finally {
      if (isActive) {
        setLoadedProgressUserId(activeUserId)
      }
    }
  }

  void restoreUserProgress()

  return () => {
    isActive = false
  }
}, [currentUser?.uid, accessState.status])

useEffect(() => {
  const userId = currentUser?.uid

  if (
    !userId ||
    accessState.status !== 'approved' ||
    loadedProgressUserId !== userId
  ) {
    return
  }

  const saveTimeout = window.setTimeout(() => {
    void saveUserProgress(userId, {
      completedRecipeIds,
      inventoryByItemId,
      farmingSessionItemIds,
      marketScope,
      freeTrialStorageByItemId,
      craftingTreePositions,
    }).catch(() => {
      setProgressSyncError(
        'No pudimos guardar el último cambio. Revisa tu conexión e inténtalo nuevamente.',
      )
    })
  }, 500)

  return () => window.clearTimeout(saveTimeout)
}, [
  completedRecipeIds,
  inventoryByItemId,
  farmingSessionItemIds,
  marketScope,
  freeTrialStorageByItemId,
  craftingTreePositions,
  currentUser?.uid,
  loadedProgressUserId,
  accessState.status,
])

useEffect(() => {
  if (!isVendorShoppingOpen || marketLocations) {
    return
  }

  let isActive = true

  void Promise.resolve().then(() => {
    if (!isActive) {
      return
    }

    setMarketLocationsError(null)
    return loadMarketLocations()
      .then((locations) => {
        if (isActive) {
          setMarketLocations(locations)
        }
      })
      .catch(() => {
        if (isActive) {
          setMarketLocationsError(
            'No pudimos cargar la lista de mundos y Data Centers.',
          )
        }
      })
  })

  return () => {
    isActive = false
  }
}, [isVendorShoppingOpen, marketLocations])

useEffect(() => {
  if (
    !isVendorShoppingOpen ||
    isLoadingVendorShopping ||
    !marketScope ||
    vendorShoppingItems.length === 0
  ) {
    return
  }

  let isActive = true

  void Promise.resolve().then(() => {
    if (!isActive) {
      return
    }

    setIsLoadingMarketPrices(true)
    setMarketPricesError(null)
    return loadMarketPrices(
      marketScope,
      vendorShoppingItems.map((item) => item.material.itemId),
    )
      .then((prices) => {
        if (isActive) {
          setMarketPrices(Object.fromEntries(prices))
        }
      })
      .catch(() => {
        if (isActive) {
          setMarketPrices({})
          setMarketPricesError(
            'No pudimos cargar los precios de Market Board. Inténtalo nuevamente en unos minutos.',
          )
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingMarketPrices(false)
        }
      })
  })

  return () => {
    isActive = false
  }
}, [
  isLoadingVendorShopping,
  isVendorShoppingOpen,
  marketScope,
  vendorShoppingItems,
])

useEffect(() => {
  let isActive = true

  async function restoreRecipeCatalog() {
    try {
      const storedRecipes = await readRecipeCatalog()

      if (isActive && storedRecipes?.length) {
        setRecipes(storedRecipes)
      }
    } finally {
      if (isActive) {
        setIsRestoringCatalog(false)
      }
    }
  }

  void restoreRecipeCatalog()

  return () => {
    isActive = false
  }
}, [])

  async function handleLoadRecipes() {
    setIsLoading(true)
    setLoadError(null)

    try {
      const loadedRecipes = await loadAllRecipes()

      setRecipes(loadedRecipes)
      try {
        await saveRecipeCatalog(loadedRecipes)
      } catch {
        // La aplicación seguirá funcionando aunque el navegador no permita guardar.
      }
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Ocurrió un error al cargar las recetas.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  if (isAuthLoading) {
    return (
      <main className="auth-page">
        <p className="empty-state">Comprobando tu sesión segura…</p>
      </main>
    )
  }

  if (!currentUser) {
    return <AuthScreen />
  }

  if (isAccessLoading) {
    return (
      <main className="auth-page">
        <p className="empty-state">Verificando tu acceso…</p>
      </main>
    )
  }

  if (accessState.status !== 'approved') {
    return (
      <PendingApprovalScreen
        user={currentUser}
        wasRejected={accessState.status === 'rejected'}
      />
    )
  }

  if (loadedProgressUserId !== currentUser.uid) {
    return (
      <main className="auth-page">
        <p className="empty-state">Cargando tu progreso guardado…</p>
      </main>
    )
  }

  if (isDataAgentOpen && accessState.isAdmin) {
    const hasAuditRun = dataAuditProgress.total > 0
    const visibleMissingSources = missingSourceMaterials.slice(0, 20)
    const visibleRecipeIssues = dataRecipeIssues.slice(0, 20)
    const visibleRecipesWithoutIcons = recipesWithoutIcons.slice(0, 12)
    const visibleMaterialsWithoutIcons = materialsWithoutIcons.slice(0, 12)

    return (
      <main className="app">
        <AppHeader user={currentUser} />
        <header className="hero">
          <p className="eyebrow">CONTROL DE CALIDAD</p>
          <img className="app-logo" src={appLogo} alt="Emblema de Roadmap to Crafting Log" />
          <h1>Agente de datos</h1>
          <p className="subtitle">
            Revisa la calidad del catálogo para que tu planificación siempre tenga datos confiables.
          </p>
        </header>

        <section className="data-agent-page">
          <button
            className="back-to-materials-button"
            type="button"
            onClick={() => setIsDataAgentOpen(false)}
          >
            ← Volver al crafting log
          </button>

          <div className="data-agent-heading">
            <div>
              <p className="section-label">REVISIÓN DEL CATÁLOGO</p>
              <h2>Detecta inconsistencias antes de planificar</h2>
              <p>
                Las categorías y los íconos se validan localmente. La comprobación de fuentes consulta la guía de obtención para cada material pendiente.
              </p>
            </div>
            <button
              className="data-agent-run-button"
              type="button"
              disabled={!hasLoadedRecipes || isRunningDataAudit}
              onClick={runDataAudit}
            >
              {isRunningDataAudit ? 'Revisando fuentes…' : 'Analizar datos'}
            </button>
          </div>

          {!hasLoadedRecipes ? (
            <p className="empty-state">Carga el crafting log para iniciar la revisión.</p>
          ) : (
            <>
              <div className="data-agent-summary">
                <article>
                  <span>Clasificación</span>
                  <strong>{dataRecipeIssues.length}</strong>
                  <small>recetas para revisar</small>
                </article>
                <article>
                  <span>Íconos</span>
                  <strong>{recipesWithoutIcons.length + materialsWithoutIcons.length}</strong>
                  <small>recetas o materiales sin imagen</small>
                </article>
                <article>
                  <span>Fuentes</span>
                  <strong>{hasAuditRun ? missingSourceMaterials.length : '—'}</strong>
                  <small>{hasAuditRun ? 'materiales sin fuente encontrada' : 'ejecuta el análisis para revisar'}</small>
                </article>
              </div>

              {isRunningDataAudit && (
                <div className="data-agent-progress" role="status">
                  <span>
                    Revisando fuentes: {dataAuditProgress.current.toLocaleString()} de {dataAuditProgress.total.toLocaleString()}
                  </span>
                  <i
                    style={{
                      width: `${dataAuditProgress.total === 0 ? 0 : (dataAuditProgress.current / dataAuditProgress.total) * 100}%`,
                    }}
                  />
                </div>
              )}

              {dataAuditError && <p className="error-message">{dataAuditError}</p>}

              <div className="data-agent-sections">
                <section>
                  <div className="data-agent-section-heading">
                    <div>
                      <p className="section-label">CATEGORÍAS</p>
                      <h3>Recetas potencialmente mal clasificadas</h3>
                    </div>
                    <strong>{dataRecipeIssues.length}</strong>
                  </div>
                  {visibleRecipeIssues.length === 0 ? (
                    <p className="data-agent-empty">No encontramos inconsistencias de categoría.</p>
                  ) : (
                    <div className="data-agent-list">
                      {visibleRecipeIssues.map((issue) => (
                        <button
                          key={issue.recipe.id}
                          type="button"
                          onClick={() => {
                            setIsDataAgentOpen(false)
                            setSelectedCrafterId(issue.recipe.crafter)
                            setRecipeCategoryFilter(issue.suggestedCategory)
                            setRecipeFilter('all')
                            setSearchText(issue.recipe.name)
                            setLevelFilter('all')
                          }}
                        >
                          {issue.recipe.iconPath && <img className="game-icon" src={getIconUrl(issue.recipe.iconPath)} alt="" />}
                          <span><strong>{issue.recipe.name}</strong><small>{issue.reason}</small></span>
                          <b>Revisar</b>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="data-agent-section-heading">
                    <div>
                      <p className="section-label">FUENTES</p>
                      <h3>Materiales sin fuente encontrada</h3>
                    </div>
                    <strong>{hasAuditRun ? missingSourceMaterials.length : '—'}</strong>
                  </div>
                  {!hasAuditRun ? (
                    <p className="data-agent-empty">Pulsa “Analizar datos” para comprobar las fuentes de tus materiales pendientes.</p>
                  ) : visibleMissingSources.length === 0 ? (
                    <p className="data-agent-empty">Todos los materiales revisados tienen al menos una fuente registrada.</p>
                  ) : (
                    <div className="data-agent-list">
                      {visibleMissingSources.map((material) => (
                        <button
                          key={material.itemId}
                          type="button"
                          onClick={() => {
                            setIsDataAgentOpen(false)
                            void openItemSources(material)
                          }}
                        >
                          {material.iconPath && <img className="game-icon" src={getIconUrl(material.iconPath)} alt="" />}
                          <span><strong>{material.name}</strong><small>Se necesitan ×{material.quantity.toLocaleString()} · abrir guía</small></span>
                          <b>Investigar</b>
                        </button>
                      ))}
                    </div>
                  )}
                  {dataAuditSourceFailures > 0 && (
                    <p className="data-agent-note">No se pudieron consultar {dataAuditSourceFailures} materiales por una respuesta temporal de la fuente de datos.</p>
                  )}
                </section>

                <section>
                  <div className="data-agent-section-heading">
                    <div>
                      <p className="section-label">IMÁGENES</p>
                      <h3>Íconos faltantes</h3>
                    </div>
                    <strong>{recipesWithoutIcons.length + materialsWithoutIcons.length}</strong>
                  </div>
                  {visibleRecipesWithoutIcons.length === 0 && visibleMaterialsWithoutIcons.length === 0 ? (
                    <p className="data-agent-empty">Todos los elementos pendientes de esta revisión tienen un ícono.</p>
                  ) : (
                    <div className="data-agent-list data-agent-icon-list">
                      {visibleRecipesWithoutIcons.map((recipe) => (
                        <button key={`recipe-${recipe.id}`} type="button" onClick={() => {
                          setIsDataAgentOpen(false)
                          setSelectedCrafterId(recipe.crafter)
                          setRecipeCategoryFilter(recipe.category)
                          setRecipeFilter('all')
                          setSearchText(recipe.name)
                        }}>
                          <span><strong>{recipe.name}</strong><small>Receta · {recipe.crafter}</small></span><b>Ver</b>
                        </button>
                      ))}
                      {visibleMaterialsWithoutIcons.map((material) => (
                        <button key={`material-${material.itemId}`} type="button" onClick={() => {
                          setIsDataAgentOpen(false)
                          void openItemSources(material)
                        }}>
                          <span><strong>{material.name}</strong><small>Material pendiente · ×{material.quantity.toLocaleString()}</small></span><b>Ver</b>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </section>
      </main>
    )
  }

  if (isCraftingAssistantOpen) {
    const primaryGoal =
      craftingAssistantGoals.find(
        (goal) => goal.crafter.id === nextCraftingGoal?.crafter.id,
      ) ?? craftingAssistantGoals[0]
    const pendingMaterialTypes = materialTotals.filter(
      (material) =>
        material.quantity - (inventoryByItemId[String(material.itemId)] ?? 0) > 0,
    ).length
    const reservedFreeTrialSlots =
      freeTrialStorageSummary.inventory + freeTrialStorageSummary.saddlebag

    return (
      <main className="app">
        <AppHeader user={currentUser} />
        <header className="hero">
          <p className="eyebrow">PLANIFICACIÓN PERSONAL</p>
          <img
            className="app-logo"
            src={appLogo}
            alt="Emblema de Roadmap to Crafting Log"
          />
          <h1>Asistente de crafting</h1>
          <p className="subtitle">
            Un plan claro para avanzar en tu crafting log, materiales y espacio Free Trial.
          </p>
        </header>

        <section className="crafting-assistant-page">
          <button
            className="back-to-materials-button"
            type="button"
            onClick={() => setIsCraftingAssistantOpen(false)}
          >
            ← Volver al crafting log
          </button>

          <div className="crafting-assistant-heading">
            <div>
              <p className="section-label">TU SIGUIENTE SESIÓN</p>
              <h2>Decide qué fabricar y qué preparar</h2>
              <p>
                El asistente toma tu progreso real y prioriza el próximo tramo de recetas por profesión.
              </p>
            </div>
          </div>

          <div className="assistant-summary" aria-label="Resumen del asistente">
            <article>
              <span>Recetas pendientes</span>
              <strong>{(totalRecipes - completedRecipes.length).toLocaleString()}</strong>
              <small>de {totalRecipes.toLocaleString()} en total</small>
            </article>
            <article>
              <span>Materiales por conseguir</span>
              <strong>{pendingMaterialTypes.toLocaleString()}</strong>
              <small>tipos de material pendientes</small>
            </article>
            <article>
              <span>Espacio Free Trial</span>
              <strong>{reservedFreeTrialSlots}/210</strong>
              <small>inventario y saddlebag asignados</small>
            </article>
          </div>

          {primaryGoal ? (
            <section className="assistant-recommendation">
              <img src={primaryGoal.crafter.icon} alt="" />
              <div>
                <p className="section-label">RECOMENDACIÓN PRINCIPAL</p>
                <h3>
                  {primaryGoal.crafter.id} · nivel {primaryGoal.nextRange?.label ?? 'pendiente'}
                </h3>
                <p>
                  Tienes {primaryGoal.recipesInNextRange.toLocaleString()} recetas pendientes en este tramo.
                  Empieza aquí para mantener el avance ordenado por niveles.
                </p>
              </div>
              <button
                className="assistant-primary-button"
                type="button"
                onClick={() => {
                  setIsCraftingAssistantOpen(false)
                  selectCrafterFromMenu(primaryGoal.crafter.id)
                  window.requestAnimationFrame(() => {
                    document.getElementById('crafting-log')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  })
                }}
              >
                Abrir recetas
              </button>
            </section>
          ) : (
            <section className="assistant-complete-state">
              <h3>¡Todo listo!</h3>
              <p>Completaste todas las recetas Level-based disponibles.</p>
            </section>
          )}

          {craftingAssistantGoals.length > 0 && (
            <section className="assistant-goals">
              <h3>Próximos tramos por profesión</h3>
              <div>
                {craftingAssistantGoals.map((goal) => (
                  <button
                    className="assistant-goal-row"
                    key={goal.crafter.id}
                    type="button"
                    onClick={() => {
                      setIsCraftingAssistantOpen(false)
                      selectCrafterFromMenu(goal.crafter.id)
                    }}
                  >
                    <img src={goal.crafter.icon} alt="" />
                    <span>
                      <strong>{goal.crafter.id}</strong>
                      <small>
                        Próximo: nivel {goal.nextRange?.label ?? 'pendiente'} · {goal.pending.toLocaleString()} por completar
                      </small>
                    </span>
                    <b>{goal.recipesInNextRange} recetas</b>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="assistant-actions">
            <button
              className="smart-plan-button"
              type="button"
              onClick={() => {
                setIsCraftingAssistantOpen(false)
                openSmartPlan()
              }}
            >
              Generar plan inteligente
            </button>
            <button
              className="free-trial-button"
              type="button"
              onClick={() => {
                setIsCraftingAssistantOpen(false)
                setIsFreeTrialStorageOpen(true)
              }}
            >
              Revisar mochila Free Trial
            </button>
            <button
              className="materials-roadmap-button"
              type="button"
              onClick={() => {
                setIsCraftingAssistantOpen(false)
                setIsMaterialsRoadmapOpen(true)
              }}
            >
              Ver materiales pendientes
            </button>
          </section>
        </section>
      </main>
    )
  }

  if (isItemSourcesPageOpen && selectedMaterialSource) {
  const ownedQuantity =
    inventoryByItemId[String(selectedMaterialSource.itemId)] ?? 0
  const remainingQuantity = Math.max(
    selectedMaterialSource.quantity - ownedQuantity,
    0,
  )
  const isInFarmingSession = farmingSessionItemIds.includes(
    selectedMaterialSource.itemId,
  )
  const itemSourcesPerPage = 5
  const totalItemSourcePages = Math.max(
    1,
    Math.ceil(itemSources.length / itemSourcesPerPage),
  )
  const visibleItemSources = itemSources.slice(
    (itemSourcesPage - 1) * itemSourcesPerPage,
    itemSourcesPage * itemSourcesPerPage,
  )

  return (
    <main className="app">
      <AppHeader user={currentUser} />
      <header className="hero">
        <p className="eyebrow">FINAL FANTASY XIV</p>
        <img
          className="app-logo"
          src={appLogo}
          alt="Emblema de Roadmap to Crafting Log"
        />
        <h1>Guía de obtención</h1>
        <p className="subtitle">
          Alternativas para conseguir materiales sin fabricarlos.
        </p>
        {progressSyncError && <p className="progress-sync-error">{progressSyncError}</p>}
      </header>

      <section className="material-guide-page">
        <button
          className="back-to-materials-button"
          type="button"
          onClick={() => setIsItemSourcesPageOpen(false)}
        >
          ← Volver a materiales pendientes
        </button>

        <div className="material-guide-heading">
          {selectedMaterialSource.iconPath ? (
            <img
              className="material-guide-icon"
              src={getIconUrl(selectedMaterialSource.iconPath)}
              alt=""
            />
          ) : null}

          <div>
            <p className="section-label">MATERIAL PENDIENTE</p>
            <h2>{selectedMaterialSource.name}</h2>
            <strong>
              Total necesario ×{selectedMaterialSource.quantity.toLocaleString()}
            </strong>
            <p className="material-inventory-summary">
              Ya tienes ×{ownedQuantity.toLocaleString()} · Te faltan ×
              {remainingQuantity.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="material-guide-content">
        <section className="material-sources-panel material-guide-sources">
          <div className="material-breakdown">
            <h3>Por qué necesitas este material</h3>
            <ul>
              {selectedMaterialSource.breakdown.map((entry) => (
                <li key={`${entry.recipeId}-${entry.kind}`}>
                  <div>
                    <strong>{entry.recipeName}</strong>
                    <small>
                      {entry.kind === 'intermediate'
                        ? `${entry.crafter} · fabricar ×${entry.crafts.toLocaleString()} para otras recetas`
                        : `${entry.crafter} · receta pendiente del log`}
                    </small>
                  </div>
                  <b>×{entry.quantity.toLocaleString()}</b>
                </li>
              ))}
            </ul>
          </div>

          <button
            className={`farming-session-button ${
              isInFarmingSession ? 'is-active' : ''
            }`}
            type="button"
            onClick={() => toggleFarmingSession(selectedMaterialSource.itemId)}
          >
            {isInFarmingSession
              ? '✓ En tu sesión de recolección'
              : '+ Añadir a mi sesión de recolección'}
          </button>

          <h3>Cómo obtener este material</h3>

          {isLoadingItemSources && (
            <p>Buscando fuentes de obtención…</p>
          )}

          {itemSourcesError && (
            <p className="error-message">{itemSourcesError}</p>
          )}

          {!isLoadingItemSources &&
  !itemSourcesError &&
  itemSources.length === 0 && (
    <>
      {craftingRecipeForSelectedMaterial ? (
        <div className="crafting-only-notice">
          <p>
            Este material no tiene una fuente registrada por recolección,
            vendedor ni misión. Para el crafting log, debes fabricarlo.
          </p>

          <button
            className="crafting-only-button"
            type="button"
            onClick={() => openCraftingRecipe(craftingRecipeForSelectedMaterial)}
          >
            Ir a {craftingRecipeForSelectedMaterial.crafter}: {' '}
            {craftingRecipeForSelectedMaterial.name}
          </button>
        </div>
      ) : (
        <p>
          No encontramos una fuente de recolección, vendedor, misión ni receta
          de crafting para este material. Puede provenir de contenido especial
          o del Market Board.
        </p>
      )}
    </>
  )}

          {!isLoadingItemSources && itemSources.length > 0 && (
            <>
            <ul className="item-source-list">
              {visibleItemSources.map((source, index) => (
                <li key={`${source.kind}-${source.name}-${index}`}>
                  <span className="item-source-kind">
                    {source.kind === 'gathering'
                      ? '⛏ Recolección'
                      : source.kind === 'vendor'
                      ? '◈ Vendedor'
                      : source.kind === 'mob'
                      ? '⚔ Enemigo'
                      : '✦ Misión'}
                  </span>
                  <strong>{source.name}</strong>
                  <small>{source.detail}</small>
                  {source.region && <small>Región: {source.region}</small>}
                </li>
              ))}
            </ul>
            {totalItemSourcePages > 1 && (
              <nav className="item-source-pagination" aria-label="Páginas de fuentes de obtención">
                <button
                  type="button"
                  onClick={() => setItemSourcesPage((current) => Math.max(1, current - 1))}
                  disabled={itemSourcesPage === 1}
                >
                  ← Anterior
                </button>
                <span>Página {itemSourcesPage} de {totalItemSourcePages}</span>
                <button
                  type="button"
                  onClick={() => setItemSourcesPage((current) => Math.min(totalItemSourcePages, current + 1))}
                  disabled={itemSourcesPage === totalItemSourcePages}
                >
                  Siguiente →
                </button>
              </nav>
            )}
            </>
          )}
        </section>
        <aside className="material-inventory-panel material-guide-inventory">
          <div>
            <p className="section-label">TU INVENTARIO</p>
            <h3>{selectedMaterialSource.name}</h3>
            <p>Registra la cantidad que ya tienes para actualizar lo pendiente.</p>
          </div>
          <div className="material-inventory-counts">
            <span>Necesitas <b>×{selectedMaterialSource.quantity.toLocaleString()}</b></span>
            <span>En inventario <b>×{ownedQuantity.toLocaleString()}</b></span>
            <span>Faltan <b>×{remainingQuantity.toLocaleString()}</b></span>
          </div>
          <label>
            Ya tengo
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={ownedQuantity}
              onChange={(event) =>
                updateInventory(selectedMaterialSource.itemId, event.target.value)
              }
            />
          </label>
        </aside>
        </div>
      </section>
    </main>
  )
}

  if (isRecipeCostOpen && selectedCostRecipe) {
    const crafts = recipeCraftTotals.get(selectedCostRecipe.id) ?? 0
    const comparisonCrafts = Math.max(crafts, 1)
    const craftingCost = recipeCostItems.reduce(
      (total, item) => total + (item.unitCost ?? 0) * item.material.quantity,
      0,
    )
    const itemsWithoutCost = recipeCostItems.filter(
      (item) => item.unitCost === null,
    ).length
    const resultPurchaseCost = recipeMarketPrice
      ? recipeMarketPrice * comparisonCrafts
      : null

    return (
      <main className="app">
        <AppHeader user={currentUser} />
        <header className="hero">
          <p className="eyebrow">FINAL FANTASY XIV</p>
          <img className="app-logo" src={appLogo} alt="Emblema de Roadmap to Crafting Log" />
          <h1>Fabricar vs. comprar</h1>
          <p className="subtitle">Comparación de coste estimado para {selectedCostRecipe.name}.</p>
        </header>
        <section className="recipe-cost-page">
          <button className="back-to-materials-button" type="button" onClick={() => setIsRecipeCostOpen(false)}>
            ← Volver al crafting log
          </button>
          <div className="recipe-cost-heading">
            <div>
              <p className="section-label">COMPARADOR DE COSTES</p>
              <h2>{selectedCostRecipe.name}</h2>
              <p>Objetivo: fabricar ×{comparisonCrafts.toLocaleString()}</p>
            </div>
          </div>

          {!marketScope && (
            <p className="vendor-shopping-note">
              Configura tu Mundo o Data Center en “Lista de vendedores” para comparar con Market Board.
            </p>
          )}
          {isLoadingRecipeCost && <p className="empty-state">Calculando componentes y precios…</p>}
          {recipeCostError && <p className="error-message">{recipeCostError}</p>}
          {!isLoadingRecipeCost && !recipeCostError && (
            <>
              <div className="recipe-cost-summary">
                <div>
                  <span>Fabricar con el plan más barato</span>
                  <strong>{craftingCost.toLocaleString()} gil</strong>
                </div>
                <div>
                  <span>Comprar el resultado en Market Board</span>
                  <strong>{resultPurchaseCost === null ? 'Sin precio' : `${resultPurchaseCost.toLocaleString()} gil`}</strong>
                </div>
              </div>
              {itemsWithoutCost > 0 && (
                <p className="vendor-shopping-note">
                  {itemsWithoutCost} componentes no tienen precio confirmado y no se suman al coste.
                </p>
              )}
              <div className="smart-plan-list">
                {recipeCostItems.map((item) => (
                  <article key={item.material.itemId}>
                    {item.material.iconPath && <img className="game-icon" src={getIconUrl(item.material.iconPath)} alt="" />}
                    <div>
                      <h3>{item.material.name} ×{item.material.quantity.toLocaleString()}</h3>
                      <p>{item.method === 'gather' ? 'Recolectar / obtener gratis' : item.method === 'npc' ? `Comprar a ${item.source?.name}` : item.method === 'market' ? 'Comprar en Market Board' : 'Sin fuente con precio'}</p>
                    </div>
                    <strong>{item.unitCost === null ? '—' : `${(item.unitCost * item.material.quantity).toLocaleString()} gil`}</strong>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    )
  }

  if (isSmartPlanOpen) {
    const methodLabels = {
      gather: 'Recolectar u obtener',
      npc: 'Comprar a NPC',
      market: 'Comprar en Market Board',
      unknown: 'Sin recomendación disponible',
    }
    const smartPlanCost = smartPlanItems.reduce(
      (total, item) => total + (item.unitCost ?? 0) * item.material.quantity,
      0,
    )

    return (
      <main className="app">
        <AppHeader user={currentUser} />
        <header className="hero">
          <p className="eyebrow">FINAL FANTASY XIV</p>
          <img className="app-logo" src={appLogo} alt="Emblema de Roadmap to Crafting Log" />
          <h1>Plan de adquisición</h1>
          <p className="subtitle">La opción recomendada para cada material pendiente.</p>
        </header>
        <section className="smart-plan-page">
          <button className="back-to-materials-button" type="button" onClick={() => setIsSmartPlanOpen(false)}>
            ← Volver a materiales pendientes
          </button>
          <div className="vendor-shopping-heading">
            <div>
              <p className="section-label">LISTA INTELIGENTE</p>
              <h2>Cómo conseguir tus materiales</h2>
            </div>
            <strong>{smartPlanCost.toLocaleString()} gil estimados</strong>
          </div>
          {!marketScope && <p className="vendor-shopping-note">Sin Mundo/Data Center configurado, las recomendaciones de Market Board no están disponibles.</p>}
          {isLoadingSmartPlan && <p className="empty-state">Analizando fuentes: {smartPlanProgress.current} de {smartPlanProgress.total} materiales.</p>}
          {smartPlanError && <p className="error-message">{smartPlanError}</p>}
          {!isLoadingSmartPlan && !smartPlanError && (Object.keys(methodLabels) as Array<keyof typeof methodLabels>).map((method) => {
            const items = smartPlanItems.filter((item) => item.method === method)
            return items.length > 0 ? (
              <section className="smart-plan-group" key={method}>
                <h3>{methodLabels[method]} ({items.length})</h3>
                <div className="smart-plan-list">
                  {items.map((item) => (
                    <article key={item.material.itemId}>
                      {item.material.iconPath && <img className="game-icon" src={getIconUrl(item.material.iconPath)} alt="" />}
                      <div>
                        <h4>{item.material.name} ×{item.material.quantity.toLocaleString()}</h4>
                        <p>{item.source ? `${item.source.name} · ${item.source.detail}${item.source.region ? ` · ${item.source.region}` : ''}` : item.method === 'market' ? `${item.marketPrice?.toLocaleString()} gil por unidad` : 'Sin fuente conocida'}</p>
                      </div>
                      <strong>{item.unitCost === null ? '—' : `${(item.unitCost * item.material.quantity).toLocaleString()} gil`}</strong>
                    </article>
                  ))}
                </div>
              </section>
            ) : null
          })}
        </section>
      </main>
    )
  }

  if (isVendorShoppingOpen) {
    return (
      <main className="app">
        <AppHeader user={currentUser} />
        <header className="hero">
          <p className="eyebrow">FINAL FANTASY XIV</p>
          <img
            className="app-logo"
            src={appLogo}
            alt="Emblema de Roadmap to Crafting Log"
          />
          <h1>Lista de compras NPC</h1>
          <p className="subtitle">
            Materiales pendientes que puedes comprar a vendedores del juego.
          </p>
        </header>

        <section className="vendor-shopping-page">
          <button
            className="back-to-materials-button"
            type="button"
            onClick={() => setIsVendorShoppingOpen(false)}
          >
            ← Volver a materiales pendientes
          </button>

          <div className="vendor-shopping-heading">
            <div>
              <p className="section-label">COMPRAS A VENDEDORES</p>
              <h2>Tu lista de compras</h2>
            </div>
            <strong>
              {vendorShoppingItems.length} materiales · {vendorShoppingCost.toLocaleString()} gil
            </strong>
          </div>

          <p className="vendor-shopping-description">
            Compara precios fijos de NPC con el precio más barato actual de Market Board.
          </p>

          <section className="market-board-settings" aria-label="Configuración de Market Board">
            <div>
              <p className="section-label">MARKET BOARD</p>
              <h3>Tu mercado</h3>
              <p>Esta preferencia se guarda solo en tu cuenta.</p>
            </div>
            <div className="market-board-controls">
              <label>
                Consultar por
                <select
                  value={marketScopeType}
                  onChange={(event) => {
                    const type = event.target.value as MarketScope['type']
                    setMarketScopeType(type)
                    setMarketScope(null)
                    setMarketPrices({})
                  }}
                >
                  <option value="world">Mundo</option>
                  <option value="dataCenter">Data Center</option>
                </select>
              </label>
              <label>
                {marketScopeType === 'world' ? 'Mundo' : 'Data Center'}
                <select
                  value={
                    marketScope?.type === marketScopeType
                      ? marketScope.name
                      : ''
                  }
                  disabled={!marketLocations}
                  onChange={(event) =>
                    setMarketScope(
                      event.target.value
                        ? { type: marketScopeType, name: event.target.value }
                        : null,
                    )
                  }
                >
                  <option value="">
                    {marketLocations ? 'Selecciona una opción' : 'Cargando opciones…'}
                  </option>
                  {(marketScopeType === 'world'
                    ? marketLocations?.worlds
                    : marketLocations?.dataCenters
                  )?.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {marketLocationsError && (
            <p className="error-message">{marketLocationsError}</p>
          )}

          {marketScope && (
            <p className="market-board-summary">
              Market Board de {marketScope.name}: {isLoadingMarketPrices
                ? 'consultando precios…'
                : `${marketShoppingCost.toLocaleString()} gil estimados`}
            </p>
          )}

          {marketPricesError && (
            <p className="error-message">{marketPricesError}</p>
          )}

          {isLoadingVendorShopping && (
            <div className="vendor-shopping-loading">
              <p>
                Consultando vendedores: {vendorShoppingProgress.current} de {vendorShoppingProgress.total} materiales.
              </p>
              <div className="collection-progress-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${
                      vendorShoppingProgress.total === 0
                        ? 0
                        : Math.round(
                            (vendorShoppingProgress.current /
                              vendorShoppingProgress.total) *
                              100,
                          )
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {vendorShoppingError && (
            <p className="error-message">{vendorShoppingError}</p>
          )}

          {!isLoadingVendorShopping && vendorShoppingItems.length === 0 && (
            <p className="empty-state">
              No encontramos materiales pendientes que tengan vendedor NPC.
            </p>
          )}

          {vendorShoppingItemsWithoutPrice > 0 && (
            <p className="vendor-shopping-note">
              {vendorShoppingItemsWithoutPrice} materiales tienen vendedor, pero no un precio confirmado; no se suman al total de gil.
            </p>
          )}

          <div className="vendor-shopping-list">
            {vendorShoppingItems.map((item) => {
              const primaryVendor = item.vendors[0]
              const marketPrice = marketPrices[item.material.itemId]?.pricePerUnit
              const isMarketCheaper =
                typeof marketPrice === 'number' &&
                item.unitPrice !== null &&
                marketPrice < item.unitPrice

              return (
                <article key={item.material.itemId}>
                  <div className="vendor-shopping-item-heading">
                    {item.material.iconPath ? (
                      <img
                        className="game-icon"
                        src={getIconUrl(item.material.iconPath)}
                        alt=""
                      />
                    ) : null}
                    <div>
                      <h3>{item.material.name}</h3>
                      <p>Comprar ×{item.quantity.toLocaleString()}</p>
                    </div>
                    <strong>
                      {item.unitPrice === null
                        ? 'Precio no disponible'
                        : `${(item.unitPrice * item.quantity).toLocaleString()} gil`}
                    </strong>
                  </div>
                  <p className="vendor-shopping-unit-price">
                    {item.unitPrice === null
                      ? 'Precio unitario no confirmado'
                      : `${item.unitPrice.toLocaleString()} gil por unidad`}
                  </p>
                  {marketScope && (
                    <p className="market-item-price">
                      {typeof marketPrice === 'number'
                        ? `Market Board: ${marketPrice.toLocaleString()} gil por unidad · ${
                            (marketPrice * item.quantity).toLocaleString()
                          } gil total`
                        : 'Market Board: sin precio actual disponible'}
                      {typeof marketPrice === 'number' && item.unitPrice !== null
                        ? isMarketCheaper
                          ? ' · Market Board es más barato'
                          : ' · NPC es más barato o igual'
                        : ''}
                    </p>
                  )}
                  <div className="vendor-shopping-vendor">
                    <span>Vendedor recomendado</span>
                    <b>{primaryVendor.name}</b>
                    <small>
                      {primaryVendor.detail}
                      {primaryVendor.region ? ` · ${primaryVendor.region}` : ''}
                      {item.vendors.length > 1
                        ? ` · ${item.vendors.length - 1} alternativas`
                        : ''}
                    </small>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </main>
    )
  }

  if (isCraftingTreeOpen) {
    return (
      <main className="app">
        <AppHeader user={currentUser} />
        <header className="hero">
          <p className="eyebrow">FINAL FANTASY XIV</p>
          <img
            className="app-logo"
            src={appLogo}
            alt="Emblema de Roadmap to Crafting Log"
          />
          <h1>Árbol de fabricación</h1>
          <p className="subtitle">
            Explora las recetas intermedias y los materiales base de cada objetivo.
          </p>
        </header>

        <section className="crafting-tree-page">
          <button
            className="back-to-materials-button"
            type="button"
            onClick={() => setIsCraftingTreeOpen(false)}
          >
            ← Volver al crafting log
          </button>

          <div className="crafting-tree-heading">
            <div>
              <p className="section-label">PLANIFICADOR DE CRAFTEO</p>
              <h2>Selecciona una receta</h2>
            </div>
            {selectedCraftingTreeRecipe && (
              <button
                className="tree-change-recipe-button"
                type="button"
                onClick={() => {
                  setSelectedCraftingTreeRecipe(null)
                  setDraggedCraftingNodeId(null)
                }}
              >
                Cambiar receta
              </button>
            )}
          </div>

          {!selectedCraftingTreeRecipe && (
            <>
              <input
                className="material-search"
                type="search"
                value={craftingTreeSearchText}
                onChange={(event) => setCraftingTreeSearchText(event.target.value)}
                placeholder="Buscar receta, por ejemplo: Maple Lumber"
                aria-label="Buscar receta para el árbol de fabricación"
              />
              <div className="crafting-tree-recipe-list">
                {craftingTreeSearchResults.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => {
                      setSelectedCraftingTreeRecipe(recipe)
                      setDraggedCraftingNodeId(null)
                    }}
                  >
                    {recipe.iconPath ? (
                      <img className="game-icon" src={getIconUrl(recipe.iconPath)} alt="" />
                    ) : null}
                    <span>{recipe.name}</span>
                    <small>{recipe.crafter}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedCraftingTreeRecipe && selectedCraftingTree && (
            <section className="crafting-tree-panel">
              <div className="crafting-tree-summary">
                <div>
                  <p className="section-label">RECETA OBJETIVO</p>
                  <h3>{selectedCraftingTreeRecipe.name}</h3>
                </div>
                <strong>
                  Fabricar ×{selectedCraftingTreeCrafts.toLocaleString()}
                </strong>
              </div>
              <p className="crafting-workbench-help">
                Organiza tu línea de producción: arrastra cada estación para ordenar el flujo de materiales. Las flechas muestran qué componente alimenta a la siguiente receta.
              </p>
              <div className="crafting-graph-scroll">
                <div
                  className="crafting-graph"
                  ref={craftingGraphRef}
                  style={{
                    width: `${craftingGraphLayout.width}px`,
                    height: `${craftingGraphLayout.height}px`,
                  }}
                  onPointerMove={handleCraftingGraphPointerMove}
                  onPointerUp={() => setDraggedCraftingNodeId(null)}
                  onPointerCancel={() => setDraggedCraftingNodeId(null)}
                >
                  <svg className="crafting-graph-connections" aria-hidden="true">
                    <defs>
                      <marker
                        id="crafting-arrow"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M0,0 L8,4 L0,8 Z" />
                      </marker>
                    </defs>
                    {craftingGraph.edges.map((edge) => {
                      const from = craftingGraphLayout.positions.get(edge.from)
                      const to = craftingGraphLayout.positions.get(edge.to)

                      if (!from || !to) {
                        return null
                      }

                      const startX = from.x + 178
                      const startY = from.y + 43
                      const endX = to.x
                      const endY = to.y + 43
                      const curve = Math.max(45, Math.abs(endX - startX) * 0.45)

                      return (
                        <path
                          key={`${edge.from}-${edge.to}`}
                          d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`}
                          markerEnd="url(#crafting-arrow)"
                        />
                      )
                    })}
                  </svg>
                  {craftingGraph.nodes.map((node) => {
                    const position = craftingGraphLayout.positions.get(node.id)
                    const isResult = node.itemId === selectedCraftingTree.itemId

                    return position ? (
                      <button
                        className={`crafting-graph-node ${isResult ? 'result' : ''} ${
                          draggedCraftingNodeId === node.id ? 'dragging' : ''
                        }`}
                        key={node.id}
                        style={{ left: `${position.x}px`, top: `${position.y}px` }}
                        type="button"
                        onPointerDown={(event) => handleCraftingNodePointerDown(event, node.id)}
                      >
                        {node.iconPath && (
                          <img className="game-icon" src={getIconUrl(node.iconPath)} alt="" />
                        )}
                        <span>
                          <strong>{node.name}</strong>
                          <small>{node.description}</small>
                        </span>
                        <b>×{node.quantity.toLocaleString()}</b>
                      </button>
                    ) : null
                  })}
                </div>
              </div>
              <button
                className="tree-reset-layout-button"
                type="button"
                onClick={() => {
                  const recipePrefix = `${selectedCraftingTreeRecipe.id}:`
                  setCraftingTreePositions((current) =>
                    Object.fromEntries(
                      Object.entries(current).filter(
                        ([nodeKey]) => !nodeKey.startsWith(recipePrefix),
                      ),
                    ),
                  )
                }}
              >
                Restablecer mapa
              </button>
            </section>
          )}

          {selectedCraftingTreeRecipe && !selectedCraftingTree && (
            <p className="empty-state">
              No necesitas fabricar esta receta para completar los logs pendientes.
            </p>
          )}
        </section>
      </main>
    )
  }

if (isFreeTrialStorageOpen) {
  return (
    <main className="app">
      <AppHeader user={currentUser} />
      <header className="hero">
        <p className="eyebrow">FINAL FANTASY XIV · FREE TRIAL</p>
        <img className="app-logo" src={appLogo} alt="Emblema de Roadmap to Crafting Log" />
        <h1>Mochila Free Trial</h1>
        <p className="subtitle">
          Planifica dónde guardar materiales sin superar tus 140 espacios de inventario y 70 de alforja.
        </p>
      </header>

      <section className="free-trial-page">
        <button
          className="back-to-materials-button"
          type="button"
          onClick={() => setIsFreeTrialStorageOpen(false)}
        >
          ← Volver al crafting log
        </button>

        <div className="free-trial-heading">
          <div>
            <p className="section-label">GESTOR DE ALMACENAMIENTO</p>
            <h2>Materiales que conviene guardar</h2>
          </div>
          <strong>{freeTrialMaterials.length.toLocaleString()} tipos pendientes</strong>
        </div>

        <p className="free-trial-description">
          Cada tipo de material reservado cuenta como un espacio de pila. La app prioriza lo que tienes en tu sesión de farmeo, lo que ya posees y luego las cantidades más grandes. Los materiales no asignados se recomiendan conseguirlos sólo cuando los vayas a usar.
        </p>

        <div className="free-trial-summary">
          <article>
            <span>Inventario</span>
            <strong>{freeTrialStorageSummary.inventory} / 140</strong>
            <small>{140 - freeTrialStorageSummary.inventory} espacios libres</small>
          </article>
          <article>
            <span>Alforja de chocobo</span>
            <strong>{freeTrialStorageSummary.saddlebag} / 70</strong>
            <small>{70 - freeTrialStorageSummary.saddlebag} espacios libres</small>
          </article>
          <article>
            <span>Conseguir al momento</span>
            <strong>{freeTrialStorageSummary.unassigned}</strong>
            <small>tipos sin reservar</small>
          </article>
        </div>

        <div className="free-trial-actions">
          <button className="free-trial-suggest-button" type="button" onClick={applyFreeTrialSuggestion}>
            Aplicar distribución sugerida
          </button>
          <button
            className="free-trial-clear-button"
            type="button"
            onClick={() => {
              setFreeTrialStorageByItemId({})
              setFreeTrialStorageMessage('Distribución borrada. Puedes organizarla nuevamente.')
            }}
            disabled={freeTrialStorageSummary.inventory + freeTrialStorageSummary.saddlebag === 0}
          >
            Limpiar distribución
          </button>
          <label className="free-trial-search">
            Buscar material
            <input
              type="search"
              value={freeTrialSearchText}
              onChange={(event) => setFreeTrialSearchText(event.target.value)}
              placeholder="Ej.: Copper Ore"
            />
          </label>
        </div>

        {freeTrialStorageMessage && <p className="free-trial-message">{freeTrialStorageMessage}</p>}

        <div className="free-trial-list">
          {visibleFreeTrialMaterials.map((material) => {
            const locationLabel =
              material.location === 'inventory'
                ? 'Inventario'
                : material.location === 'saddlebag'
                  ? 'Alforja'
                  : 'Al conseguirlo'

            return (
              <article key={material.itemId}>
                {material.iconPath && (
                  <img className="game-icon" src={getIconUrl(material.iconPath)} alt="" />
                )}
                <div className="free-trial-material-name">
                  <h3>{material.name}</h3>
                  <p>
                    Faltan ×{material.remainingQuantity.toLocaleString()}
                    {material.ownedQuantity > 0 && ` · Tienes ×${material.ownedQuantity.toLocaleString()}`}
                    {material.isSessionItem && ' · En sesión de farmeo'}
                  </p>
                </div>
                <span className={`free-trial-location ${material.location ?? 'on-demand'}`}>
                  {locationLabel}
                </span>
                <div className="free-trial-material-actions">
                  <button
                    className={material.location === 'inventory' ? 'active' : ''}
                    type="button"
                    onClick={() => assignFreeTrialStorage(material.itemId, 'inventory')}
                  >
                    Inventario
                  </button>
                  <button
                    className={material.location === 'saddlebag' ? 'active' : ''}
                    type="button"
                    onClick={() => assignFreeTrialStorage(material.itemId, 'saddlebag')}
                  >
                    Alforja
                  </button>
                </div>
              </article>
            )
          })}
        </div>
        {visibleFreeTrialMaterials.length === 0 && (
          <p className="empty-state">No encontramos materiales pendientes con esa búsqueda.</p>
        )}
      </section>
    </main>
  )
}

if (isMaterialsRoadmapOpen) {
  return (
    <main className="app">
      <AppHeader user={currentUser} />
      <header className="hero">
        <p className="eyebrow">FINAL FANTASY XIV</p>
        <img
          className="app-logo"
          src={appLogo}
          alt="Emblema de Roadmap to Crafting Log"
        />
        <h1>Materiales pendientes</h1>
        <p className="subtitle">
          Reúne estos materiales para completar tu crafting log al 100%.
        </p>
        {progressSyncError && <p className="progress-sync-error">{progressSyncError}</p>}
      </header>

      <section className="materials-roadmap materials-roadmap-page">
        <button
          className="back-to-materials-button"
          type="button"
          onClick={() => setIsMaterialsRoadmapOpen(false)}
        >
          ← Volver al crafting log
        </button>

        <div className="materials-roadmap-heading">
          <div>
            <p className="section-label">ROADMAP DE MATERIALES</p>
            <h2>
              {materialCrafterScope === 'all'
                ? 'Necesitas reunir o fabricar'
                : `Materiales de ${materialCrafterScope}`}
              {materialLevelScope !== 'all' &&
                ` · Nivel ${materialLevelRanges.find(
                  (range) => range.start === Number(materialLevelScope),
                )?.label}`}
            </h2>
          </div>

          <div className="materials-roadmap-actions">
            <strong>
              {visibleMaterialTotals.length} de {materialTotals.length} tipos
            </strong>
            <button
              className="inventory-reset-button"
              type="button"
              onClick={resetInventory}
              disabled={!Object.values(inventoryByItemId).some((quantity) => quantity > 0)}
            >
              Reiniciar inventario
            </button>
            <button
              className="vendor-shopping-button"
              type="button"
              onClick={openVendorShoppingList}
            >
              Lista de vendedores
            </button>
            <button className="smart-plan-button" type="button" onClick={openSmartPlan}>
              Plan inteligente
            </button>
          </div>
        </div>

        <p className="materials-roadmap-description">
          Totales expandidos para completar una vez cada receta pendiente.
          Las recetas intermedias se convierten automáticamente en materiales base.
          Selecciona un material para ver cómo obtenerlo sin crafting.
        </p>

        <div className="material-scope-filters">
          <label className="material-crafter-scope">
            Ver materiales de
            <select
              value={materialCrafterScope}
              onChange={(event) =>
                setMaterialCrafterScope(event.target.value as 'all' | CrafterId)
              }
            >
              <option value="all">Todas las profesiones</option>
              {crafters.map((crafter) => (
                <option key={crafter.id} value={crafter.id}>
                  {crafter.id}
                </option>
              ))}
            </select>
          </label>

          <label className="material-crafter-scope">
            Nivel de receta
            <select
              value={materialLevelScope}
              onChange={(event) => setMaterialLevelScope(event.target.value)}
            >
              <option value="all">Todos los niveles</option>
              {materialLevelRanges.map((range) => (
                <option key={range.start} value={range.start}>
                  Nivel {range.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="material-collection-summary" aria-label="Progreso de recolección">
          <div className="collection-progress-card collection-progress-card-primary">
            <span>Progreso de recolección</span>
            <strong>{materialCollectionSummary.percentage}%</strong>
            <div
              className="collection-progress-bar"
              role="progressbar"
              aria-label="Progreso de recolección"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={materialCollectionSummary.percentage}
            >
              <i style={{ width: `${materialCollectionSummary.percentage}%` }} />
            </div>
          </div>
          <div className="collection-progress-card">
            <span>En inventario</span>
            <strong>×{materialCollectionSummary.owned.toLocaleString()}</strong>
          </div>
          <div className="collection-progress-card">
            <span>Por conseguir</span>
            <strong>×{materialCollectionSummary.remaining.toLocaleString()}</strong>
          </div>
          <div className="collection-progress-card">
            <span>Tipos completos</span>
            <strong>
              {materialCollectionSummary.completedMaterialTypes} / {materialTotals.length}
            </strong>
          </div>
        </section>

        <input
          className="material-search"
          type="search"
          value={materialSearchText}
          onChange={(event) => setMaterialSearchText(event.target.value)}
          placeholder="Buscar material, por ejemplo: Copper Ore"
          aria-label="Buscar material pendiente"
        />

        <div className="material-roadmap-controls">
          <div className="filter-buttons material-status-filters" aria-label="Filtrar materiales">
            <button
              className={materialStatusFilter === 'all' ? 'active' : ''}
              type="button"
              onClick={() => setMaterialStatusFilter('all')}
            >
              Todos
            </button>
            <button
              className={materialStatusFilter === 'missing' ? 'active' : ''}
              type="button"
              onClick={() => setMaterialStatusFilter('missing')}
            >
              Por conseguir
            </button>
            <button
              className={materialStatusFilter === 'collected' ? 'active' : ''}
              type="button"
              onClick={() => setMaterialStatusFilter('collected')}
            >
              Completos
            </button>
            <button
              className={materialStatusFilter === 'session' ? 'active' : ''}
              type="button"
              onClick={() => setMaterialStatusFilter('session')}
            >
              Mi sesión ({farmingSessionItemIds.length})
            </button>
          </div>

          <label className="material-sort-control">
            Ordenar por
            <select
              value={materialSort}
              onChange={(event) =>
                setMaterialSort(event.target.value as 'remaining' | 'name')
              }
            >
              <option value="remaining">Mayor cantidad pendiente</option>
              <option value="name">Nombre: A a Z</option>
            </select>
          </label>

          <button
            className="download-material-list-button"
            type="button"
            onClick={downloadMaterialList}
            disabled={visibleMaterialTotals.length === 0}
          >
            ↓ Descargar lista CSV
          </button>
        </div>

        {visibleMaterialTotals.length === 0 && (
          <p className="empty-state">
            No encontramos materiales con estos filtros.
          </p>
        )}

        <div className="materials-summary-list">
          {visibleMaterialTotals.map((material) => {
            const ownedQuantity = inventoryByItemId[String(material.itemId)] ?? 0
            const remainingQuantity = Math.max(
              material.quantity - ownedQuantity,
              0,
            )

            return (
              <div className="material-total-entry" key={material.itemId}>
                <button
                className={`material-total-card ${
                  highlightedMaterialId === material.itemId
                    ? 'highlighted-material'
                    : ''
                }`}
                id={`material-total-${material.itemId}`}
                type="button"
                onClick={() => void openItemSources(material)}
              >
                {material.iconPath ? (
                  <img
                    className="game-icon"
                    src={getIconUrl(material.iconPath)}
                    alt=""
                  />
                ) : null}

                  <span className="material-total-name">
                    {material.name}
                    <small>
                      Total ×{material.quantity.toLocaleString()} · Faltan ×
                      {remainingQuantity.toLocaleString()}
                    </small>
                  </span>
                  <strong>×{remainingQuantity.toLocaleString()}</strong>
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

  return (
    <main className="app">
      <AppHeader user={currentUser} />
      <header className="hero">
        <p className="eyebrow">FINAL FANTASY XIV</p>
        <img
          className="app-logo"
          src={appLogo}
          alt="Emblema de Roadmap to Crafting Log"
        />
        <h1>Roadmap to Crafting Log</h1>
        <p className="subtitle">
          Completa el crafting log de tus ocho Disciplines of the Hand.
        </p>
        {progressSyncError && <p className="progress-sync-error">{progressSyncError}</p>}
        <div className="main-actions">
          <button
            className="load-button"
            onClick={handleLoadRecipes}
            disabled={isLoading}
          >
            {isLoading
              ? 'Cargando crafting log…'
              : hasLoadedRecipes
                ? 'Actualizar crafting log'
                : 'Cargar crafting log real'}
          </button>

          <button
            className="materials-roadmap-button"
            type="button"
            onClick={() => setIsMaterialsRoadmapOpen(true)}
            disabled={!hasLoadedRecipes}
          >
            {`Materiales pendientes (${materialTotals.length})`}
          </button>

          <button
            className="assistant-button"
            type="button"
            onClick={() => setIsCraftingAssistantOpen(true)}
            disabled={!hasLoadedRecipes}
          >
            Asistente de crafting
          </button>

          {accessState.isAdmin && (
            <button
              className="data-agent-button"
              type="button"
              onClick={() => setIsDataAgentOpen(true)}
              disabled={!hasLoadedRecipes}
            >
              Agente de datos
            </button>
          )}

          <button
            className="free-trial-button"
            type="button"
            onClick={() => setIsFreeTrialStorageOpen(true)}
            disabled={!hasLoadedRecipes}
          >
            Mochila Free Trial
          </button>

          <button
            className="crafting-tree-button"
            type="button"
            onClick={() => openCraftingTree()}
            disabled={!hasLoadedRecipes}
          >
            Árbol de fabricación
          </button>

          <button
            className="reset-button"
            type="button"
            onClick={resetProgress}
            disabled={completedRecipes.length === 0}
          >
            Reiniciar progreso
          </button>
        </div>
      </header>

      {accessState.isAdmin && <AdminAccessPanel adminUserId={currentUser.uid} />}

      <section className="overall-progress" aria-label="Progreso global">
        <div>
          <p className="section-label">PROGRESO GLOBAL</p>
          <strong>{overallProgress}%</strong>
          <span>
            {completedRecipes.length} de {totalRecipes} recetas completadas
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </section>

      {nextCraftingGoal && (
        <section className="next-crafting-goal" aria-label="Siguiente objetivo sugerido">
          <div>
            <p className="section-label">SIGUIENTE OBJETIVO</p>
            <h2>Completa {nextCraftingGoal.crafter.id}</h2>
            <p>
              Vas por {nextCraftingGoal.completed} de {nextCraftingGoal.total} recetas.
              Solo faltan {nextCraftingGoal.remaining} para terminar esta profesión.
            </p>
          </div>
          <button type="button" onClick={openNextCraftingGoal}>
            Ver recetas pendientes →
          </button>
        </section>
      )}

      <div className="crafting-log-layout">
      <aside className="crafter-sidebar" aria-label="Elegir profesión">
        <p className="section-label">PROFESIÓN</p>
        <label>
          Elige una profesión
          <select
            value={selectedCrafterId}
            onChange={(event) => selectCrafterFromMenu(event.target.value as CrafterId)}
          >
            {crafters.map((crafter) => {
              const total = recipes.filter((recipe) => recipe.crafter === crafter.id).length
              const completed = getCompletedCount(crafter)
              return (
                <option key={crafter.id} value={crafter.id}>
                  {crafter.id} · {completed}/{total}
                </option>
              )
            })}
          </select>
        </label>
        <div className="crafter-sidebar-current">
          <span className="crafter-icon" aria-hidden="true">
            <img className="crafter-job-icon" src={selectedCrafter.icon} alt="" />
          </span>
          <div>
            <strong>{selectedCrafter.id}</strong>
            <small>
              {getCompletedCount(selectedCrafter)} de {selectedRecipes.length} recetas completadas
            </small>
          </div>
        </div>
        <p className="crafter-sidebar-note">
          Al cambiar de profesión verás el primer tramo de nivel que aún tenga recetas pendientes.
        </p>
      </aside>

      <section className="recipe-panel" id="crafting-log">
        <div className="recipe-panel-heading">
          <span className="crafter-icon"><img className="crafter-job-icon" src={selectedCrafter.icon} alt="" /></span>
          <div>
            <p className="section-label">CRAFTING LOG</p>
            <h2>{selectedCrafter.id}</h2>
          </div>
        </div>

        {isRestoringCatalog && (
  <p className="empty-state">
    Restaurando el crafting log guardado…
  </p>
)}

{!isRestoringCatalog && !hasLoadedRecipes && !isLoading && !loadError && (
  <p className="empty-state">
    Pulsa “Cargar crafting log real” para obtener las recetas.
  </p>
)}

        {isLoading && (
          <p className="empty-state">
            Descargando y organizando recetas de FFXIV. Puede tomar unos segundos.
          </p>
        )}

        {loadError && <p className="error-message">{loadError}</p>}

        {hasLoadedRecipes && (
  <>
    <div className="recipe-category-tabs" role="tablist" aria-label="Categoría de recetas">
      {([
        ['level', 'Level-based Recipes'],
        ['special', 'Special Recipes'],
        ['master', 'Master Recipes'],
      ] as const).map(([category, label]) => {
        const total = selectedRecipes.filter(
          (recipe) => (recipe.category ?? 'level') === category,
        ).length

        return (
          <button
            aria-selected={recipeCategoryFilter === category}
            className={recipeCategoryFilter === category ? 'active' : ''}
            key={category}
            role="tab"
            type="button"
            onClick={() => {
              setRecipeCategoryFilter(category)
              setLevelFilter('all')
              setSelectedRecipe(null)
            }}
          >
            <span>{label}</span>
            <b>{total}</b>
          </button>
        )
      })}
    </div>
    <div className="recipe-controls">
      <input
        className="recipe-search"
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder={`Buscar en ${selectedCrafter.id}…`}
      />

      {recipeCategoryFilter !== 'special' && (
        <select
          className="level-filter"
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value)}
          aria-label="Filtrar por nivel"
        >
          <option value="all">
            {recipeCategoryFilter === 'level'
              ? 'Todos los niveles'
              : 'Todos los niveles de receta'}
          </option>
          {recipeLevelRanges.map((range) => (
            <option key={range.start} value={range.start}>
              Nivel {range.label}
            </option>
          ))}
        </select>
      )}

      <div className="filter-buttons">
        <button
          className={recipeFilter === 'all' ? 'active' : ''}
          onClick={() => setRecipeFilter('all')}
        >
          Todas
        </button>
        <button
          className={recipeFilter === 'pending' ? 'active' : ''}
          onClick={() => setRecipeFilter('pending')}
        >
          Pendientes
        </button>
        <button
          className={recipeFilter === 'completed' ? 'active' : ''}
          onClick={() => setRecipeFilter('completed')}
        >
          Completadas
        </button>
      </div>
    </div>

    <p className="result-count">
      Mostrando {visibleSelectedRecipes.length} de {selectedRecipes.length} recetas
    </p>

    <div className="recipe-list">
  {visibleRecipeGroups.map((group) => (
    <section className="recipe-level-group" key={group.key}>
      <div className="recipe-level-heading">
        <h3>{group.label}</h3>
        <span>{group.recipes.length} recetas</span>
      </div>
  {group.recipes.map((recipe) => {
    const isCompleted = completedRecipeIds.includes(recipe.id)
    const isSelectedRecipe = selectedRecipe?.id === recipe.id

    return (
      <div
        className={`recipe-entry ${
          highlightedRecipeId === recipe.id ? 'highlighted-recipe' : ''
        }`}
        id={`recipe-${recipe.id}`}
        key={recipe.id}
      >
        <div className="recipe-row">
          <label className="recipe-check">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={() => toggleRecipe(recipe.id)}
            />
            {recipe.iconPath ? (
  <img
    className="game-icon"
    src={getIconUrl(recipe.iconPath)}
    alt=""
  />
) : null}
<span>
  {recipe.name}
  <b
    className="recipe-craft-total"
    title="Veces que debes fabricar esta receta para completar los logs pendientes"
  >
    ×{(recipeCraftTotals.get(recipe.id) ?? 0).toLocaleString()}
  </b>
</span>
          </label>

          <small>
            {isCompleted
              ? 'Completada'
              : recipe.category === 'master'
                ? recipe.masterRecipeBook
                  ? `Master · ${recipe.masterRecipeBook}`
                  : 'Master Recipe'
                : recipe.category === 'special'
                  ? 'Special Recipe'
                  : recipe.level
                    ? `Nivel ${recipe.level}`
                    : 'Pendiente'}
          </small>

          <button
            className="recipe-material-button"
            type="button"
            onClick={() => handleOpenIngredients(recipe)}
          >
            Materiales
          </button>

          <button
            className="recipe-tree-button"
            type="button"
            onClick={() => openCraftingTree(recipe)}
          >
            Árbol
          </button>

          <button
            className="recipe-cost-button"
            type="button"
            onClick={() => openRecipeCostComparison(recipe)}
          >
            Costes
          </button>
        </div>

        {isSelectedRecipe && (
          <aside className="ingredient-panel">
            <div className="ingredient-panel-heading">
              <div>
                <p className="section-label">MATERIALES</p>
                <h3>{selectedRecipe.name}</h3>
              </div>

              <button
                className="close-panel-button"
                type="button"
                onClick={() => setSelectedRecipe(null)}
              >
                Cerrar
              </button>
            </div>

            {isLoadingIngredients && (
              <p className="empty-state">Cargando materiales…</p>
            )}

            {ingredientsError && (
              <p className="error-message">{ingredientsError}</p>
            )}

            {!isLoadingIngredients && !ingredientsError && (
              <ul className="ingredient-list">
                {recipeIngredients.map((ingredient) => (
                  <li key={ingredient.itemId}>
  <button
  className="ingredient-total-button"
  type="button"
  onClick={() => openMaterialTotal(ingredient.itemId)}
>
  {ingredient.iconPath ? (
    <img
      className="game-icon"
      src={getIconUrl(ingredient.iconPath)}
      alt=""
    />
  ) : null}
  <span>{ingredient.name}</span>
</button>

  <span className="ingredient-actions">
    <strong>×{ingredient.quantity}</strong>

    {(() => {
      const craftingRecipe = recipes.find(
        (recipe) => recipe.resultItemId === ingredient.itemId,
      )

      return craftingRecipe ? (
        <button
          className="craftable-button"
          type="button"
          onClick={() => openCraftingRecipe(craftingRecipe)}
        >
          Fabricar: {craftingRecipe.crafter}
        </button>
      ) : (
        <small>Reunir o comprar</small>
      )
    })()}
  </span>
</li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    )
  })}
    </section>
  ))}
</div>

    {visibleSelectedRecipes.length === 0 && (
      <p className="empty-state">No encontramos recetas con esos filtros.</p>
    )}
  </>
)}
      </section>
      </div>
    </main>
  )
}

export default App
