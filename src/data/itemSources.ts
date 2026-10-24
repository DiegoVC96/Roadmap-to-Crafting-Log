export type ItemSource = {
  kind: 'gathering' | 'vendor' | 'quest' | 'mob'
  name: string
  detail: string
  region?: string
  price?: number
}

type GarlandPartial = {
  l?: number | string
  type?: string
  id?: string
  obj?: {
    n?: string
    l?: number | string
    t?: string
    c?: Array<number | string>
    z?: number
    a?: number
    lt?: string
  }
}

type GarlandItemResponse = {
  item?: {
    nodes?: number[]
    vendors?: number[]
    quests?: number[]
    drops?: number[]
    price?: number
  }
  partials?: GarlandPartial[]
}

const itemSourcesCache = new Map<number, Promise<ItemSource[]>>()

type LocationIndexEntry = {
  name?: string
}

let locationIndexPromise: Promise<Record<string, LocationIndexEntry>> | null =
  null

function loadLocationIndex() {
  if (!locationIndexPromise) {
    locationIndexPromise = fetch(
      'https://www.garlandtools.org/db/doc/core/en/3/data.json',
    )
      .then(async (response) => {
        if (!response.ok) {
          return {}
        }

        const payload = (await response.json()) as {
          locationIndex?: Record<string, LocationIndexEntry>
        }

        return payload.locationIndex ?? {}
      })
      .catch(() => ({}))
  }

  return locationIndexPromise
}

function formatCoordinates(coordinates?: Array<number | string>) {
  if (!coordinates || coordinates.length < 2) {
    return ''
  }

  return ` (${coordinates[0]}, ${coordinates[1]})`
}

async function fetchItemSources(itemId: number) {
  const [response, locationIndex] = await Promise.all([
    fetch(`https://www.garlandtools.org/db/doc/item/en/3/${itemId}.json`),
    loadLocationIndex(),
  ])

  if (!response.ok) {
    throw new Error('No se pudo cargar la guía de obtención.')
  }

  const payload = (await response.json()) as GarlandItemResponse
  const partials = payload.partials ?? []
  const nodeIds = new Set((payload.item?.nodes ?? []).map(String))
  const vendorIds = new Set((payload.item?.vendors ?? []).map(String))
  const vendorPrice =
    typeof payload.item?.price === 'number' && payload.item.price >= 0
      ? payload.item.price
      : undefined
  const questIds = new Set((payload.item?.quests ?? []).map(String))
  const mobIds = new Set((payload.item?.drops ?? []).map(String))

  const sources: ItemSource[] = []

  for (const partial of partials) {
    const id = partial.id
    const name = partial.obj?.n
    const regionId = partial.obj?.z ?? partial.obj?.a
    const region =
      typeof regionId === 'number'
        ? locationIndex[String(regionId)]?.name
        : undefined

    if (!id || !name) {
      continue
    }

    if (partial.type === 'node' && nodeIds.has(id)) {
      const level = partial.obj?.l
      sources.push({
        kind: 'gathering',
        name,
        detail: `${partial.obj?.lt ? `${partial.obj.lt} · ` : ''}Nodo de recolección${
          level ? ` · Nivel ${level}` : ''
        }`,
        region,
      })
    }

    if (partial.type === 'npc' && vendorIds.has(id)) {
      const role = partial.obj?.t ?? 'Vendedor'
      sources.push({
        kind: 'vendor',
        name,
        detail: `${role}${formatCoordinates(partial.obj?.c)}`,
        region,
        price: vendorPrice,
      })
    }

    if (partial.type === 'quest' && questIds.has(id)) {
      const location = partial.obj?.l
      sources.push({
        kind: 'quest',
        name,
        detail: location ? `Misión · ${location}` : 'Misión',
        region,
      })
    }

    if (partial.type === 'mob' && mobIds.has(id)) {
      const level = partial.obj?.l
      sources.push({
        kind: 'mob',
        name,
        detail: level ? `Enemigo · Nivel ${level}` : 'Enemigo',
        region,
      })
    }
  }

  return sources
}

export function loadItemSources(itemId: number) {
  const cachedSources = itemSourcesCache.get(itemId)

  if (cachedSources) {
    return cachedSources
  }

  const sources = fetchItemSources(itemId)
  itemSourcesCache.set(itemId, sources)
  void sources.catch(() => {
    itemSourcesCache.delete(itemId)
  })
  return sources
}
