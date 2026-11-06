import { cn } from "@/lib/cn";

export const buttonClasses = {
  base: "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-body-sm font-semibold transition-colors duration-fast disabled:opacity-50",
  primary: "bg-accent text-accent-contrast hover:bg-accent/90",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-raised",
  ghost: "text-text-2 hover:bg-surface-raised hover:text-text",
};

export function Button({ variant = "secondary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button type="button" className={cn(buttonClasses.base, buttonClasses[variant], className)} {...props} />;
}
