import { ButtonHTMLAttributes } from "react";
import Link from "next/link";

type Variant = "primary" | "outline" | "ghost";

const base = "inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold transition active:scale-[0.98]";
const variants: Record<Variant, string> = {
  primary: "bg-gold text-ink hover:brightness-110",
  outline: "border border-white/25 text-white hover:border-gold hover:text-gold",
  ghost: "text-muted hover:text-white",
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
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
