import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex items-center rounded-md border border-border bg-card p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "label-mono rounded-sm px-2.5 py-1 transition-colors",
            "focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
