# Supabase Edge Functions

## Environment Variables
- `OPENAI_API_KEY` – API key for OpenAI requests used in `contract-analysis`.
- `VITE_DOCUMENSO_URL` – Base URL for Documenso API used in `documenso-api`.
- `VITE_DOCUMENSO_API_KEY` – API key for Documenso requests.
- `SUPABASE_URL` – URL of your Supabase project for token validation.
- `SUPABASE_ANON_KEY` – Public anon key for token validation requests.
- `TRUSTED_ORIGINS` – Comma-separated list of allowed origins for CORS.

## Error Responses
### contract-analysis
- `400` – Missing required parameters `text` or `analysisType`.
- `401` – Missing or invalid authorization token.
- `403` – Origin not allowed.
- `500` – Configuration errors or unexpected server errors.

### documenso-api
- `400` – Missing required parameters for the requested action.
- `401` – Missing or invalid authorization token.
- `403` – Origin not allowed.
- `500` – Missing Documenso configuration or unexpected server errors.
