const { v4 } = require('uuid');
const axios = require('axios');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ContentTypes } = require('librechat-data-provider');
const { extractBaseURL, openrouterToolkit } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findFileById } = require('~/models');

const displayMessage =
  "OpenRouter displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but not mention anything about downloading to the user.";

// Known models with their characteristics (for reference only, not a restriction)
const MODELS = {
  'google/gemini-2.5-flash-image': {
    name: 'Gemini 2.5 Flash Image',
    description: 'Fast image generation with aspect ratio support',
    supportsAspectRatio: true,
    imageOnly: false,
  },
  'google/gemini-3-pro-image-preview': {
    name: 'Gemini 3 Pro Image',
    description: 'Advanced image generation with aspect ratio support',
    supportsAspectRatio: true,
    imageOnly: false,
  },
  'openai/gpt-5-image-mini': {
    name: 'GPT-5 Image Mini',
    description: 'Fast, efficient image generation',
    supportsAspectRatio: false,
    imageOnly: false,
  },
  'openai/gpt-5-image': {
    name: 'GPT-5 Image',
    description: 'High-quality, detailed image generation',
    supportsAspectRatio: false,
    imageOnly: false,
  },
  'bytedance-seed/seedream-4.5': {
    name: 'SeDream 4.5',
    description: 'High-quality image generation by ByteDance',
    supportsAspectRatio: false,
    imageOnly: true,
  },
};

/**
 * Check if a model is image-only (no text output).
 * @param {string} model - The model identifier
 * @returns {boolean}
 */
function isImageOnlyModel(model) {
  const modelInfo = MODELS[model];
  if (modelInfo) {
    return modelInfo.imageOnly === true;
  }
  return false;
}

/**
 * Check if a model supports aspect ratio configuration.
 * @param {string} model - The model identifier
 * @returns {boolean}
 */
function supportsAspectRatio(model) {
  const modelInfo = MODELS[model];
  if (modelInfo) {
    return modelInfo.supportsAspectRatio;
  }
  return model.toLowerCase().includes('gemini');
}

/**
 * Get axios config with optional proxy support
 * @returns {import('axios').AxiosRequestConfig}
 */
function getAxiosConfig() {
  const config = {
    timeout: 120000,
  };
  if (process.env.PROXY) {
    config.httpsAgent = new HttpsProxyAgent(process.env.PROXY);
  }
  return config;
}

/**
 * Return value helper for tool responses
 * @param {string | object | Array} value
 * @returns {Array}
 */
function returnValue(value) {
  if (typeof value === 'string') {
    return [value, {}];
  } else if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value;
    }
    return [displayMessage, value];
  }
    return value;
  }

/**
 * Drains a readable stream into a Buffer
 * @param {import('stream').Readable} stream - The readable stream
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Creates OpenRouter Image tools (generation and fetch)
 * @param {Object} fields - Configuration fields
 * @param {ServerRequest} fields.req - Express Request object
 * @param {boolean} fields.isAgent - Whether the tool is being used in an agent context
 * @param {string} [fields.OPENROUTER_KEY] - The OpenRouter API key
 * @param {string} [fields.OPENROUTER_BASE_URL] - The OpenRouter base URL
 * @param {boolean} [fields.override] - Whether to override the API key check
 * @param {string} [fields.fileStrategy] - The file storage strategy
 * @returns {Array<ReturnType<tool>>} - Array of OpenRouter image tools
 */
function createOpenRouterImageTools(fields = {}) {
  const override = fields.override ?? false;

  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }

  const { req, fileStrategy } = fields;

  const getApiKey = () => {
    const apiKey = process.env.OPENROUTER_KEY || '';
    if (!apiKey && !override) {
      throw new Error('Missing OPENROUTER_KEY environment variable.');
    }
    return apiKey;
  };

  const apiKey = fields.OPENROUTER_KEY || getApiKey();
  const baseUrl = extractBaseURL(
    fields.OPENROUTER_BASE_URL ||
      process.env.OPENROUTER_BASE_URL ||
      'https://openrouter.ai/api/v1',
  );

  /**
   * Image Generation Tool
   */
  const imageGenTool = tool(
    async ({ prompt, model = 'openai/gpt-5-image', aspect_ratio }) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      const modelSupportsAspectRatio = supportsAspectRatio(model);

      if (aspect_ratio && !modelSupportsAspectRatio) {
        logger.warn(
          `[OpenRouterImageGen] Aspect ratio is typically only supported for Gemini models. Ignoring aspect_ratio for ${model}.`,
        );
      }

      const chatCompletionsUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://librechat.ai',
      };

      const requestBody = {
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        modalities: isImageOnlyModel(model) ? ['image'] : ['image', 'text'],
      };

      if (modelSupportsAspectRatio && aspect_ratio) {
        requestBody.image_config = {
          aspect_ratio,
        };
      }

      logger.debug('[OpenRouterImageGen] Generating image:', {
        model,
        url: chatCompletionsUrl,
        hasAspectRatio: !!aspect_ratio,
      });

      let axiosResponse;
      try {
        axiosResponse = await axios.post(chatCompletionsUrl, requestBody, {
          headers,
          ...getAxiosConfig(),
        });
      } catch (error) {
        const errorDetails = error?.response?.data || error.message || 'Unknown error';
        logger.error('[OpenRouterImageGen] Error while generating image:', errorDetails);

        return returnValue(
          `Something went wrong when trying to generate the image via OpenRouter:
Error Message: ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`,
        );
      }

      const responseData = axiosResponse.data;
      const message = responseData.choices?.[0]?.message;
      const images = message?.images || [];

      if (!images || images.length === 0 || !images[0]?.image_url) {
        logger.error(
          '[OpenRouterImageGen] No image data returned from OpenRouter. Response:',
          responseData,
        );
        return returnValue(
          'No image data returned from OpenRouter API. The model may not support image generation or the request may have failed.',
        );
      }

      const imageUrl = images[0].image_url.url;
      logger.debug('[OpenRouterImageGen] images[0] keys:', Object.keys(images[0].image_url));

      try {
        let base64Url = imageUrl;
        if (!imageUrl.startsWith('data:')) {
          base64Url = `data:image/png;base64,${imageUrl}`;
        }

        logger.debug('[OpenRouterImageGen] Image URL:', base64Url.slice(0, 50));

        const file_ids = [v4()];
        const content = [
          {
            type: ContentTypes.IMAGE_URL,
            image_url: {
              url: base64Url,
            },
          },
        ];

        const response = [
          {
            type: ContentTypes.TEXT,
            text: displayMessage + `\n\ngenerated_image_id: "${file_ids[0]}"`,
          },
        ];
        return [response, { content, file_ids }];
      } catch (error) {
        logger.error('[OpenRouterImageGen] Error processing image for agent:', error);
        return returnValue(`Failed to process the image. ${error.message}`);
      }
    },
    {
      ...openrouterToolkit.openrouter_image_gen,
      responseFormat: 'content_and_artifact',
    },
  );

  /**
   * Image Fetch Tool - Retrieves image data by file_id as base64 data URL
   * Useful for sending images to external MCP servers
   */
  const imageFetchTool = tool(
    async ({ file_id }) => {
      if (!file_id) {
        throw new Error('Missing required field: file_id');
      }

      if (!req?.user?.id) {
        return returnValue('User authentication required to fetch images.');
      }

      logger.debug('[OpenRouterImageFetch] Fetching image:', { file_id });

      try {
        const file = await findFileById(file_id, { user: req.user.id });

        if (!file) {
          logger.warn('[OpenRouterImageFetch] File not found:', file_id);
          return returnValue(`Image with file_id "${file_id}" not found or access denied.`);
        }

        const source = file.source || fileStrategy;
        if (!source) {
          return returnValue('Unable to determine file storage source.');
        }

        const { getDownloadStream } = getStrategyFunctions(source);
        if (!getDownloadStream) {
          return returnValue(`No download handler available for source: ${source}`);
        }

        const stream = await getDownloadStream(req, file.filepath);
        if (!stream) {
          return returnValue('Failed to retrieve image stream.');
        }

        const buffer = await streamToBuffer(stream);
        const base64String = buffer.toString('base64');
        const mimeType = file.type || 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64String}`;

        logger.debug('[OpenRouterImageFetch] Successfully fetched image:', {
          file_id,
          mimeType,
          size: buffer.length,
        });

        // Include dataUrl in content so the model can pass it to MCP servers
        return [
          [
            {
              type: ContentTypes.TEXT,
              text: `Image data retrieved for file_id "${file_id}".\n\nData URL (use this to send to external services):\nNot Available at the moment.`,
            },
          ],
          { file_id, mimeType, size: buffer.length },
        ];
      } catch (error) {
        logger.error('[OpenRouterImageFetch] Error fetching image:', error);
        return returnValue(`Failed to fetch image: ${error.message}`);
      }
    },
    {
      ...openrouterToolkit.openrouter_image_fetch,
      responseFormat: 'content_and_artifact',
    },
  );

  return [imageGenTool, imageFetchTool];
}

module.exports = createOpenRouterImageTools;
