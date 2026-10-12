import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { useId } from "react";
import "./NumberField.css";

export type NumberFieldProps = {
  label: string;
  hint?: string;
  defaultValue: number;
  /** Arrow keys step by this much; stepping never goes below it. */
  step: number;
  /** Marks the field as holding a value that can't be used. */
  invalid?: boolean;
  /** Every parseable value typed or stepped to; null while the field is empty. */
  onValueChange: (value: number | null) => void;
};

/**
 * A labelled number input (Base UI Number Field, ADR 0020). It keeps what the
 * planner types, even out of range; arrow keys step by `step`.
 */
export function NumberField({ label, hint, defaultValue, step, invalid = false, onValueChange }: NumberFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <BaseNumberField.Root
      id={id}
      className="number-field"
      defaultValue={defaultValue}
      step={step}
      smallStep={step}
      min={step}
      allowOutOfRange
      // Decimal point, matching the English UI (ADR 0013).
      locale="en-US"
      format={{ useGrouping: false, maximumFractionDigits: 6 }}
      onValueChange={(value) => onValueChange(value)}
    >
      <label htmlFor={id} className="number-field-label">
        {label}
      </label>
      <BaseNumberField.Input
        className="number-field-input"
        aria-invalid={invalid}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className="number-field-hint">
          {hint}
        </p>
      )}
    </BaseNumberField.Root>
  );
}
