import zeroworkDragonUrl from "@/assets/zerowork-dragon.svg";
import { cn } from "@/components/lib/utils.js";

export function ZCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={zeroworkDragonUrl}
      alt="ZeroWork"
      className={cn("shrink-0", className)}
      draggable={false}
    />
  );
}

export function ZCodeWordmarkLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-3 text-current", className)}>
      <ZCodeAboutLogo className="size-9" />
      <span className="text-2xl font-semibold tracking-tight">ZeroWork</span>
    </div>
  );
}
