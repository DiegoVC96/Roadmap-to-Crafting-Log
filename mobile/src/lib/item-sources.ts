export type ItemSource = {
  kind: 'gathering' | 'vendor' | 'quest' | 'mob';
  name: string;
  detail: string;
};

type GarlandPartial = {
  type?: string;
  id?: string;
  obj?: { n?: string; l?: number; t?: string; c?: Array<number | string> };
};

type GarlandItemResponse = {
  item?: { nodes?: number[]; vendors?: number[]; quests?: number[]; drops?: number[] };
  partials?: GarlandPartial[];
};

function formatCoordinates(coordinates?: Array<number | string>) {
  return coordinates && coordinates.length >= 2 ? ` (${coordinates[0]}, ${coordinates[1]})` : '';
}

export async function loadItemSources(itemId: number) {
  const response = await fetch(`https://www.garlandtools.org/db/doc/item/en/3/${itemId}.json`);
  if (!response.ok) throw new Error('No se pudo cargar la guía de obtención.');

  const payload = (await response.json()) as GarlandItemResponse;
  const nodeIds = new Set((payload.item?.nodes ?? []).map(String));
  const vendorIds = new Set((payload.item?.vendors ?? []).map(String));
  const questIds = new Set((payload.item?.quests ?? []).map(String));
  const mobIds = new Set((payload.item?.drops ?? []).map(String));
  const sources: ItemSource[] = [];

  for (const partial of payload.partials ?? []) {
    const id = partial.id;
    const name = partial.obj?.n;
    if (!id || !name) continue;
    if (partial.type === 'node' && nodeIds.has(id)) sources.push({ kind: 'gathering', name, detail: partial.obj?.l ? `Nodo de recolección · Nivel ${partial.obj.l}` : 'Nodo de recolección' });
    if (partial.type === 'npc' && vendorIds.has(id)) sources.push({ kind: 'vendor', name, detail: `${partial.obj?.t ?? 'Vendedor'}${formatCoordinates(partial.obj?.c)}` });
    if (partial.type === 'quest' && questIds.has(id)) sources.push({ kind: 'quest', name, detail: partial.obj?.l ? `Misión · ${partial.obj.l}` : 'Misión' });
    if (partial.type === 'mob' && mobIds.has(id)) sources.push({ kind: 'mob', name, detail: partial.obj?.l ? `Enemigo · Nivel ${partial.obj.l}` : 'Enemigo' });
  }

  return sources;
}
