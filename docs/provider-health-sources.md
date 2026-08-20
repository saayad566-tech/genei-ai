# Provider health-check source notes

These notes preserve external documentation findings used for the provider adapter implementation plan.

| Provider | Verified source | Relevant finding |
|---|---|---|
| Runway | [Runway API Reference](https://docs.dev.runwayml.com/api/) | Official reference exposes task management, video/image/audio generation, avatar/video, voice, and model-router operations. Authentication is documented in the official API reference, but a generic account-health endpoint was not exposed in the extracted overview; adapter health should use a low-cost documented capability/account request rather than invent an endpoint. |
| Kling AI | [Kling Authentication](https://kling.ai/document-api/api/get-started/authentication) | Official API domain for servers outside China is `https://api-singapore.klingai.com`; API-key authentication uses `Authorization: Bearer <API_KEY>`. The source also warns that selected legacy video models are scheduled for retirement on September 15, 2026, so model IDs must be versioned/configurable. |
| HeyGen | [HeyGen Get Current User](https://developers.heygen.com/user-profile) | Official account-health endpoint is `GET https://api.heygen.com/v3/users/me` with the `X-Api-Key` header. It returns authenticated profile and billing/credit information. |

Implementation implication: provider-specific schemas should store endpoint, authentication style, capability family, and health strategy. Unsupported health checks must be labelled explicitly rather than returning a false healthy state.


## Additional provider findings

| Provider | Verified source | Relevant finding |
|---|---|---|
| Runway | [Runway API Getting Started](https://docs.dev.runwayml.com/guides/using-the-api/) | Official request example uses `POST https://api.dev.runwayml.com/v1/image_to_video`, `Authorization: Bearer <RUNWAYML_API_SECRET>`, and `X-Runway-Version: 2024-11-06`. The API starts an asynchronous task; adapter health can use a documented low-cost task/account request only when configured, and model/version values must remain configurable. |
| Pika | [Pika API](https://pika.art/api) and [Pika Agent API guidance](https://dev.pika.art/agent) | Pika currently presents an API Club with one API across many media models and directs developers to its API documentation/LLM index. The official agent guidance explicitly says not to guess endpoints or fields. The adapter therefore stores Pika as a provider-specific schema with endpoint/model configuration supplied from the official API index, rather than inventing a health URL. |


## Concrete adapter endpoints

| Provider | Verified source | Concrete endpoint or rule |
|---|---|---|
| Pika | [Pika developer index](https://dev.pika.art/llms.txt) | Customer API base is `https://api.dev.pika.art`; authentication supports `X-API-Key` or `Authorization: Bearer`; non-billable balance health endpoint is `GET /billing/balance`, and the catalog is `GET /catalog/apis`. |
| Runway | [Runway SDK documentation](https://docs.dev.runwayml.com/api-details/sdks/) | Official docs document generation task creation and retrieval at `GET /v1/tasks/{id}`. Because task creation is billable, a health adapter must use a configured existing task ID (`GENEI_RUNWAY_HEALTH_TASK_ID`) or explicit account endpoint rather than creating a paid generation merely to test a key. |
