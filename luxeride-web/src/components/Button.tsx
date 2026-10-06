import { ButtonHTMLAttributes } from "react";
import Link from "next/link";

type Variant = "primary" | "outline" | "ghost";

const base = "inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold transition active:scale-[0.98]";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110",
  outline: "border border-fg-muted/40 text-fg hover:border-accent hover:text-accent",
  ghost: "text-fg-muted hover:text-fg",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  onClick,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  /** Fires before navigation — used for analytics, never to block the link. */
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
