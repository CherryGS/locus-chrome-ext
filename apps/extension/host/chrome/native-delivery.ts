import { errorMessage, isTerminalDelivery, type Delivery } from "@locus/capture-core/model";
import type { ResultDatabase } from "./database";

interface DeliveryHost {
  database: Pick<ResultDatabase, "saveDelivery" | "deliveries">;
  hasOwner: () => Promise<boolean>;
  owner: (
    operation: string,
    values: Record<string, unknown>,
  ) => Promise<unknown>;
}

/** Own native dispatch correlation and observation; never replay an uncertain download. */
export function createNativeDeliveryCoordinator({
  database,
  hasOwner,
  owner,
}: DeliveryHost) {
  const deliveries = new Map<string, Delivery>();
  const deliveryQueries = new Map<string, Promise<void>>();
  async function publishDelivery(delivery: Delivery) {
    if (deliveries.get(delivery.id)?.state === "complete")
      delivery = deliveries.get(delivery.id)!;
    deliveries.set(delivery.id, delivery);
    try {
      delivery = await database.saveDelivery(delivery);
      deliveries.set(delivery.id, delivery);
    } catch (error) {
      delivery.reason = `${delivery.reason ? delivery.reason + "; " : ""}Delivery correlation is not retained: ${errorMessage(error)}`;
    }
    if (await hasOwner()) await owner("delivery", { delivery });
  }
  function reconcileDelivery(delivery: Delivery): Promise<void> {
    const previous = deliveryQueries.get(delivery.id) ?? Promise.resolve();
    const query = previous
      .catch(() => {})
      .then(() => queryDelivery(deliveries.get(delivery.id) ?? delivery));
    deliveryQueries.set(delivery.id, query);
    void query
      .finally(() => {
        if (deliveryQueries.get(delivery.id) === query)
          deliveryQueries.delete(delivery.id);
      })
      .catch(() => {});
    return query;
  }
  async function queryDelivery(delivery: Delivery) {
    if (isTerminalDelivery(delivery.state)) return;
    if (!delivery.dispatch && delivery.downloadId === undefined) {
      // Packaging/ready backing is not evidence that native initiation happened.
      // Ask the actual owner before inferring loss, and never reissue downloads.
      try {
        if (await hasOwner()) {
          const state = await owner("export-state", { id: delivery.id });
          if (state) return;
        }
        delivery.state = "failed";
        delivery.reason =
          "Export packaging owner no longer exists; native delivery was not started";
      } catch (error) {
        delivery.reason = `Cannot query export owner: ${errorMessage(error)}`;
      }
      await publishDelivery(delivery);
      return;
    }
    try {
      const items =
        delivery.downloadId !== undefined
          ? await chrome.downloads.search({ id: delivery.downloadId })
          : delivery.url
            ? await chrome.downloads.search({ url: delivery.url })
            : [];
      if (items.length !== 1) {
        delivery.state = "unverified";
        delivery.reason =
          "Native delivery history is unavailable or ambiguous; no duplicate download was issued";
      } else {
        const item = items[0]!;
        delivery.downloadId = item.id;
        delivery.state =
          item.state === "complete"
            ? "complete"
            : item.state === "interrupted"
              ? "interrupted"
              : "in_progress";
        delivery.reason =
          item.error ||
          (item.paused
            ? "Browser download is paused; use Chrome downloads to continue"
            : item.danger !== "safe" && item.danger !== "accepted"
              ? "Chrome requires download review or intervention"
              : undefined);
      }
    } catch (error) {
      delivery.state = "unverified";
      delivery.reason = `Native state query failed: ${errorMessage(error)}`;
    }
    await publishDelivery(delivery);
  }
  async function reconcile() {
    const stored = await database.deliveries();
    for (const delivery of stored)
      if (!deliveries.has(delivery.id)) deliveries.set(delivery.id, delivery);
    for (const delivery of deliveries.values())
      await reconcileDelivery(delivery);
  }
  async function start(delivery: Delivery) {
    const url = delivery.url;
    if (!url) throw new Error("Native delivery backing is missing");
    const existing =
      deliveries.get(delivery.id) ??
      (await database.deliveries().catch(() => [])).find(
        (d) => d.id === delivery.id && d.downloadId !== undefined,
      );
    if (existing?.dispatch || existing?.downloadId !== undefined) {
      await reconcileDelivery(existing);
      return;
    }
    delivery.dispatch = "attempted";
    deliveries.set(delivery.id, delivery);
    await database.saveDelivery(delivery).catch(() => {});
    try {
      delivery.downloadId = await chrome.downloads.download({
        url,
        filename: `locus-${delivery.id}.zip`,
        saveAs: true,
      });
      delivery.state = "in_progress";
    } catch (error) {
      delivery.state = "failed";
      delivery.reason = errorMessage(error);
    }
    await publishDelivery(delivery);
    if (delivery.downloadId !== undefined) await reconcileDelivery(delivery);
    return;
  }
  async function changed(downloadId: number) {
    const all = [
      ...deliveries.values(),
      ...(await database.deliveries().catch(() => [])),
    ];
    const delivery = all.find((item) => item.downloadId === downloadId);
    if (delivery) await reconcileDelivery(delivery);
  }
  return { start, reconcile, changed };
}
