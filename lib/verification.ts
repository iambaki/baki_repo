import { z } from "zod";
import { randomUUID } from "node:crypto";
import { allSubscribers, get, save } from "./db";
import { assertSubscriber, settings, environmentId, HttpError } from "./policy";
import { operationRequest, redact } from "./bss";
import type { User } from "./types";
export type BatchRecord = {
  msisdn: string;
  productCode: string;
  offers: string[];
  das: { id: string; unit: "V" | "D" | "S" }[];
};
export function parseBatch(text: string, max: number): BatchRecord[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) throw new HttpError(400, "Paste CSV records first.");
  if (/^msisdn\s*,/i.test(lines[0])) lines.shift();
  if (!lines.length || lines.length > max)
    throw new HttpError(400, "Batch size must be between 1 and " + max + ".");
  return lines.map((line, index) => {
    const fields = line.split(",").map((s) => s.trim());
    if (fields.length !== 4)
      throw new HttpError(
        400,
        "Row " +
          (index + 1) +
          ": expected MSISDN,ProductCode,Offer,DA (four columns).",
      );
    const [msisdn, productCode, offer, da] = fields;
    if (
      !/^(01\d{9}|8801\d{9})$/.test(msisdn) ||
      !productCode ||
      productCode.length > 100
    )
      throw new HttpError(
        400,
        "Row " + (index + 1) + ": invalid MSISDN or product code.",
      );
    const offers = offer ? offer.split("|").map((o) => o.trim()) : [];
    const das = da
      ? da.split("|").map((item) => {
          const m = item.trim().match(/^([^#|\s]+)#([VDS])$/);
          if (!m)
            throw new HttpError(
              400,
              "Row " + (index + 1) + ": DA must use ID#V, ID#D, or ID#S.",
            );
          return { id: m[1], unit: m[2] as "V" | "D" | "S" };
        })
      : [];
    if (
      offers.some((o) => !o) ||
      new Set(offers).size !== offers.length ||
      new Set(das.map((d) => d.id + "#" + d.unit)).size !== das.length
    )
      throw new HttpError(400, "Duplicate or empty offer/DA expectation.");
    return {
      msisdn: msisdn.startsWith("880") ? "0" + msisdn.slice(3) : msisdn,
      productCode,
      offers,
      das,
    };
  });
}
export function at(value: unknown, path: string): unknown {
  if (!path) return value;
  return path
    .split(".")
    .reduce(
      (v, key) =>
        v && typeof v === "object"
          ? (v as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
export async function verifyBatch(
  user: User,
  environment: string,
  records: BatchRecord[],
) {
  const config = await settings();
  if (!records.length || records.length > config.maxBatchSize)
    throw new HttpError(400, "Invalid batch size.");
  const all = await allSubscribers();
  // Authorize the whole batch before any BSS call; prevent partial unauthorized execution.
  const subjects = records.map((r) =>
    assertSubscriber(
      user,
      all.find(
        (s) =>
          s.msisdn === r.msisdn &&
          environmentId(s.environment) === environmentId(environment),
      ),
      environment,
      config.sharingEnabled,
    ),
  );
  const results = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i],
      subject = subjects[i];
    const checks: {
        kind: string;
        expected: string;
        actual: string;
        ok: boolean;
      }[] = [],
      evidence: unknown[] = [],
      observations: Record<string, unknown[]> = {};
    try {
      const responses = new Map<string, unknown>();
      for (const source of config.verification) {
        if (!responses.has(source.operationId)) {
          const response = await operationRequest(
            user,
            environment,
            source.operationId,
            subject,
          );
          evidence.push(response.evidence);
          if (response.status >= 400)
            throw new Error(
              "BSS " + source.operationId + " returned " + response.status,
            );
          responses.set(source.operationId, response.data);
        }
        const raw = at(responses.get(source.operationId), source.recordsPath);
        const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
        const relevant = rows.filter(
          (row) => String(at(row, source.productPath)) === record.productCode,
        );
        observations[source.id] = redact(relevant) as unknown[];
        if (source.kind === "product")
          checks.push({
            kind: source.label,
            expected: record.productCode,
            actual: relevant.length ? "Found" : "Missing",
            ok: relevant.length > 0,
          });
        if (source.kind === "offer")
          for (const offer of record.offers) {
            const found = relevant.some(
              (row) => String(at(row, source.idPath)) === offer,
            );
            checks.push({
              kind: source.label,
              expected: offer,
              actual: found ? "Found" : "Missing",
              ok: found,
            });
          }
        if (source.kind === "da")
          for (const da of record.das) {
            const rowsWithId = relevant.filter(
              (row) => String(at(row, source.idPath)) === da.id,
            );
            const unitMatches = rowsWithId.some((row) =>
              (source.units?.[da.unit] || [da.unit]).some(
                (unit) =>
                  unit.toLowerCase() ===
                  String(
                    at(row, source.unitPath || "attributes.unit"),
                  ).toLowerCase(),
              ),
            );
            checks.push({
              kind: source.label,
              expected: da.id + "#" + da.unit,
              actual: !rowsWithId.length
                ? "Missing"
                : unitMatches
                  ? "Matched"
                  : "Unit mismatch: " +
                    rowsWithId
                      .map((r) =>
                        String(at(r, source.unitPath || "attributes.unit")),
                      )
                      .join("|"),
              ok: unitMatches,
            });
          }
      }
      for (const kind of [
        "product",
        ...(record.offers.length ? ["offer"] : []),
        ...(record.das.length ? ["da"] : []),
      ])
        if (!config.verification.some((s) => s.kind === kind))
          checks.push({
            kind,
            expected: "Configured verification API",
            actual: "No mapping configured",
            ok: false,
          });
      results.push({
        ...record,
        msisdn: redact(record.msisdn),
        status: checks.length && checks.every((c) => c.ok) ? "OK" : "NOT OK",
        checks,
        evidence,
        observations,
      });
    } catch (e) {
      results.push({
        ...record,
        msisdn: redact(record.msisdn),
        status: "NOT OK",
        checks,
        evidence,
        observations,
        error: e instanceof Error ? e.message : "Verification error",
      });
    }
  }
  const report = {
    id: randomUUID(),
    createdBy: user.id,
    environment: environmentId(environment),
    createdAt: new Date().toISOString(),
    results,
  };
  await save("bundle-report", report.id, report);
  return report;
}
