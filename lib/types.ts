export type Role = "Test Lead" | "Tester" | "Auditor";
export type User = { id: string; name: string; email: string; role: Role };
export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  days: number;
  dataGB: number;
  minutes: number;
  da: string;
  service: string;
};
export type Subscriber = {
  id: string;
  msisdn: string;
  owner: string;
  environment: "UAT";
  status: "Active" | "Restricted";
  tags: string[];
};
export type Check = {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
};
export type Evidence = {
  timestamp: string;
  operation: string;
  method: string;
  path: string;
  status: number;
  request?: unknown;
  response: unknown;
};
export type Result = {
  msisdn: string;
  status: "PASS" | "FAIL" | "ERROR";
  checks: Check[];
  evidence: Evidence[];
  error?: string;
};
export type Plan = {
  id: string;
  name: string;
  productId: string;
  subscriberIds: string[];
  environment: "UAT";
  source: "Structured" | "Prompt";
  scenario: "normal" | "balance-mismatch" | "purchase-error";
  createdBy: string;
  createdAt: string;
  steps: string[];
  status: "DRAFT" | "EXECUTED";
};
export type Run = {
  id: string;
  planId: string;
  name: string;
  productId: string;
  environment: "UAT";
  source: Plan["source"];
  createdBy: string;
  createdAt: string;
  durationMs: number;
  status: "PASS" | "FAIL" | "ERROR" | "PARTIAL";
  results: Result[];
};
export type Audit = {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
};
export const mask = (value: string) =>
  value.slice(0, 3) + "•••••" + value.slice(-3);
