import { useEffect, useMemo, useState } from 'react'
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
  calculateBaseMaterialTotals,
  type BaseMaterialTotal,
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
  const [recipeFilter, setRecipeFilter] = useState<
    'all' | 'pending' | 'completed'
  >('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [isMaterialsRoadmapOpen, setIsMaterialsRoadmapOpen] = useState(false)
  const [highlightedMaterialId, setHighlightedMaterialId] = useState<number | null>(null)
  const [selectedMaterialSource, setSelectedMaterialSource] =
    useState<BaseMaterialTotal | null>(null)
  const [itemSources, setItemSources] = useState<ItemSource[]>([])
  const [isLoadingItemSources, setIsLoadingItemSources] = useState(false)
  const [isItemSourcesPageOpen, setIsItemSourcesPageOpen] = useState(false)
  const [itemSourcesError, setItemSourcesError] = useState<string | null>(null)
  const [completedRecipeIds, setCompletedRecipeIds] = useState<string[]>([])
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
    Math.floor((recipe.level ?? 0) / 10) * 10 === Number(levelFilter)

  return matchesSearch && matchesFilter && matchesLevel
})

const materialTotals = useMemo(() => {
  return calculateBaseMaterialTotals(recipes, completedRecipeIds)
}, [recipes, completedRecipeIds])

const visibleMaterialTotals = materialTotals.filter((material) =>
  material.name
    .toLocaleLowerCase()
    .includes(materialSearchText.trim().toLocaleLowerCase()),
)

function getCompletedCount(crafter: Crafter) {
  return recipes.filter(
    (recipe) =>
      recipe.crafter === crafter.id &&
      completedRecipeIds.includes(recipe.id),
  ).length
}

function toggleRecipe(recipeId: string) {
  setCompletedRecipeIds((currentIds) =>
    currentIds.includes(recipeId)
      ? currentIds.filter((id) => id !== recipeId)
      : [...currentIds, recipeId],
  )
}

function resetProgress() {
  const shouldReset = window.confirm(
    '¿Quieres borrar todas las recetas marcadas como completadas?',
  )

  if (shouldReset) {
    setCompletedRecipeIds([])
  }
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

function openMaterialTotal(materialId: number) {
  setIsMaterialsRoadmapOpen(true)
  setHighlightedMaterialId(materialId)
}

async function openItemSources(material: BaseMaterialTotal) {
  setIsItemSourcesPageOpen(true)
  setSelectedMaterialSource(material)
  setItemSources([])
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
      const savedRecipeIds = await loadUserProgress(activeUserId)

      if (isActive) {
        setCompletedRecipeIds(savedRecipeIds)
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
    void saveUserProgress(userId, completedRecipeIds).catch(() => {
      setProgressSyncError(
        'No pudimos guardar el último cambio. Revisa tu conexión e inténtalo nuevamente.',
      )
    })
  }, 500)

  return () => window.clearTimeout(saveTimeout)
}, [
  completedRecipeIds,
  currentUser?.uid,
  loadedProgressUserId,
  accessState.status,
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

  if (isItemSourcesPageOpen && selectedMaterialSource) {
  return (
    <main className="app">
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
        <AccountActions user={currentUser} />
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
              Necesitas ×{selectedMaterialSource.quantity.toLocaleString()}
            </strong>
          </div>
        </div>

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
            <ul className="item-source-list">
              {itemSources.map((source, index) => (
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
          )}
        </section>
      </section>
    </main>
  )
}

if (isMaterialsRoadmapOpen) {
  return (
    <main className="app">
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
        <AccountActions user={currentUser} />
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
            <h2>Necesitas reunir o fabricar</h2>
          </div>

          <strong>
            {visibleMaterialTotals.length} de {materialTotals.length} tipos
          </strong>
        </div>

        <p className="materials-roadmap-description">
          Totales expandidos para completar una vez cada receta pendiente.
          Las recetas intermedias se convierten automáticamente en materiales base.
          Selecciona un material para ver cómo obtenerlo sin crafting.
        </p>

        <input
          className="material-search"
          type="search"
          value={materialSearchText}
          onChange={(event) => setMaterialSearchText(event.target.value)}
          placeholder="Buscar material, por ejemplo: Copper Ore"
          aria-label="Buscar material pendiente"
        />

        {visibleMaterialTotals.length === 0 && (
          <p className="empty-state">
            No encontramos materiales que coincidan con “{materialSearchText}”.
          </p>
        )}

        <div className="materials-summary-list">
          {visibleMaterialTotals.map((material) => (
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

                <span>{material.name}</span>
                <strong>×{material.quantity.toLocaleString()}</strong>
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

  return (
    <main className="app">
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
        <AccountActions user={currentUser} />
        {progressSyncError && <p className="progress-sync-error">{progressSyncError}</p>}

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
          className="reset-button"
          type="button"
          onClick={resetProgress}
          disabled={completedRecipes.length === 0}
          >
          Reiniciar progreso
        </button>

        <button
          className="materials-roadmap-button"
          type="button"
          onClick={() => setIsMaterialsRoadmapOpen(true)}
          disabled={!hasLoadedRecipes}
          >
          {`Ver materiales pendientes (${materialTotals.length})`}
        </button>
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

      <section className="crafting-grid" aria-label="Profesiones de crafting">
        {crafters.map((crafter) => {
          const totalForCrafter = recipes.filter(
            (recipe) => recipe.crafter === crafter.id,
          ).length
          const completed = getCompletedCount(crafter)
          const progress =
            totalForCrafter === 0
              ? 0
              : Math.round((completed / totalForCrafter) * 100)
          const isSelected = crafter.id === selectedCrafterId

          return (
            <button
              className={`crafter-card ${isSelected ? 'selected' : ''}`}
              key={crafter.id}
              onClick={() => setSelectedCrafterId(crafter.id)}
            >
              <span className="crafter-icon" aria-hidden="true">
                <img className="crafter-job-icon" src={crafter.icon} alt="" />
              </span>
              <span>
                <h2>{crafter.id}</h2>
                <p>
                  {completed} / {totalForCrafter} recetas
                </p>
              </span>
              <strong>{progress}%</strong>
            </button>
          )
        })}
      </section>

      <section className="recipe-panel">
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
    <div className="recipe-controls">
      <input
        className="recipe-search"
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder={`Buscar en ${selectedCrafter.id}…`}
      />

      <select
        className="level-filter"
        value={levelFilter}
        onChange={(event) => setLevelFilter(event.target.value)}
        aria-label="Filtrar por nivel"
        >
        <option value="all">Todos los niveles</option>
        <option value="0">Nivel 1–9</option>
        <option value="10">Nivel 10–19</option>
        <option value="20">Nivel 20–29</option>
        <option value="30">Nivel 30–39</option>
        <option value="40">Nivel 40–49</option>
        <option value="50">Nivel 50–59</option>
        <option value="60">Nivel 60–69</option>
        <option value="70">Nivel 70–79</option>
        <option value="80">Nivel 80–89</option>
        <option value="90">Nivel 90–99</option>
        <option value="100">Nivel 100</option>
      </select>

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
  {visibleSelectedRecipes.map((recipe) => {
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
<span>{recipe.name}</span>
          </label>

          <small>
            {isCompleted
              ? 'Completada'
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
</div>

    {visibleSelectedRecipes.length === 0 && (
      <p className="empty-state">No encontramos recetas con esos filtros.</p>
    )}
  </>
)}
      </section>
    </main>
  )
}

export default App
