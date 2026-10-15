export const pages = [
  "Overview",
  "Test runs",
  "Test MSISDNs",
  "Product catalog",
  "API registry",
  "Environments",
  "Audit trail",
  "API portal",
  "Bundle verification",
  "Subscriber 360",
  "Product explorer",
  "Batch Report",
  "AI BSS Assistant",
  "Administration",
  "My account",
] as const;
export type PageName = (typeof pages)[number];
export type Permission =
  "bss.read" | "bss.write" | "bss.delete" | "reports.all" | "admin";
export type RoleDefinition = {
  id: string;
  name: string;
  pages: PageName[];
  permissions: Permission[];
  system?: boolean;
};
export type Environment = {
  id: "Test" | "Production";
  name: string;
  mode: "simulated" | "live";
  baseUrl: string;
  enabled: boolean;
  writesEnabled: boolean;
  tlsVerify: boolean;
  caFile?: string;
  tokenEnv?: string;
  auth: "none" | "bearer" | "basic";
  usernameEnv?: string;
  passwordEnv?: string;
  timeoutMs: number;
  pollAttempts: number;
  pollDelayMs: number;
};
export type Operation = {
  id: string;
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scope: "subscriber" | "catalog";
  parameters: { name: string; required: boolean }[];
  filters: string[];
  bodyTemplate?: unknown;
  source: string;
  enabled: boolean;
  columns: { label: string; path: string }[];
};
export type VerificationSource = {
  id: string;
  label: string;
  operationId: string;
  kind: "product" | "offer" | "da";
  recordsPath: string;
  productPath: string;
  idPath: string;
  unitPath?: string;
  units?: Record<string, string[]>;
};
export type PortalSettings = {
  sharingEnabled: boolean;
  productionApprovalRequired: boolean;
  registrationEnabled: boolean;
  maxBatchSize: number;
  defaultRole: string;
  sessionHours: number;
  ai: {
    mode: "rules" | "model";
    url: string;
    model: string;
    tokenEnv: string;
    enabled: boolean;
  };
  verification: VerificationSource[];
};
const columns = [
  { label: "ID", path: "id" },
  { label: "Type", path: "type" },
  { label: "Status", path: "attributes.status" },
];
const resources = [
  ["subscription", "Main account / lifecycle", ""],
  ["balances", "Balances / dedicated accounts", "/balances"],
  ["products", "Packages / products", "/products"],
  ["offers", "Connected products / offers", "/connected-products"],
  ["services", "Services", "/services"],
  ["usage", "Product usage", "/product-usages"],
  ["available", "Available products", "/available-products"],
  ["subscription-type", "Subscription type", "/subscription-type"],
  ["barrings", "Barrings", "/barrings"],
  ["loans", "Available loan products", "/available-loan-products"],
  ["billing", "Billing accounts", "/billing-accounts"],
  ["rate-plan", "Billing rate plan", "/billing-rate-plan"],
  ["sims", "SIM cards", "/sim-cards"],
  ["devices", "Devices", "/devices"],
  ["requests", "Product request status", "/requests/{requestId}"],
];
export const defaultOperations: Operation[] = resources.map(
  ([id, name, suffix]) => ({
    id,
    name,
    method: "GET",
    path:
      id === "requests"
        ? "/requests/{requestId}"
        : "/subscriptions/{subscriptionId}" + suffix,
    scope: "subscriber",
    parameters: [
      ...(id === "requests"
        ? [{ name: "requestId", required: true }]
        : [{ name: "subscriptionId", required: true }]),
    ],
    filters:
      id === "products"
        ? ["filter[status]", "filter[activation-from]", "filter[activation-to]"]
        : id === "usage"
          ? ["filter[from]", "filter[to]"]
          : [],
    source:
      id === "devices"
        ? "Deployment mapping required; disabled by default"
        : "Supplied Qvantel BSSAPI §2.18",
    enabled: id !== "devices",
    columns:
      id === "balances"
        ? [
            { label: "Account", path: "id" },
            { label: "Amount", path: "attributes.amount" },
            { label: "Unit", path: "attributes.unit" },
            {
              label: "Dedicated account",
              path: "attributes.dedicated-account-id",
            },
            { label: "Product", path: "attributes.product-id" },
          ]
        : columns,
  }),
);
defaultOperations.push({
  id: "purchase",
  name: "Add subscription product",
  method: "POST",
  path: "/subscriptions/{subscriptionId}/relationships/products",
  scope: "subscriber",
  parameters: [{ name: "subscriptionId", required: true }],
  filters: ["identifier"],
  bodyTemplate: {
    data: { type: "products", id: "P123", meta: { channel: "PTAT" } },
  },
  source: "Qvantel §2.18.11 pp. 114–116",
  enabled: true,
  columns,
});
defaultOperations.push({
  id: "catalog",
  name: "Product catalog resource",
  method: "GET",
  path: "/products/{productId}",
  scope: "catalog",
  parameters: [{ name: "productId", required: true }],
  filters: [],
  source: "Qvantel §2.14",
  enabled: true,
  columns,
});
defaultOperations.push({
  id: "barring-add",
  name: "Add barring",
  method: "POST",
  path: "/subscriptions/{subscriptionId}/relationships/barrings",
  scope: "subscriber",
  parameters: [{ name: "subscriptionId", required: true }],
  filters: [],
  bodyTemplate: { data: [{ type: "barrings", id: "BARALL" }] },
  source: "Qvantel §2.18.16",
  enabled: true,
  columns,
});
defaultOperations.push({
  id: "barring-delete",
  name: "Remove barring",
  method: "DELETE",
  path: "/subscriptions/{subscriptionId}/relationships/barrings",
  scope: "subscriber",
  parameters: [{ name: "subscriptionId", required: true }],
  filters: [],
  bodyTemplate: { data: [{ type: "barrings", id: "BARALL" }] },
  source: "Qvantel §2.18.16",
  enabled: true,
  columns,
});
export const defaultSettings: PortalSettings = {
  sharingEnabled: true,
  productionApprovalRequired: true,
  registrationEnabled: true,
  maxBatchSize: 50,
  defaultRole: "Tester",
  sessionHours: 8,
  ai: {
    mode: "rules",
    url: "",
    model: "",
    tokenEnv: "PTAT_AI_TOKEN",
    enabled: true,
  },
  verification: [
    {
      id: "product",
      label: "Product activation",
      operationId: "products",
      kind: "product",
      recordsPath: "data",
      productPath: "relationships.product.data.id",
      idPath: "relationships.product.data.id",
    },
    {
      id: "offer",
      label: "Associated offers",
      operationId: "offers",
      kind: "offer",
      recordsPath: "data",
      productPath: "attributes.product-id",
      idPath: "attributes.offer-id",
    },
    {
      id: "da",
      label: "Dedicated accounts",
      operationId: "balances",
      kind: "da",
      recordsPath: "data",
      productPath: "attributes.product-id",
      idPath: "attributes.dedicated-account-id",
      unitPath: "attributes.unit",
      units: {
        V: ["minutes", "seconds", "V"],
        D: ["bytes", "KB", "MB", "GB", "D"],
        S: ["SMS", "messages", "S"],
      },
    },
  ],
};
export const defaultEnvironments: Environment[] = [
  {
    id: "Test",
    name: "Test",
    mode: "simulated",
    baseUrl: "https://bss-test.example.invalid/api/v1",
    enabled: true,
    writesEnabled: true,
    tlsVerify: true,
    auth: "none",
    timeoutMs: 15000,
    pollAttempts: 10,
    pollDelayMs: 1000,
  },
  {
    id: "Production",
    name: "Production",
    mode: "live",
    baseUrl: "https://bss-production.example.invalid/api/v1",
    enabled: false,
    writesEnabled: false,
    tlsVerify: true,
    auth: "bearer",
    tokenEnv: "PTAT_PRODUCTION_BSS_TOKEN",
    timeoutMs: 15000,
    pollAttempts: 10,
    pollDelayMs: 1000,
  },
];
const publicPages = pages.filter((p) => p !== "Administration");
export const defaultRoles: RoleDefinition[] = [
  {
    id: "Admin",
    name: "Admin",
    pages: [...pages],
    permissions: [
      "admin",
      "bss.read",
      "bss.write",
      "bss.delete",
      "reports.all",
    ],
    system: true,
  },
  {
    id: "Test Lead",
    name: "Test Lead",
    pages: [...publicPages],
    permissions: ["bss.read", "bss.write", "reports.all"],
  },
  {
    id: "Tester",
    name: "Tester",
    pages: [...publicPages].filter((p) => p !== "Audit trail"),
    permissions: ["bss.read", "bss.write"],
  },
  {
    id: "Auditor",
    name: "Auditor",
    pages: [...publicPages].filter(
      (p) =>
        !["API portal", "Bundle verification", "AI BSS Assistant"].includes(p),
    ),
    permissions: ["bss.read", "reports.all"],
  },
];
