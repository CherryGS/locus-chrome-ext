import { LoaderCircleIcon } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { TechnicalFailure } from "@/ui/shared/TechnicalFailure";

export function Failure({
  title,
  message,
  context,
}: {
  title: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  return (
    <TechnicalFailure
      collapsed
      title={title}
      message={message}
      context={context}
      onNotice={(title) => toast.add({ title })}
    />
  );
}
export function Pending({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <Alert role="status">
      <LoaderCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
