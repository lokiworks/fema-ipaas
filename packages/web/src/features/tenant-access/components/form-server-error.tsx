export function FormServerError({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <p
      className="text-sm font-medium text-destructive"
      role="alert"
      data-testid="form-server-error"
    >
      {message}
    </p>
  );
}
