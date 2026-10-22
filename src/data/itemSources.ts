export type ItemSource = {
  kind: 'gathering' | 'vendor' | 'quest' | 'mob'
  name: string
  detail: string
}

type GarlandPartial = {
  l?: number | string
  type?: string
  id?: string
  obj?: {
    n?: string
    l?: number
    t?: string
    c?: Array<number | string>
  }
}

type GarlandItemResponse = {
  item?: {
    nodes?: number[]
    vendors?: number[]
    quests?: number[]
    drops?: number[]
  }
  partials?: GarlandPartial[]
}

function formatCoordinates(coordinates?: Array<number | string>) {
  if (!coordinates || coordinates.length < 2) {
    return ''
  }

  return ` (${coordinates[0]}, ${coordinates[1]})`
}

export async function loadItemSources(itemId: number) {
  const response = await fetch(
    `https://www.garlandtools.org/db/doc/item/en/3/${itemId}.json`,
  )

  if (!response.ok) {
    throw new Error('No se pudo cargar la guía de obtención.')
  }

  const payload = (await response.json()) as GarlandItemResponse
  const partials = payload.partials ?? []
  const nodeIds = new Set((payload.item?.nodes ?? []).map(String))
  const vendorIds = new Set((payload.item?.vendors ?? []).map(String))
  const questIds = new Set((payload.item?.quests ?? []).map(String))
  const mobIds = new Set((payload.item?.drops ?? []).map(String))

  const sources: ItemSource[] = []

  for (const partial of partials) {
    const id = partial.id
    const name = partial.obj?.n

    if (!id || !name) {
      continue
    }

    if (partial.type === 'node' && nodeIds.has(id)) {
      const level = partial.obj?.l
      sources.push({
        kind: 'gathering',
        name,
        detail: level ? `Nodo de recolección · Nivel ${level}` : 'Nodo de recolección',
      })
    }

    if (partial.type === 'npc' && vendorIds.has(id)) {
      const role = partial.obj?.t ?? 'Vendedor'
      sources.push({
        kind: 'vendor',
        name,
        detail: `${role}${formatCoordinates(partial.obj?.c)}`,
      })
    }

    if (partial.type === 'quest' && questIds.has(id)) {
      const location = partial.obj?.l
      sources.push({
        kind: 'quest',
        name,
        detail: location ? `Misión · ${location}` : 'Misión',
      })
    }

    if (partial.type === 'mob' && mobIds.has(id)) {
      const level = partial.obj?.l
      sources.push({
        kind: 'mob',
        name,
        detail: level ? `Enemigo · Nivel ${level}` : 'Enemigo',
      })
    }
  }

  return sources
}