import { beforeEach, describe, expect, it, vi } from "vitest";

// Parcours du serveur après le dépôt (submitFiscalDocuments), base et stockage simulés :
// ordre des contrôles, délai de lecture dépassé, NIF changé pendant la lecture.
vi.mock("server-only", () => ({}));
const admin = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.current }));
vi.mock("./ocr", () => ({ readCardTexts: vi.fn() }));
vi.mock("./files", () => ({ notifyAdmins: vi.fn(), removeFiles: vi.fn(async () => true), sweepFolder: vi.fn() }));

import { notifyAdmins, removeFiles } from "./files";
import { readCardTexts } from "./ocr";
import { submitFiscalDocuments } from "./service";

const WS = "11111111-1111-4111-8111-111111111111";
const FRONT = `${WS}/22222222-2222-4222-8222-222222222222.png`;
const BACK = `${WS}/33333333-3333-4333-8333-333333333333.png`;
const REQUEST = "44444444-4444-4444-8444-444444444444";
const NUMBERS = { nif: "3000123456", stat: "74111112020001234" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ORIGIN = "https://app.test";

type Options = {
  files?: Record<string, Uint8Array<ArrayBuffer> | null>;
  pending?: { front_path: string | null; back_path: string | null }[];
  decide?: { data?: unknown; error?: { message: string; code?: string } | null };
};

// Client serveur simulé : téléchargements, suppressions et appels de fonctions notés.
function fakeAdmin({ files = { [FRONT]: PNG, [BACK]: PNG }, pending = [], decide = { data: [{ front_path: FRONT, back_path: BACK }], error: null } }: Options = {}) {
  const calls = { download: [] as string[], remove: [] as string[][], rpc: [] as string[] };
  const query = (rows: unknown) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: NUMBERS, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  const client = {
    storage: {
      from: () => ({
        download: async (path: string) => {
          calls.download.push(path);
          const bytes = files[path];
          return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: "not found" } };
        },
        remove: async (paths: string[]) => {
          calls.remove.push(paths);
          return { error: null };
        },
      }),
    },
    rpc: async (name: string) => {
      calls.rpc.push(name);
      if (name === "submit_fiscal_verification") return { data: REQUEST, error: null };
      return { data: decide.data ?? null, error: decide.error ?? null };
    },
    from: () => query(pending),
  };
  admin.current = client;
  return calls;
}

const submit = (fiscal_status = "unverified", files = { front: FRONT, back: BACK }) =>
  submitFiscalDocuments({ id: WS, name: "Studio Hery", fiscal_status }, files, ORIGIN);

beforeEach(() => {
  vi.mocked(readCardTexts).mockReset();
  vi.mocked(notifyAdmins).mockReset();
  vi.mocked(removeFiles).mockClear();
});

describe("submitFiscalDocuments", () => {
  it.each([
    ["verified", "fiscal_already_verified"],
    ["pending", "fiscal_already_pending"],
  ])("carte %s : refus avant tout téléchargement, rien supprimé", async (status, error) => {
    const calls = fakeAdmin();
    expect(await submit(status)).toEqual({ error });
    expect(calls.download).toEqual([]);
    expect(calls.remove).toEqual([]);
  });

  it("photo illisible : files_invalid, seules les photos hors demande en attente sont supprimées", async () => {
    // Envoi simultané depuis un autre onglet : FRONT appartient déjà à une demande en attente.
    const calls = fakeAdmin({ files: { [FRONT]: PNG, [BACK]: null }, pending: [{ front_path: FRONT, back_path: "x" }] });
    expect(await submit()).toEqual({ error: "files_invalid" });
    expect(calls.remove).toEqual([[BACK]]);
    expect(calls.rpc).toEqual([]);
  });

  it("délai de lecture dépassé (rien lu) : en attente, admins prévenus", async () => {
    const calls = fakeAdmin();
    vi.mocked(readCardTexts).mockResolvedValue(null);
    expect(await submit()).toEqual({ status: "pending" });
    expect(calls.rpc).toEqual(["submit_fiscal_verification"]);
    expect(notifyAdmins).toHaveBeenCalledWith(admin.current, { id: REQUEST, workspaceName: "Studio Hery" }, ORIGIN);
  });

  it("lecture partielle (NIF seul avant le délai) : en attente, admins prévenus", async () => {
    const calls = fakeAdmin();
    vi.mocked(readCardTexts).mockResolvedValue(["NIF 3000123456"]);
    expect(await submit()).toEqual({ status: "pending" });
    expect(calls.rpc).toEqual(["submit_fiscal_verification"]);
    expect(notifyAdmins).toHaveBeenCalledOnce();
  });

  it("numéros lus : vérifiée, photos supprimées, aucun avis aux admins", async () => {
    const calls = fakeAdmin();
    vi.mocked(readCardTexts).mockResolvedValue(["NIF 3000123456", "STAT 74111 11 2020 0 01234"]);
    expect(await submit()).toEqual({ status: "verified" });
    expect(calls.rpc).toEqual(["submit_fiscal_verification", "decide_fiscal_verification"]);
    expect(removeFiles).toHaveBeenCalledWith(admin.current, { front_path: FRONT, back_path: BACK });
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("NIF changé pendant la lecture : décision refusée, rien de vérifié, avis laissé à notifyAdmins (qui ignore une demande annulée)", async () => {
    const calls = fakeAdmin({ decide: { error: { message: "fiscal_request_not_pending", code: "55000" } } });
    vi.mocked(readCardTexts).mockResolvedValue(["NIF 3000123456", "STAT 74111112020001234"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await submit()).toEqual({ status: "pending" });
    log.mockRestore();
    expect(calls.rpc).toEqual(["submit_fiscal_verification", "decide_fiscal_verification"]);
    expect(removeFiles).not.toHaveBeenCalled();
    expect(notifyAdmins).toHaveBeenCalledOnce();
  });
});
