Below is a concise API documentation based on the provided webpage from Mistral AI's API documentation for the Chat Completion endpoint (`/v1/chat/completions`). This documentation is structured to include the essential details such as endpoint, method, parameters, request/response examples, and additional notes, while adhering to the original content.

---

# Mistral AI Chat Completion API Documentation

## Overview
The Mistral AI Chat Completion API allows you to generate conversational responses from Mistral's language models based on a list of input messages. This endpoint supports various configuration options to control the output, such as temperature, token limits, and stop sequences.

## Endpoint
- **URL**: `https://api.mistral.ai/v1/chat/completions`
- **Method**: `POST`

## Authentication
- **Header**: `Authorization: Bearer $MISTRAL_API_KEY`
  - Replace `$MISTRAL_API_KEY` with your valid API key obtained from [La Plateforme](https://console.mistral.ai).

## Request
### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer $MISTRAL_API_KEY`

### Body Parameters
| Parameter         | Type          | Required | Description                                                                                   | Default       |
|-------------------|---------------|----------|-----------------------------------------------------------------------------------------------|---------------|
| `model`           | String        | Yes      | The ID of the model to use (e.g., `mistral-large-latest`). See available models in the docs.  | N/A           |
| `messages`        | Array         | Yes      | A list of message objects representing the conversation history.                             | N/A           |
| `temperature`     | Float         | No       | Controls randomness (0.0 to 2.0). Higher values increase creativity.                         | 0.7           |
| `top_p`           | Float         | No       | Controls diversity via nucleus sampling (0.0 to 1.0). Lower values focus on likely tokens.    | 1.0           |
| `max_tokens`      | Integer       | No       | Maximum number of tokens to generate in the response.                                        | No limit      |
| `stream`          | Boolean       | No       | If `true`, streams the response as server-sent events.                                       | `false`       |
| `stop`            | Array/String  | No       | Sequences where the model stops generating further tokens.                                   | None          |
| `safe_prompt`     | Boolean       | No       | If `true`, moderates the prompt against sensitive content (see Guardrailing).                | `false`       |
| `random_seed`     | Integer       | No       | Sets a seed for reproducible outputs.                                                        | None          |

#### Message Object
Each object in the `messages` array has the following structure:
| Field     | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `role`    | String | Yes      | Role of the sender (`"user"`, `"assistant"`, etc.) |
| `content` | String | Yes      | The text content of the message.                 |

### Example Request
```json
{
  "model": "mistral-large-latest",
  "messages": [
    {
      "role": "user",
      "content": "What is the capital of France?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 100,
  "stop": ["Paris"]
}
```

#### cURL Example
```bash
curl --location "https://api.mistral.ai/v1/chat/completions" \
  --header "Content-Type: application/json" \
  --header "Accept: application/json" \
  --header "Authorization: Bearer $MISTRAL_API_KEY" \
  --data '{
    "model": "mistral-large-latest",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "stop": ["Paris"]
  }'
```

## Response
### Success Response (Non-Streaming)
- **Status Code**: `200 OK`
- **Content-Type**: `application/json`

#### Response Body
| Field            | Type   | Description                                                                 |
|------------------|--------|-----------------------------------------------------------------------------|
| `id`             | String | Unique identifier for the completion.                                       |
| `object`         | String | Type of object returned (e.g., `"chat.completion"`).                       |
| `created`        | Integer| Unix timestamp of when the completion was created.                         |
| `model`          | String | The model used for the completion.                                         |
| `choices`        | Array  | List of generated responses.                                               |
| `usage`          | Object | Token usage statistics (`prompt_tokens`, `completion_tokens`, `total_tokens`). |

#### Choice Object
| Field         | Type   | Description                                      |
|---------------|--------|--------------------------------------------------|
| `index`       | Integer| Index of the choice in the list.                 |
| `message`     | Object | The generated message (with `role` and `content`).|
| `finish_reason`| String | Reason the generation stopped (e.g., `"stop"`, `"length"`). |

#### Example Response
```json
{
  "id": "cmpl-12345",
  "object": "chat.completion",
  "created": 1749176400,
  "model": "mistral-large-latest",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  }
}
```

### Streaming Response
- **Status Code**: `200 OK`
- **Content-Type**: `text/event-stream`
- Streams data as server-sent events with chunks of the response. The stream ends with `data: [DONE]`.

#### Example Streaming Response
```
data: {"id":"cmpl-12345","object":"chat.completion.chunk","created":1749176400,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"role":"assistant","content":"The"},"finish_reason":null}]}

data: {"id":"cmpl-12345","object":"chat.completion.chunk","created":1749176400,"model":"mistral-large-latest","choices":[{"index":0,"delta":{"content":" capital"},"finish_reason":null}]}

data: [DONE]
```

### Error Response
- **Status Codes**: `400 Bad Request`, `401 Unauthorized`, `429 Too Many Requests`, etc.
- **Body**: JSON object with `error` field describing the issue.

#### Example Error Response
```json
{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": 401
  }
}
```

## Notes
- **Rate Limits**: Ensure compliance with Mistral AI's rate limits to avoid `429` errors.
- **Model Availability**: Check the latest model list in the [Mistral AI documentation](https://docs.mistral.ai) as models may vary.
- **Streaming**: Use `stream: true` for real-time responses, ideal for interactive applications.
- **Guardrailing**: Enable `safe_prompt` to filter sensitive content, though it may increase latency.

## Additional Resources
- Register for an API key at [La Plateforme](https://console.mistral.ai).
- Refer to the full [Mistral AI API documentation](https://docs.mistral.ai) for more details.

---

This documentation captures the core functionality of the Chat Completion API as described on the specified webpage, formatted for clarity and ease of use. Let me know if you'd like adjustments or additional sections!