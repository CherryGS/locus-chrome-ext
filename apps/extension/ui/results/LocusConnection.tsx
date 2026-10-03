import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { coordinator } from "@/host/chrome/protocol";
import { connectionInput } from "@/host/locus/model";

export function LocusConnection({
  onConnected,
  onBusyChange,
}: {
  onConnected: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [origin, setOrigin] = useState("http://127.0.0.1:46321");
  const [token, setToken] = useState(""),
    [configured, setConfigured] = useState(false);
  const savedOrigin = useRef("");
  const originInput = useRef<HTMLInputElement>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const [originError, setOriginError] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let current = true;
    void coordinator<{ origin: string; configured: boolean }>("locus-settings")
      .then((value) => {
        if (current) {
          if (value.origin) setOrigin(value.origin);
          setConfigured(value.configured);
          savedOrigin.current = value.configured ? value.origin : "";
        }
      })
      .catch(() => {
        if (current) setMessage("Connection settings could not be read.");
      });
    return () => {
      current = false;
    };
  }, []);
  async function connect() {
    if (busy) return;
    setMessage("");
    let normalized = "";
    let addressError = "";
    let secretError = "";
    try {
      normalized = connectionInput(origin, "retained-token").origin;
    } catch {
      addressError =
        "Use the active http://127.0.0.1:port address from Locus Settings.";
    }
    // A blank Token can only reuse the connection saved for the same address.
    if (token || !savedOrigin.current || normalized !== savedOrigin.current) {
      try {
        connectionInput("http://127.0.0.1:46321", token);
      } catch {
        secretError = "Enter the current Locus Token.";
      }
    }
    setOriginError(addressError);
    setTokenError(secretError);
    if (addressError || secretError) {
      (addressError ? originInput : tokenInput).current?.focus();
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      // Chrome needs the permission request inside this user gesture.
      if (
        !(await chrome.permissions.request({ origins: ["http://127.0.0.1/*"] }))
      )
        throw new Error("Local Locus access was not granted");
      await coordinator("locus-connect", { origin: normalized, token });
      setOrigin(normalized);
      setToken("");
      setConfigured(true);
      savedOrigin.current = normalized;
      setMessage("");
      onConnected();
      toast.add({
        title: "Locus connection verified",
        description:
          "Complete new captures save automatically. Check an existing failed save from its capture.",
        type: "success",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <form
      aria-label="Locus connection"
      className="py-1"
      onSubmit={(event) => {
        event.preventDefault();
        void connect();
      }}
    >
      <FieldGroup>
        <FieldDescription>
          {configured
            ? "Connection configured. Verify or update it."
            : "Set up automatic saving for complete captures."}
        </FieldDescription>
        <Field data-invalid={!!originError}>
          <FieldLabel htmlFor="locus-origin">Locus address</FieldLabel>
          <Input
            id="locus-origin"
            ref={originInput}
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value);
              setOriginError("");
              setMessage("");
            }}
            disabled={busy}
            aria-invalid={!!originError}
            aria-describedby={
              originError
                ? "locus-origin-help locus-origin-error"
                : "locus-origin-help"
            }
            autoComplete="off"
          />
          <FieldDescription id="locus-origin-help">
            Copy the active address from Locus Settings → External access.
          </FieldDescription>
          {originError && (
            <FieldDescription id="locus-origin-error" role="alert">
              {originError}
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!tokenError}>
          <FieldLabel htmlFor="locus-token">Token</FieldLabel>
          <Input
            id="locus-token"
            ref={tokenInput}
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              setTokenError("");
              setMessage("");
            }}
            disabled={busy}
            aria-invalid={!!tokenError}
            aria-describedby={tokenError ? "locus-token-help locus-token-error" : "locus-token-help"}
            autoComplete="off"
          />
          <FieldDescription id="locus-token-help">
            {configured
              ? "Leave blank to reuse the saved Token at the saved Locus address."
              : "Copy the Token from Locus Settings → External access."}
          </FieldDescription>
          {tokenError && (
            <FieldDescription id="locus-token-error" role="alert">
              {tokenError}
            </FieldDescription>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Connect to Locus"}
          </Button>
          <FieldDescription role="status">
            {message ||
              "Twitter and Bilibili save directly to Locus after complete capture."}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
