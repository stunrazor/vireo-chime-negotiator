import { useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent, type InputHTMLAttributes } from 'react';

type FormattedNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'name' | 'min' | 'max' | 'step' | 'value' | 'defaultValue' | 'onChange'
> & {
  name?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
};

export function normalizeNumberInput(value: string) {
  const withoutGrouping = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const negative = withoutGrouping.startsWith('-');
  const unsigned = withoutGrouping.replace(/-/g, '');
  const decimalIndex = unsigned.indexOf('.');
  const hasDecimal = decimalIndex >= 0;
  const integerPart = (hasDecimal ? unsigned.slice(0, decimalIndex) : unsigned).replace(/\D/g, '');
  const fractionPart = hasDecimal
    ? unsigned.slice(decimalIndex + 1).replace(/\D/g, '')
    : '';
  const integer = integerPart || (hasDecimal ? '0' : '');

  return `${negative ? '-' : ''}${integer}${hasDecimal ? `.${fractionPart}` : ''}`;
}

function formatNumberInput(value: string) {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const decimalIndex = unsigned.indexOf('.');
  const integer = decimalIndex >= 0 ? unsigned.slice(0, decimalIndex) : unsigned;
  const fraction = decimalIndex >= 0 ? unsigned.slice(decimalIndex + 1) : '';
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${negative ? '-' : ''}${groupedInteger}${decimalIndex >= 0 ? `.${fraction}` : ''}`;
}

function canonicalizeNumberInput(value: string) {
  if (!value) return '';
  if (value === '-' || value === '.' || value === '-.') return '';
  const withoutTrailingDot = value.endsWith('.') ? value.slice(0, -1) : value;
  const negative = withoutTrailingDot.startsWith('-');
  const unsigned = negative ? withoutTrailingDot.slice(1) : withoutTrailingDot;
  const decimalIndex = unsigned.indexOf('.');
  const integer = (decimalIndex >= 0 ? unsigned.slice(0, decimalIndex) : unsigned)
    .replace(/^0+(?=\d)/, '') || '0';
  const fraction = decimalIndex >= 0 ? unsigned.slice(decimalIndex + 1) : '';

  return `${negative ? '-' : ''}${integer}${decimalIndex >= 0 ? `.${fraction}` : ''}`;
}

function validationMessage(value: string, min?: number, max?: number, step?: number | 'any', required?: boolean) {
  if (!value) return required ? 'Enter a number.' : '';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Enter a valid number.';
  if (min !== undefined && number < min) return `Enter a number of at least ${min}.`;
  if (max !== undefined && number > max) return `Enter a number no greater than ${max}.`;

  const increment = step === undefined ? 1 : step;
  if (increment !== 'any' && increment > 0) {
    const base = min ?? 0;
    const stepPosition = (number - base) / increment;
    if (Math.abs(stepPosition - Math.round(stepPosition)) > 1e-8) {
      return `Use increments of ${increment}.`;
    }
  }
  return '';
}

function caretForRawPosition(displayValue: string, rawPosition: number) {
  let rawCharacters = 0;
  let displayPosition = 0;
  while (displayPosition < displayValue.length && rawCharacters < rawPosition) {
    if (displayValue[displayPosition] !== ',') rawCharacters += 1;
    displayPosition += 1;
  }
  return displayPosition;
}

export function FormattedNumberInput({
  name,
  min,
  max,
  step,
  value,
  defaultValue,
  onValueChange,
  onBlur,
  onInvalid,
  inputMode,
  required,
  disabled,
  title,
  ...inputProps
}: FormattedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() =>
    normalizeNumberInput(String(value ?? defaultValue ?? '')),
  );
  const rawValue = normalizeNumberInput(String(value ?? draft));
  const formattedValue = formatNumberInput(rawValue);
  const resolvedStep = step === undefined ? 1 : step;
  const resolvedInputMode = inputMode || (
    resolvedStep === 'any' || (typeof resolvedStep === 'number' && !Number.isInteger(resolvedStep))
      ? 'decimal'
      : min !== undefined && min < 0
        ? 'decimal'
        : 'numeric'
  );

  const updateValue = (nextValue: string) => {
    setDraft(nextValue);
    onValueChange?.(nextValue);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selection = input.selectionStart ?? input.value.length;
    const rawBeforeCaret = normalizeNumberInput(input.value.slice(0, selection));
    const nextValue = normalizeNumberInput(input.value);
    updateValue(nextValue);
    input.setCustomValidity(validationMessage(nextValue, min, max, step, required));

    const nextDisplayValue = formatNumberInput(nextValue);
    requestAnimationFrame(() => {
      const currentInput = inputRef.current;
      if (!currentInput) return;
      const caret = caretForRawPosition(nextDisplayValue, rawBeforeCaret.length);
      currentInput.setSelectionRange(caret, caret);
    });
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextValue = canonicalizeNumberInput(rawValue);
    if (nextValue !== rawValue) updateValue(nextValue);
    event.currentTarget.setCustomValidity(validationMessage(nextValue, min, max, step, required));
    onBlur?.(event);
  };

  const handleInvalid = (event: FormEvent<HTMLInputElement>) => {
    event.currentTarget.setCustomValidity(validationMessage(rawValue, min, max, step, required));
    onInvalid?.(event);
  };

  return <>
    <input
      {...inputProps}
      ref={inputRef}
      type="text"
      inputMode={resolvedInputMode}
      value={formattedValue}
      required={required}
      disabled={disabled}
      title={title || 'Thousands use commas; decimals use a dot.'}
      onChange={handleChange}
      onBlur={handleBlur}
      onInvalid={handleInvalid}
    />
    {name && <input type="hidden" name={name} value={rawValue} disabled={disabled} />}
  </>;
}