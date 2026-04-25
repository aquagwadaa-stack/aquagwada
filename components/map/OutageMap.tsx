import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Commune } from "@/lib/queries/communes";
import type { Outage } from "@/lib/queries/outages";
import { useMemo } from "react";

export function OutageMap({ communes, outages }: { communes: Commune[]; outages: Outage[] }) {
  const byCommune = useMemo(() => {
    const map = new Map<string, Outage[]>();
    for (const o of outages) {
      const list = map.get(o.commune_id) ?? [];
      list.push(o);
      map.set(o.commune_id, list);
    }
    return map;
  }, [outages]);

  return (
    <MapContainer center={[16.25, -61.55]} zoom={10} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {communes.filter((c) => c.latitude && c.longitude).map((c) => {
        const items = byCommune.get(c.id) ?? [];
        const has = items.length > 0;
        const ongoing = items.some((o) => o.status === "ongoing");
        const color = ongoing ? "oklch(0.62 0.22 25)" : has ? "oklch(0.78 0.16 75)" : "oklch(0.62 0.16 220)";
        const radius = has ? 11 : 6;
        return (
          <CircleMarker
            key={c.id}
            center={[c.latitude!, c.longitude!]}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity: has ? 0.55 : 0.35, weight: 2 }}
          >
            <Tooltip>
              <div className="text-xs">
                <strong>{c.name}</strong>
                <div>{has ? `${items.length} coupure${items.length > 1 ? "s" : ""}` : "RAS"}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}