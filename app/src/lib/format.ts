const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const compactNum = (n: number) => compact.format(n);

export function timeAgo(iso: string | number) {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, string][] = [
    [31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"],
  ];
  for (const [s, name] of units) {
    if (sec >= s) {
      const n = Math.floor(sec / s);
      return `${n} ${name}${n > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}
