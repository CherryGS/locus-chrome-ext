import { useEffect, useState } from "react";
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
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    let current = true;
    void coordinator<{ origin: string; configured: boolean }>("locus-settings")
      .then((value) => {
        if (current) {
          if (value.origin) setOrigin(value.origin);
          setConfigured(value.configured);
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
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    setInvalid(false);
    try {
      const normalized = connectionInput(
        origin,
        token || "retained-token",
      ).origin;
      // Chrome needs the permission request inside this user gesture.
      if (
        !(await chrome.permissions.request({ origins: ["http://127.0.0.1/*"] }))
      )
        throw new Error("Local Locus access was not granted");
      await coordinator("locus-connect", { origin: normalized, token });
      setOrigin(normalized);
      setToken("");
      setConfigured(true);
      setMessage("");
      onConnected();
      toast.add({
        title: "Locus connection verified",
        description:
          "Complete new captures save automatically. Check an existing failed save from its capture.",
        type: "success",
      });
    } catch (error) {
      setInvalid(true);
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
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="locus-origin">Locus address</FieldLabel>
          <Input
            id="locus-origin"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            disabled={busy}
            aria-invalid={invalid}
            autoComplete="off"
          />
          <FieldDescription>
            Copy the active address from Locus Settings → External access.
          </FieldDescription>
        </Field>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="locus-token">Token</FieldLabel>
          <Input
            id="locus-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              configured
                ? "Leave blank to keep the saved Token"
                : "Paste the Token from Locus Settings"
            }
            disabled={busy}
            aria-invalid={invalid}
            autoComplete="off"
          />
        </Field>
        <Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Connect and save"}
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
