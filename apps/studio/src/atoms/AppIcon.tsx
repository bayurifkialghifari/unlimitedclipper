export function AppIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/app-icon.svg"
      alt="UnlimitedClipper"
      width={size}
      height={size}
      className={className}
    />
  );
}
