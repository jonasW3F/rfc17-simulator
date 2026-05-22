import { useEffect, useRef, useState } from "react";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: number;
  onChange: (n: number) => void;
  /** If true, an empty/invalid string emits 0 instead of being ignored. Default: true. */
  emitZeroOnEmpty?: boolean;
};

export function NumInput({
  value,
  onChange,
  emitZeroOnEmpty = true,
  ...rest
}: Props) {
  const [text, setText] = useState(() => String(value));
  const focused = useRef(false);

  // Sync from prop when the underlying value changes externally (e.g. reset
  // button). Don't fight the user while they're editing.
  useEffect(() => {
    if (focused.current) return;
    const parsed = parseFloat(text);
    const matches = Number.isNaN(parsed) ? value === 0 : parsed === value;
    if (!matches) setText(String(value));
  }, [value, text]);

  return (
    <input
      type="number"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (text === "" || text === "-") setText(String(value));
      }}
      onChange={e => {
        const t = e.target.value;
        setText(t);
        if (t === "" || t === "-") {
          if (emitZeroOnEmpty) onChange(0);
          return;
        }
        const n = parseFloat(t);
        if (!Number.isNaN(n)) onChange(n);
      }}
      {...rest}
    />
  );
}
