import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import ContentParts from '../ContentParts';

jest.mock('../PresentationResultCard', () => ({
  __esModule: true,
  default: ({ result }: any) => (
    <div data-testid="presentation-result-card">{JSON.stringify(result)}</div>
  ),
}));

jest.mock('../MemoryArtifacts', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Web/Sources', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../Part', () => ({
  __esModule: true,
  default: ({ part }: { part?: TMessageContentParts }) => {
    if (part?.type === 'text') {
      const text = typeof part.text === 'string' ? part.text : part.text?.value;
      return <div data-testid="message-text-part">{text}</div>;
    }

    if (part?.type === 'tool_call') {
      const toolCallLabel = 'tool call';
      return <div data-testid="tool-call-part">{toolCallLabel}</div>;
    }

    return null;
  },
}));

describe('ContentParts presentation cards', () => {
  it('renders presentation cards after all message parts', () => {
    const output = JSON.stringify({
      content: [
        {
          type: 'text',
          text: 'Presentation generated successfully.\nTitle: Demo Deck\nSlides: 4',
        },
        {
          type: 'resource_link',
          uri: 'https://example.com/demo_deck.html',
          name: 'demo_deck.html',
          mimeType: 'text/html',
        },
        {
          type: 'resource_link',
          uri: 'https://example.com/demo_deck.pptx',
          name: 'demo_deck.pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      ],
    });

    render(
      <ContentParts
        content={[
          {
            type: ContentTypes.TOOL_CALL,
            [ContentTypes.TOOL_CALL]: {
              id: 'tool-call-1',
              name: 'generate_presentation_mcp_slideforge',
              args: '{}',
              output,
              progress: 1,
            },
          },
          {
            type: ContentTypes.TEXT,
            text: 'Here is the final summary.',
          },
        ]}
        messageId="message-1"
        isCreatedByUser={false}
        isLast={false}
        isSubmitting={false}
        isLatestMessage={false}
      />,
    );

    const finalText = screen.getByTestId('message-text-part');
    const card = screen.getByTestId('presentation-result-card');

    expect(card).toHaveTextContent('Demo Deck');
    expect(finalText.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
