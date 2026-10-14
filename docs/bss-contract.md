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

No usable UAT base URL, deployed authentication scheme, runtime credentials, current product IDs, or charging-unit mapping has been configured. Live contract tests are intentionally unrun. Before integrating, provide these through approved environment/secret settings; do not paste secret values into chat or commit them.
