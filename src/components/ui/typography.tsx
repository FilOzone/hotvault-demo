import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TypographyVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "body"
  | "small"
  | "blockquote"
  | "list"
  | "inlineCode"
  | "lead"
  | "large"
  | "muted";

type TypographyElement =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "p"
  | "blockquote"
  | "ul"
  | "code"
  | "div"
  | "small";

interface TypographyProps extends HTMLAttributes<HTMLElement> {
  variant: TypographyVariant;
  as?: TypographyElement;
  children: React.ReactNode;
}

const variantStyles: Record<TypographyVariant, string> = {
  h1: "text-lg font-light tracking-widest uppercase",
  h2: "text-4xl md:text-5xl font-light tracking-tight",
  h3: "text-base font-light uppercase tracking-widest",
  h4: "text-xs uppercase tracking-widest font-light",
  body: "font-light leading-relaxed",
  small: "text-sm font-light",
  blockquote: "mt-6 border-l-2 pl-6 italic [&>*]:text-muted-foreground",
  list: "my-6 ml-6 list-disc [&>li]:mt-2",
  inlineCode:
    "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
  lead: "text-xl text-muted-foreground",
  large: "text-lg font-semibold",
  muted: "text-sm text-muted-foreground",
};

const defaultElements: Record<TypographyVariant, TypographyElement> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  small: "p",
  blockquote: "blockquote",
  list: "ul",
  inlineCode: "code",
  lead: "p",
  large: "div",
  muted: "p",
};

export function Typography({
  variant = "body", // default variant
  as,
  children,
  className,
  ...props
}: TypographyProps) {
  const Component = as || defaultElements[variant];

  return (
    <Component className={cn(variantStyles[variant], className)} {...props}>
      {children}
    </Component>
  );
}
