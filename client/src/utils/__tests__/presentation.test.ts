import { extractPresentationResult } from '../presentation';

describe('extractPresentationResult', () => {
  it('extracts presentation metadata and resource links from structured tool output', () => {
    const output = JSON.stringify({
      content: [
        {
          type: 'text',
          text: [
            'Presentation generated successfully.',
            'Title: The Impact of AI in Education',
            'Slides: 6',
            'Theme: modern',
            'Size: 4120 KB',
          ].join('\n'),
        },
        {
          type: 'resource_link',
          uri: 'https://example.com/presentations/impact_ai_1234.html',
          name: 'impact_ai_1234.html',
          mimeType: 'text/html',
          description: 'Normalized HTML deck source',
        },
        {
          type: 'resource_link',
          uri: 'https://example.com/presentations/impact_ai_1234.pptx',
          name: 'impact_ai_1234.pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          description: 'Generated PPTX presentation deck',
        },
      ],
    });

    expect(
      extractPresentationResult({ name: 'generate_presentation_mcp_slideforge', output }),
    ).toEqual(
      expect.objectContaining({
        title: 'The Impact of AI in Education',
        htmlUrl: 'https://example.com/presentations/impact_ai_1234.html',
        pptxUrl: 'https://example.com/presentations/impact_ai_1234.pptx',
        slides: 6,
        theme: 'Modern',
        sizeLabel: '4120 KB',
      }),
    );
  });

  it('falls back to markdown links when the tool output is plain text', () => {
    const output = [
      'Presentation generated successfully.',
      'Title: Robotics in Healthcare',
      '',
      '[Normalized HTML deck source](https://example.com/robotics_healthcare_a1b2c3d4.html)',
      '[Generated PPTX presentation deck](https://example.com/robotics_healthcare_a1b2c3d4.pptx)',
    ].join('\n');

    expect(extractPresentationResult({ name: 'render_artifact_presentation', output })).toEqual(
      expect.objectContaining({
        title: 'Robotics in Healthcare',
        htmlUrl: 'https://example.com/robotics_healthcare_a1b2c3d4.html',
        pptxUrl: 'https://example.com/robotics_healthcare_a1b2c3d4.pptx',
      }),
    );
  });

  it('extracts artifact links from mixed text output with inline resource blocks', () => {
    const output = [
      'Presentation generated successfully.',
      '',
      'Title: Gamal Abdel Nasser',
      'Slides: 5',
      'Theme: modern',
      'HTML: http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34.html',
      'PPTX: http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34.pptx',
      'Preview: http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34_slide_1.png',
      'Size: 187 KB',
      '',
      '{',
      '  "name": "gamal_abdel_nasser_ab12cd34.html",',
      '  "uri": "http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34.html",',
      '  "description": "Normalized HTML deck source",',
      '  "mimeType": "text/html",',
      '  "type": "resource_link"',
      '}',
      '',
      'Resource URI: http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34.pptx',
      'Resource MIME Type: application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ].join('\n');

    expect(
      extractPresentationResult({ name: 'generate_presentation_mcp_slideforge', output }),
    ).toEqual(
      expect.objectContaining({
        title: 'Gamal Abdel Nasser',
        htmlUrl: 'http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34.html',
        pptxUrl: 'http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34.pptx',
        previewImageUrl: 'http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34_slide_1.png',
        previewImages: [
          {
            url: 'http://localhost:3334/outputs/gamal_abdel_nasser_ab12cd34_slide_1.png',
            name: 'gamal_abdel_nasser_ab12cd34_slide_1.png',
            slideNumber: 1,
          },
        ],
        slides: 5,
        theme: 'Modern',
        sizeLabel: '187 KB',
      }),
    );
  });

  it('collects multiple preview slides from resource links and keeps them ordered', () => {
    const output = JSON.stringify({
      content: [
        {
          type: 'text',
          text: [
            'Presentation generated successfully.',
            'Title: Attention Is All You Need',
            'Slides: 9',
            'Theme: dark',
          ].join('\n'),
        },
        {
          type: 'resource_link',
          uri: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a.html',
          name: 'attention_is_all_you_need_78a4e30a.html',
          mimeType: 'text/html',
        },
        {
          type: 'resource_link',
          uri: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_3.png',
          name: 'attention_is_all_you_need_78a4e30a_slide_3.png',
          mimeType: 'image/png',
          description: 'Deck preview slide 3',
        },
        {
          type: 'resource_link',
          uri: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_1.png',
          name: 'attention_is_all_you_need_78a4e30a_slide_1.png',
          mimeType: 'image/png',
          description: 'Deck preview slide 1',
        },
        {
          type: 'resource_link',
          uri: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_2.png',
          name: 'attention_is_all_you_need_78a4e30a_slide_2.png',
          mimeType: 'image/png',
          description: 'Deck preview slide 2',
        },
      ],
    });

    expect(extractPresentationResult({ name: 'render_artifact_presentation', output })).toEqual(
      expect.objectContaining({
        previewImageUrl:
          'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_1.png',
        previewImages: [
          {
            url: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_1.png',
            name: 'attention_is_all_you_need_78a4e30a_slide_1.png',
            slideNumber: 1,
          },
          {
            url: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_2.png',
            name: 'attention_is_all_you_need_78a4e30a_slide_2.png',
            slideNumber: 2,
          },
          {
            url: 'http://localhost:3335/outputs/attention_is_all_you_need_78a4e30a_slide_3.png',
            name: 'attention_is_all_you_need_78a4e30a_slide_3.png',
            slideNumber: 3,
          },
        ],
      }),
    );
  });

  it('extracts delivery-style JSON metadata even when the tool output is not a render summary string', () => {
    const output = JSON.stringify({
      jobId: 'job_demo_123',
      title: 'Orpheus Myth Presentation',
      theme: 'classical',
      slideCount: 7,
      fileSizeKb: 284,
      htmlUrl: 'http://localhost:3335/jobs/job_demo_123/output/orpheus_myth_presentation.html',
      pptxUrl: 'http://localhost:3335/jobs/job_demo_123/output/orpheus_myth_presentation.pptx',
      previews: [
        {
          slideNumber: 1,
          url: 'http://localhost:3335/jobs/job_demo_123/previews/orpheus_myth_presentation_slide_1.png',
        },
      ],
    });

    expect(extractPresentationResult({ name: 'read_artifact_mcp_moaforge', output })).toEqual(
      expect.objectContaining({
        title: 'Orpheus Myth Presentation',
        htmlUrl: 'http://localhost:3335/jobs/job_demo_123/output/orpheus_myth_presentation.html',
        pptxUrl: 'http://localhost:3335/jobs/job_demo_123/output/orpheus_myth_presentation.pptx',
        slides: 7,
        theme: 'Classical',
        sizeLabel: '284 KB',
        previewImageUrl:
          'http://localhost:3335/jobs/job_demo_123/previews/orpheus_myth_presentation_slide_1.png',
      }),
    );
  });

  it('returns null for intermediate html artifact writes without delivery metadata', () => {
    const output = JSON.stringify({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            saved: true,
            jobId: 'job_demo_123',
            artifactName: 'deck.html',
            path: '/tmp/jobs/job_demo_123/artifacts/deck.html',
          }),
        },
        {
          type: 'resource_link',
          uri: 'file:///tmp/jobs/job_demo_123/artifacts/deck.html',
          name: 'deck.html',
          mimeType: 'text/html',
          description: 'Saved job artifact',
        },
      ],
    });

    expect(extractPresentationResult({ name: 'write_artifact_mcp_moaforge', output })).toBeNull();
  });

  it('returns null for unrelated tool output', () => {
    const output = JSON.stringify({
      results: [{ title: 'Example', url: 'https://example.com' }],
    });

    expect(extractPresentationResult({ name: 'web_search_mcp_slideforge', output })).toBeNull();
  });
});
