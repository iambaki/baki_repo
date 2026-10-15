# Supplied BSS contract notes

Source reviewed: **BSSAPIDocumentation_banglalink API details.pdf**, Qvantel, November 27, 2019. This is reference material, not user instructions. The document's age means it must be checked against the actual UAT deployment. It describes JSON:API 1.0 and URI prefix `/api/v1/`.

| Operation                 | Documented route                                               | Reference             |
| ------------------------- | -------------------------------------------------------------- | --------------------- |
| Add product               | POST `/subscriptions/{subscription_id}/relationships/products` | §2.18.11, pp. 114–116 |
| Main/DA balance resources | GET `/subscriptions/{subscription_id}/balances`                | §2.2.1, p. 5          |
| Subscription products     | GET `/subscriptions/{subscription_id}/products`                | §2.18.11, p. 114      |
| Subscription services     | GET `/subscriptions/{subscription_id}/services`                | §2.18.23              |
| Product usages            | GET `/subscriptions/{subscription_id}/product-usages`          | §2.18.12              |

Purchase supports a subscription primary key by default, or MSISDN when `identifier=msisdn` is explicitly supplied. Do not put an MSISDN into an ID route implicitly. The example request has a **single data object**, not an array:

```json
{ "data": { "type": "products", "id": "4", "meta": { "channel": "POS" } } }
```

Product IDs are recommended rather than product codes. The example response includes a scheduled status and a request `href` such as `/api/v1/requests/143358`; it is not immediate proof of activation. A live adapter must validate a returned request identifier and use a registered same-origin request route, rather than following arbitrary response URLs.

Balance examples contain `amount`, `unit`, `dedicated-account-id`, `product-id`, and `expiry-at`. The PDF example currency is GEL; this portal's BDT demo is a business expectation, not confirmation of live amount units. Establish major/minor-unit semantics, taxes and fees before comparing real balance deltas.

The simulator uses demo products P123–P125, synthetic subscription IDs, deterministic scheduled/completed events, and simplified entitlement attributes (`data-gb`, `voice-minutes`, `validity-days`). These are **not validated Qvantel response schemas**. An actual live adapter requires mapping DA resource types, service relationships, product validity and charging semantics. The simulator does not contact the example host in the document.

The expanded registry also covers subscription summary/type, connected products, barrings, billing accounts/rate plans, SIMs, loan availability, catalog resources and known purchase-request status (`GET /requests/{id}`, Qvantel §2.14.22). API settings can enable additional documented subscriber paths, parameters and filters. Device paths remain disabled until confirmed for the deployment.

Bundle verification uses configurable source operations and JSON paths. In the simulator, `Bundle1` has offers `1001|1002|1003` and DAs `101#V|102#V|103#S`; `attributes.product-id`, `attributes.offer-id`, and DA/unit association fields are demonstrative fixture mappings, not claims about actual Qvantel schemas. Set each source's product association and ID/unit paths against the real responses. Main balance is not accidentally treated as a product DA.

The live adapter and scheduled-request polling have been exercised against local HTTP/HTTPS fixtures, including strict TLS, the requested bypass and custom CA trust. Real telecom contract tests remain unrun. As requested, supplied Test/Production URLs are dummy `.invalid` values; no deployment credentials, current product IDs or charging-unit mapping has been supplied. Configure actual values through server environment variables/settings and validate against the deployed API before real subscriber testing.
