import type { ExtendedJsonSchema } from '../registry/definitions';

/** Default description for OpenRouter image generation tool */
const DEFAULT_OPENROUTER_IMAGE_GEN_DESCRIPTION =
  `Generate high-quality images from text descriptions using OpenRouter-supported models.

Supported models include:
- openai/gpt-5-image: Best for high-quality, detailed images (default)
- openai/gpt-5-image-mini: Fast and efficient image generation
- bytedance-seed/seedream-4.5: High-quality generation by ByteDance
- google/gemini-3-pro-image-preview: Advanced image generation with aspect ratio control
- google/gemini-2.5-flash-image: Fast generation with aspect ratio control

Always enhance basic prompts into detailed descriptions (3-6 sentences minimum).
For Gemini models, you can specify aspect ratios like "16:9" for wide images or "9:16" for portraits.` as const;

const getOpenRouterImageGenDescription = () => {
  return process.env.OPENROUTER_IMAGE_GEN_DESCRIPTION || DEFAULT_OPENROUTER_IMAGE_GEN_DESCRIPTION;
};

/** Default prompt description */
const DEFAULT_OPENROUTER_IMAGE_GEN_PROMPT_DESCRIPTION =
  `Detailed text description of the image to generate. Should be 3-6 sentences, focusing on visual elements, lighting, composition, mood, and style.` as const;

const getOpenRouterImageGenPromptDescription = () => {
  return (
    process.env.OPENROUTER_IMAGE_GEN_PROMPT_DESCRIPTION ||
    DEFAULT_OPENROUTER_IMAGE_GEN_PROMPT_DESCRIPTION
  );
};

/** Default description for OpenRouter image fetch tool */
const DEFAULT_OPENROUTER_IMAGE_FETCH_DESCRIPTION =
  `Fetch image data by file_id and return it as a base64 data URL.

Use this tool when you need to:
- Retrieve a previously generated or uploaded image
- Send image data to an external MCP server or API
- Access raw image data for processing

The returned data URL can be passed directly to external services that accept base64-encoded images.
The data stays in the tool result and is not rendered to the user.` as const;

const getOpenRouterImageFetchDescription = () => {
  return (
    process.env.OPENROUTER_IMAGE_FETCH_DESCRIPTION || DEFAULT_OPENROUTER_IMAGE_FETCH_DESCRIPTION
  );
};

/** JSON schema for OpenRouter image generation tool */
const openrouterImageGenJsonSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      minLength: 1,
      description: getOpenRouterImageGenPromptDescription(),
    },
    model: {
      type: 'string',
      description:
        'The image generation model to use. Any OpenRouter-compatible image generation model can be used. Defaults to GPT-5 Image for best quality. Examples: openai/gpt-5-image, openai/gpt-5-image-mini, bytedance-seed/seedream-4.5, google/gemini-3-pro-image-preview, google/gemini-2.5-flash-image.',
    },
    aspect_ratio: {
      type: 'string',
      enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      description:
        'Aspect ratio for the generated image. Only supported for Gemini models. Use 16:9 for landscape, 9:16 for portrait, 1:1 for square.',
    },
  },
  required: ['prompt'],
};

/** JSON schema for OpenRouter image fetch tool */
const openrouterImageFetchJsonSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    file_id: {
      type: 'string',
      description:
        'The unique file_id of the image to fetch. This ID is returned when images are generated or uploaded.',
    },
  },
  required: ['file_id'],
};

export const openrouterToolkit = {
  openrouter_image_gen: {
    name: 'openrouter_image_gen' as const,
    description: getOpenRouterImageGenDescription(),
    schema: openrouterImageGenJsonSchema,
    responseFormat: 'content_and_artifact' as const,
  },
  openrouter_image_fetch: {
    name: 'openrouter_image_fetch' as const,
    description: getOpenRouterImageFetchDescription(),
    schema: openrouterImageFetchJsonSchema,
    responseFormat: 'content_and_artifact' as const,
  },
} as const;
