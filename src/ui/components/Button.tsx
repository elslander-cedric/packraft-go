import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import "./Button.css";

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className" | "render"> & { className?: string };

/** A plain button with our styling (Base UI Button, ADR 0020). */
export function Button({ className, ...props }: ButtonProps) {
  return <BaseButton type="button" className={className ? `button ${className}` : "button"} {...props} />;
}
