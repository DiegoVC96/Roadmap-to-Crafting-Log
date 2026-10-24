export type MarketScope = {
  type: 'world' | 'dataCenter'
  name: string
}

export type MarketLocations = {
  dataCenters: string[]
  worlds: string[]
}

export type MarketPrice = {
  itemId: number
  pricePerUnit: number
  lastUploadTime: number
}

type MarketItemResponse = {
  itemID?: number
  minPriceNQ?: number
  minPrice?: number
  lastUploadTime?: number
}

let marketLocationsPromise: Promise<MarketLocations> | null = null

export function loadMarketLocations() {
  if (!marketLocationsPromise) {
    marketLocationsPromise = Promise.all([
      fetch('https://universalis.app/api/v3/game/data-centers'),
      fetch('https://universalis.app/api/v3/game/worlds'),
    ])
      .then(async ([dataCentersResponse, worldsResponse]) => {
        if (!dataCentersResponse.ok || !worldsResponse.ok) {
          throw new Error('No se pudieron cargar los mundos de Market Board.')
        }

        const dataCenters = (await dataCentersResponse.json()) as Array<{
          name?: unknown
        }>
        const worlds = (await worldsResponse.json()) as Array<{ name?: unknown }>

        return {
          dataCenters: dataCenters
            .map((dataCenter) => dataCenter.name)
            .filter((name): name is string => typeof name === 'string')
            .sort((first, second) => first.localeCompare(second)),
          worlds: worlds
            .map((world) => world.name)
            .filter((name): name is string => typeof name === 'string')
            .sort((first, second) => first.localeCompare(second)),
        }
      })
      .catch((error: unknown) => {
        marketLocationsPromise = null
        throw error
      })
  }

  return marketLocationsPromise
}

function getMarketItems(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const data = payload as { items?: Record<string, MarketItemResponse> } &
    MarketItemResponse

  if (data.items) {
    return Object.values(data.items)
  }

  return data.itemID ? [data] : []
}

export async function loadMarketPrices(
  scope: MarketScope,
  itemIds: number[],
) {
  const prices = new Map<number, MarketPrice>()
  const uniqueItemIds = [...new Set(itemIds)]

  for (let index = 0; index < uniqueItemIds.length; index += 100) {
    const batch = uniqueItemIds.slice(index, index + 100)
    const response = await fetch(
      `https://universalis.app/api/v2/${encodeURIComponent(scope.name)}/${batch.join(',')}?listings=1&entries=0`,
    )

    if (!response.ok) {
      throw new Error('No se pudieron cargar los precios de Market Board.')
    }

    for (const item of getMarketItems(await response.json())) {
      const price = item.minPriceNQ ?? item.minPrice

      if (
        typeof item.itemID === 'number' &&
        typeof price === 'number' &&
        price > 0
      ) {
        prices.set(item.itemID, {
          itemId: item.itemID,
          pricePerUnit: price,
          lastUploadTime:
            typeof item.lastUploadTime === 'number' ? item.lastUploadTime : 0,
        })
      }
    }
  }

  return prices
}
