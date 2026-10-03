import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Failure } from "./ResultNotice";
import type { ClearTarget } from "./useResultsState";

export function ClearCaptureDialog({
  target,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  target?: ClearTarget;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear {target?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove this capture’s retained files and metadata. Already exported
            files and Locus entries stay saved. Exports already in progress may
            still finish.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Failure title="Could not clear capture" message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Clearing…" : "Clear capture"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
