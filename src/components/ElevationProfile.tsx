import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { profileSeries, type GpxPoint } from "@/lib/gpx";

export function ElevationProfile({ points }: { points: GpxPoint[] }) {
  const data = profileSeries(points);
  if (data.length < 2) {
    return (
      <p className="text-corps text-muted" data-testid="gpx-profile-empty">
        Pas d’altitude dans ce GPX — le profil n’est pas tracé.
      </p>
    );
  }
  return (
    <div className="gpx-profile" data-testid="gpx-profile">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="km"
            tickFormatter={(v: number) => `${Number(v).toFixed(1)}`}
            tick={{ fontSize: 11 }}
            unit=" km"
          />
          <YAxis
            dataKey="ele"
            tickFormatter={(v: number) => `${Math.round(v)}`}
            tick={{ fontSize: 11 }}
            width={44}
            unit=" m"
          />
          <Tooltip
            formatter={(value: number) => [`${Math.round(value)} m`, "Altitude"]}
            labelFormatter={(label: number) => `${Number(label).toFixed(2)} km`}
          />
          <Area
            type="monotone"
            dataKey="ele"
            stroke="var(--color-cta)"
            fill="var(--color-glacier)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
