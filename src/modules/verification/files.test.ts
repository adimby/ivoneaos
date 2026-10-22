import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/supabase/admin";

// Avis aux admins : jamais pour une demande qui n'est plus en attente (NIF ou STAT changé
// pendant la lecture : demande annulée, son lien mènerait à une page introuvable).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => "sent") }));

import { sendEmail } from "@/lib/email";
import { notifyAdmins } from "./files";

function fakeAdmin(status: string | null) {
  const updates: unknown[] = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: status ? { status } : null, error: null }),
    update: (values: unknown) => {
      updates.push(values);
      return builder;
    },
    then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null }),
  };
  const client = {
    from: () => builder,
    rpc: async () => ({ data: ["ivonea@example.test"], error: null }),
  };
  return { client: client as unknown as AdminClient, updates };
}

beforeEach(() => vi.mocked(sendEmail).mockClear());

describe("notifyAdmins", () => {
  it.each(["cancelled", "verified", null])("demande %s : aucun e-mail, rien noté", async (status) => {
    const { client, updates } = fakeAdmin(status);
    await notifyAdmins(client, { id: "r1", workspaceName: "Studio Hery" }, "https://app.test");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("demande en attente : e-mail à chaque admin avec le lien, avis noté", async () => {
    const { client, updates } = fakeAdmin("pending");
    await notifyAdmins(client, { id: "r1", workspaceName: "Studio Hery" }, "https://app.test");
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: "ivonea@example.test" });
    expect(JSON.stringify(vi.mocked(sendEmail).mock.calls[0][0])).toContain("https://app.test/fr/admin/verifications/r1");
    expect(updates).toEqual([{ admins_notified_at: expect.any(String) }]);
  });
});
