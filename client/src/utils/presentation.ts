const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

type ResourceLinkLike = {
  type?: string;
  uri?: string;
  name?: string;
  mimeType?: string;
  description?: string;
};

export type PresentationResult = {
  title: string;
  htmlUrl?: string;
  htmlName?: string;
  pptxUrl?: string;
  pptxName?: string;
  previewImageUrl?: string;
  previewImageName?: string;
  previewImages?: PresentationPreviewImage[];
  slides?: number;
  theme?: string;
  sizeLabel?: string;
};

export type PresentationPreviewImage = {
  url: string;
  name?: string;
  slideNumber?: number;
};

type AttachmentLike = {
  filename?: string;
  filepath?: string;
};

type PresentationMetadata = Pick<
  PresentationResult,
  'title' | 'slides' | 'theme' | 'sizeLabel'
>;

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function walkNode(node: unknown, visitor: (value: Record<string, unknown>) => void) {
  if (Array.isArray(node)) {
    node.forEach((entry) => walkNode(entry, visitor));
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

  const value = node as Record<string, unknown>;
  visitor(value);

  Object.values(value).forEach((entry) => walkNode(entry, visitor));
}

function collectResourceLinks(node: unknown): ResourceLinkLike[] {
  const resources: ResourceLinkLike[] = [];

  walkNode(node, (value) => {
    if (typeof value.uri !== 'string') {
      return;
    }

    resources.push({
      type: typeof value.type === 'string' ? value.type : undefined,
      uri: value.uri,
      name: typeof value.name === 'string' ? value.name : undefined,
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
      description: typeof value.description === 'string' ? value.description : undefined,
    });
  });

  return resources;
}

function collectStructuredPresentationResources(node: unknown): ResourceLinkLike[] {
  const resources: ResourceLinkLike[] = [];

  walkNode(node, (value) => {
    if (typeof value.htmlUrl === 'string') {
      resources.push({
        uri: value.htmlUrl,
        mimeType: 'text/html',
        description: 'Presentation HTML',
      });
    }

    if (typeof value.pptxUrl === 'string') {
      resources.push({
        uri: value.pptxUrl,
        mimeType: PPTX_MIME_TYPE,
        description: 'Presentation PPTX',
      });
    }

    if (typeof value.previewImageUrl === 'string') {
      resources.push({
        uri: value.previewImageUrl,
        mimeType: 'image/png',
        description: 'Deck preview slide',
      });
    }

    const previewCollections = [value.previews, value.previewImages].filter(Array.isArray);
    for (const collection of previewCollections) {
      for (const preview of collection as Array<Record<string, unknown>>) {
        if (typeof preview?.url !== 'string') {
          continue;
        }

        resources.push({
          uri: preview.url,
          name: typeof preview.name === 'string' ? preview.name : undefined,
          mimeType: 'image/png',
          description:
            typeof preview.slideNumber === 'number'
              ? `Deck preview slide ${preview.slideNumber}`
              : 'Deck preview slide',
        });
      }
    }
  });

  return resources;
}

function collectStructuredPresentationMetadata(node: unknown): PresentationMetadata {
  const metadata: PresentationMetadata = {};

  walkNode(node, (value) => {
    if (!metadata.title && typeof value.title === 'string') {
      metadata.title = value.title;
    }

    if (metadata.slides == null) {
      const slideValue = value.slideCount ?? value.slides;
      if (typeof slideValue === 'number' && Number.isFinite(slideValue)) {
        metadata.slides = slideValue;
      } else if (typeof slideValue === 'string') {
        const parsedSlides = Number.parseInt(slideValue, 10);
        if (Number.isFinite(parsedSlides)) {
          metadata.slides = parsedSlides;
        }
      }
    }

    if (!metadata.theme && typeof value.theme === 'string') {
      metadata.theme = normalizeTheme(value.theme);
    }

    if (!metadata.sizeLabel) {
      if (typeof value.sizeLabel === 'string') {
        metadata.sizeLabel = value.sizeLabel;
      } else if (typeof value.fileSizeKb === 'number' && Number.isFinite(value.fileSizeKb)) {
        metadata.sizeLabel = `${value.fileSizeKb} KB`;
      }
    }
  });

  return metadata;
}

function collectTextFragments(node: unknown): string[] {
  const fragments: string[] = [];

  walkNode(node, (value) => {
    if (value.type === 'text' && typeof value.text === 'string') {
      fragments.push(value.text);
      return;
    }

    if (typeof value.text === 'string' && value.type == null) {
      fragments.push(value.text);
    }
  });

  return fragments;
}

function dedupeResources(resources: ResourceLinkLike[]): ResourceLinkLike[] {
  const seen = new Set<string>();

  return resources.filter((resource) => {
    const key = `${resource.uri ?? ''}|${resource.mimeType ?? ''}|${resource.name ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseMarkdownLinks(source: string) {
  const markdownLinks: Array<{ label?: string; url: string }> = [];
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (const match of source.matchAll(markdownLinkRegex)) {
    const label = match[1]?.trim();
    const url = match[2]?.trim();

    if (!url) {
      continue;
    }

    markdownLinks.push({ label, url });
  }

  return markdownLinks;
}

function collectTextLinks(source: string): ResourceLinkLike[] {
  const markdownLinks = parseMarkdownLinks(source);

  return markdownLinks.map((link) => ({
    uri: link.url,
    name: link.label,
    description: link.label,
  }));
}

function collectInlineJsonResources(source: string): ResourceLinkLike[] {
  return source
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith('{') && block.endsWith('}'))
    .map((block) => safeJsonParse(block))
    .flatMap((value) => (value ? collectResourceLinks(value) : []));
}

function collectResourceUriLines(source: string): ResourceLinkLike[] {
  const lines = source.split(/\r?\n/);
  const resources: ResourceLinkLike[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    const uriMatch = line.match(/^Resource URI:\s*(.+)$/i);
    if (!uriMatch?.[1]) {
      continue;
    }

    const nextLine = lines[index + 1]?.trim();
    const mimeMatch = nextLine?.match(/^Resource MIME Type:\s*(.+)$/i);
    resources.push({
      uri: uriMatch[1].trim(),
      mimeType: mimeMatch?.[1]?.trim(),
    });
  }

  return resources;
}

function collectPreviewLineResources(source: string): ResourceLinkLike[] {
  const lines = source.split(/\r?\n/);
  const resources: ResourceLinkLike[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const previewMatch = line.match(/^Preview(?:\s+(\d+))?:\s*(.+)$/i);
    if (!previewMatch?.[2]) {
      continue;
    }

    const uri = previewMatch[2].trim();
    const slideNumber = previewMatch[1] ? Number.parseInt(previewMatch[1], 10) : undefined;

    resources.push({
      uri,
      name: uri.split('/').pop(),
      mimeType: 'image/png',
      description: Number.isFinite(slideNumber)
        ? `Deck preview slide ${slideNumber}`
        : 'Deck preview slide',
    });
  }

  return resources;
}

function collectAttachmentResources(attachments?: AttachmentLike[]): ResourceLinkLike[] {
  if (!attachments?.length) {
    return [];
  }

  return attachments
    .filter((attachment) => attachment?.filepath)
    .map((attachment) => ({
      uri: attachment.filepath,
      name: attachment.filename,
      description: attachment.filename,
    }));
}

function pickFirstResource(
  resources: ResourceLinkLike[],
  predicate: (resource: ResourceLinkLike) => boolean,
) {
  return resources.find(predicate);
}

function looksLikePptx(resource: ResourceLinkLike) {
  const uri = resource.uri?.toLowerCase() ?? '';
  const name = resource.name?.toLowerCase() ?? '';
  const mimeType = resource.mimeType?.toLowerCase() ?? '';
  const description = resource.description?.toLowerCase() ?? '';

  return (
    mimeType === PPTX_MIME_TYPE ||
    uri.endsWith('.pptx') ||
    name.endsWith('.pptx') ||
    description.includes('pptx')
  );
}

function looksLikeHtml(resource: ResourceLinkLike) {
  const uri = resource.uri?.toLowerCase() ?? '';
  const name = resource.name?.toLowerCase() ?? '';
  const mimeType = resource.mimeType?.toLowerCase() ?? '';
  const description = resource.description?.toLowerCase() ?? '';

  return (
    mimeType === 'text/html' ||
    /\.html(?:$|[?#])/i.test(uri) ||
    /\.html(?:$|[?#])/i.test(name) ||
    description.includes('html')
  );
}

function looksLikePreviewImage(resource: ResourceLinkLike) {
  const uri = resource.uri?.toLowerCase() ?? '';
  const name = resource.name?.toLowerCase() ?? '';
  const mimeType = resource.mimeType?.toLowerCase() ?? '';
  const description = resource.description?.toLowerCase() ?? '';

  return (
    mimeType.startsWith('image/') ||
    uri.endsWith('.png') ||
    uri.endsWith('.jpg') ||
    uri.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    description.includes('preview')
  );
}

function looksLikeDeckPreviewImage(resource: ResourceLinkLike) {
  if (!looksLikePreviewImage(resource)) {
    return false;
  }

  const uri = resource.uri?.toLowerCase() ?? '';
  const name = resource.name?.toLowerCase() ?? '';
  const description = resource.description?.toLowerCase() ?? '';

  return (
    description.includes('preview') ||
    description.includes('slide') ||
    /(?:^|[_-])slide[_-]?\d+\.(png|jpe?g|webp|gif)$/i.test(uri) ||
    /(?:^|[_-])slide[_-]?\d+\.(png|jpe?g|webp|gif)$/i.test(name)
  );
}

function extractSlideNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const match =
    value.match(/(?:^|[\s_-])slide[\s_-]?(\d+)(?:\D|$)/i) ??
    value.match(/(?:^|[\s_-])preview[\s_-]?(\d+)(?:\D|$)/i);

  if (!match?.[1]) {
    return undefined;
  }

  const slideNumber = Number.parseInt(match[1], 10);
  return Number.isFinite(slideNumber) ? slideNumber : undefined;
}

function extractLineValue(source: string, label: string) {
  const regex = new RegExp(`^${label}:\\s*(.+)$`, 'im');
  const match = source.match(regex);
  return match?.[1]?.trim();
}

function inferTitleFromFilename(nameOrUrl?: string) {
  if (!nameOrUrl) {
    return 'Presentation';
  }

  const normalized = nameOrUrl
    .split('/')
    .pop()
    ?.split('?')[0]
    ?.replace(/\.(html|pptx)$/i, '')
    ?.replace(/_[a-f0-9]{8}$/i, '')
    ?.replace(/[-_]+/g, ' ')
    ?.trim();

  if (!normalized) {
    return 'Presentation';
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeTheme(theme?: string) {
  if (!theme) {
    return undefined;
  }

  return theme.replace(/^./, (char) => char.toUpperCase());
}

function isLikelyPresentationTool(name?: string) {
  if (!name) {
    return false;
  }

  return (
    name.includes('generate_presentation') ||
    name.includes('render_artifact_presentation') ||
    name.includes('run_moa_presentation') ||
    name.includes('rerun_moa_stage')
  );
}

export function extractPresentationResult({
  name,
  output,
  attachments,
}: {
  name?: string;
  output?: string | null;
  attachments?: AttachmentLike[];
}): PresentationResult | null {
  if (!output || typeof output !== 'string') {
    return null;
  }

  const parsedOutput = safeJsonParse(output);
  const jsonResources = parsedOutput ? collectResourceLinks(parsedOutput) : [];
  const structuredPresentationResources = parsedOutput
    ? collectStructuredPresentationResources(parsedOutput)
    : [];
  const structuredMetadata = parsedOutput
    ? collectStructuredPresentationMetadata(parsedOutput)
    : {};
  const inlineJsonResources = collectInlineJsonResources(output);
  const inlineUriResources = collectResourceUriLines(output);
  const previewLineResources = collectPreviewLineResources(output);
  const textResources = collectTextLinks(output);
  const attachmentResources = collectAttachmentResources(attachments);
  const resources = dedupeResources([
    ...jsonResources,
    ...structuredPresentationResources,
    ...inlineJsonResources,
    ...inlineUriResources,
    ...previewLineResources,
    ...textResources,
    ...attachmentResources,
  ]);
  const textFragments = parsedOutput ? collectTextFragments(parsedOutput) : [];
  const combinedText = [output, ...textFragments].join('\n');

  const htmlLineValue = extractLineValue(combinedText, 'HTML');
  const pptxLineValue = extractLineValue(combinedText, 'PPTX');

  const html =
    pickFirstResource(resources, looksLikeHtml) ??
    (htmlLineValue ? { uri: htmlLineValue, name: htmlLineValue.split('/').pop() } : undefined);
  const pptx =
    pickFirstResource(resources, looksLikePptx) ??
    (pptxLineValue ? { uri: pptxLineValue, name: pptxLineValue.split('/').pop() } : undefined);
  const previewImages = resources
    .filter(looksLikeDeckPreviewImage)
    .map((resource) => ({
      url: resource.uri ?? '',
      name: resource.name,
      slideNumber:
        extractSlideNumber(resource.description) ??
        extractSlideNumber(resource.name) ??
        extractSlideNumber(resource.uri),
    }))
    .filter((preview) => preview.url)
    .sort((left, right) => {
      const leftNumber = left.slideNumber ?? Number.MAX_SAFE_INTEGER;
      const rightNumber = right.slideNumber ?? Number.MAX_SAFE_INTEGER;

      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return left.url.localeCompare(right.url);
    });
  const previewImage = previewImages[0];

  const hasPresentationArtifacts = Boolean(html || pptx);
  const hasPresentationMetadata =
    combinedText.includes('Presentation generated successfully') ||
    /^Title:\s+/im.test(combinedText) ||
    /^Slides:\s+/im.test(combinedText) ||
    /^Theme:\s+/im.test(combinedText) ||
    structuredPresentationResources.length > 0;

  if (!hasPresentationArtifacts) {
    return null;
  }

  if (!isLikelyPresentationTool(name) && !hasPresentationMetadata) {
    return null;
  }

  const title =
    extractLineValue(combinedText, 'Title') ??
    structuredMetadata.title ??
    inferTitleFromFilename(html?.name ?? html?.uri ?? pptx?.name ?? pptx?.uri);

  const slideValue = extractLineValue(combinedText, 'Slides');
  const slides =
    slideValue != null ? Number.parseInt(slideValue, 10) : structuredMetadata.slides;

  const theme = normalizeTheme(extractLineValue(combinedText, 'Theme')) ?? structuredMetadata.theme;
  const sizeLabel = extractLineValue(combinedText, 'Size') ?? structuredMetadata.sizeLabel;

  return {
    title,
    htmlUrl: html?.uri,
    htmlName: html?.name,
    pptxUrl: pptx?.uri,
    pptxName: pptx?.name,
    previewImageUrl: previewImage?.url,
    previewImageName: previewImage?.name,
    previewImages: previewImages.length > 0 ? previewImages : undefined,
    slides: Number.isFinite(slides) ? slides : undefined,
    theme,
    sizeLabel,
  };
}
