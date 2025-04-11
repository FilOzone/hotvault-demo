import { ReactNode } from "react";
import { theme } from "./config";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "blue";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  className = "",
}: ButtonProps) => {
  const baseStyles =
    "inline-flex items-center justify-center rounded-none font-light transition-colors";

  const variantStyles = {
    primary: "bg-black text-white hover:bg-gray-900 disabled:opacity-50",
    secondary: "border border-black text-black hover:bg-gray-50",
    blue: "bg-[#0090FF] text-white hover:opacity-90 disabled:opacity-50",
  };

  const sizeStyles = {
    sm: "h-9 px-4 text-sm",
    md: "h-10 px-6 text-sm",
    lg: "h-12 px-8 text-base",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </button>
  );
};

interface TextProps {
  children: ReactNode;
  variant?: "h1" | "h2" | "h3" | "h4" | "body" | "small";
  color?: "black" | "blue" | "white";
  className?: string;
}

export const Text = ({
  children,
  variant = "body",
  color = "black",
  className = "",
}: TextProps) => {
  const styles = {
    h1: "text-lg font-light tracking-widest uppercase",
    h2: "text-4xl md:text-5xl font-light tracking-tight",
    h3: "text-base font-light uppercase tracking-widest",
    h4: "text-xs uppercase tracking-widest font-light",
    body: "font-light leading-relaxed",
    small: "text-sm font-light",
  };

  const colorStyles = {
    black: "text-black",
    blue: "text-[#0090FF]",
    white: "text-white",
  };

  const Component = variant.startsWith("h") ? variant : "p";

  return (
    <Component
      className={`${styles[variant]} ${colorStyles[color]} ${className}`}
    >
      {children}
    </Component>
  );
};

interface ContainerProps {
  children: ReactNode;
  size?: keyof typeof theme.containers;
  background?: "white" | "black" | "light";
  className?: string;
}

export const Container = ({
  children,
  size = "xl",
  background = "white",
  className = "",
}: ContainerProps) => {
  const bgStyles = {
    white: "bg-white",
    black: "bg-black",
    light: "bg-[#F8F8F8]",
  };

  return (
    <div
      className={`max-w-${size} mx-auto px-6 ${bgStyles[background]} ${className}`}
    >
      {children}
    </div>
  );
};

interface InputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  variant?: "default" | "blue";
  className?: string;
}

export const Input = ({
  value,
  onChange,
  placeholder,
  type = "text",
  variant = "default",
  className = "",
}: InputProps) => {
  const variantStyles = {
    default: "border-gray-200 focus:ring-black",
    blue: "border-[#0090FF] focus:ring-[#0090FF]",
  };

  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`px-4 py-2 border focus:outline-none focus:ring-1 ${variantStyles[variant]} ${className}`}
    />
  );
};
