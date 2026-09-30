import type { Category } from "@/db/schema";
import { Star } from "./icons";

export function CategoryChip({ category, className = "" }: { category: Category | undefined; className?: string }) {
  if (!category) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: `${category.color}1f`, color: category.color }}
    >
      <span aria-hidden>{category.emoji}</span>
      {category.label}
    </span>
  );
}

export function GoogleRating({ rating, count }: { rating: number | null | undefined; count?: number | null }) {
  if (rating == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular-nums">
      <Star className="size-3.5 text-star" />
      <span className="font-semibold">{rating.toFixed(1)}</span>
      {count != null && <span className="text-muted">({count.toLocaleString("en-GB")})</span>}
    </span>
  );
}

export function PriceLevel({ level }: { level: number | null | undefined }) {
  if (level == null) return null;
  if (level === 0) return <span className="text-sm text-muted">Free</span>;
  return (
    <span className="text-sm tracking-tight" aria-label={`Price level ${level} of 4`}>
      <span>{"£".repeat(level)}</span>
      <span className="text-muted/40">{"£".repeat(4 - level)}</span>
    </span>
  );
}

export function OurRating({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex text-accent" aria-label={`Our rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= value} className="size-3.5" />
      ))}
    </span>
  );
}
