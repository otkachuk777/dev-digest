import { s } from "./styles";

/** Inline validation message under a field; renders nothing without a message. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <div id={id} role="alert" style={s.error}>
      {message}
    </div>
  );
}
