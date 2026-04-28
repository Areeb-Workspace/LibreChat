import { memo, useMemo, useCallback } from 'react';
import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { MessageContext, SearchContext } from '~/Providers';
import { ParallelContentRenderer, type PartWithIndex } from './ParallelContent';
import type { PresentationResult } from '~/utils/presentation';
import { extractPresentationResult, mapAttachments } from '~/utils';
import { EditTextPart, EmptyText } from './Parts';
import PresentationResultCard from './PresentationResultCard';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import Container from './Container';
import Part from './Part';

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
  conversationId?: string | null;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
  isCreatedByUser: boolean;
  isLast: boolean;
  isSubmitting: boolean;
  isLatestMessage?: boolean;
  edit?: boolean;
  enterEdit?: (cancel?: boolean) => void | null | undefined;
  siblingIdx?: number;
  setSiblingIdx?:
    | ((value: number) => void | React.Dispatch<React.SetStateAction<number>>)
    | null
    | undefined;
};

function isCompletedToolOutput(toolCall: Agents.ToolCall, isSubmitting: boolean) {
  const progress = typeof toolCall.progress === 'number' ? toolCall.progress : 0.1;
  const output =
    'output' in toolCall
      ? toolCall.output
      : toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall
        ? toolCall.function.output
        : undefined;
  const cancelled =
    (!isSubmitting && progress < 1) ||
    String(output ?? '')
      .toLowerCase()
      .includes('error processing tool');

  return !cancelled && progress >= 1;
}

function extractPresentationResultFromPart({
  part,
  attachments,
  isSubmitting,
}: {
  part?: TMessageContentParts;
  attachments?: TAttachment[];
  isSubmitting: boolean;
}) {
  if (part?.type !== ContentTypes.TOOL_CALL) {
    return null;
  }

  const toolCall = part[ContentTypes.TOOL_CALL];
  if (!toolCall || !isCompletedToolOutput(toolCall, isSubmitting)) {
    return null;
  }

  const isToolCall =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);

  if (isToolCall) {
    return extractPresentationResult({
      name: toolCall.name,
      output: toolCall.output,
      attachments,
    });
  }

  if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
    return extractPresentationResult({
      name: toolCall.function.name,
      output: toolCall.function.output,
      attachments,
    });
  }

  return null;
}

function dedupePresentationResults(results: PresentationResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.htmlUrl ?? result.pptxUrl ?? result.title;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * ContentParts renders message content parts, handling both sequential and parallel layouts.
 *
 * For 90% of messages (single-agent, no parallel execution), this renders sequentially.
 * For multi-agent parallel execution, it uses ParallelContentRenderer to show columns.
 */
const ContentParts = memo(function ContentParts({
  edit,
  isLast,
  content,
  messageId,
  enterEdit,
  siblingIdx,
  attachments,
  isSubmitting,
  setSiblingIdx,
  searchResults,
  conversationId,
  isCreatedByUser,
  isLatestMessage,
}: ContentPartsProps) {
  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;
  const presentationResults = useMemo(() => {
    if (!content) {
      return [];
    }

    return dedupePresentationResults(
      content
        .map((part) => {
          const toolCallId =
            (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
          const partAttachments = attachmentMap[toolCallId];

          return extractPresentationResultFromPart({
            part,
            attachments: partAttachments,
            isSubmitting: effectiveIsSubmitting,
          });
        })
        .filter((result): result is PresentationResult => Boolean(result)),
    );
  }, [attachmentMap, content, effectiveIsSubmitting]);

  /**
   * Render a single content part with proper context.
   */
  const renderPart = useCallback(
    (part: TMessageContentParts, idx: number, isLastPart: boolean) => {
      const toolCallId = (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
      const partAttachments = attachmentMap[toolCallId];

      return (
        <MessageContext.Provider
          key={`provider-${messageId}-${idx}`}
          value={{
            messageId,
            isExpanded: true,
            conversationId,
            partIndex: idx,
            nextType: content?.[idx + 1]?.type,
            isSubmitting: effectiveIsSubmitting,
            isLatestMessage,
          }}
        >
          <Part
            part={part}
            attachments={partAttachments}
            isSubmitting={effectiveIsSubmitting}
            key={`part-${messageId}-${idx}`}
            isCreatedByUser={isCreatedByUser}
            isLast={isLastPart}
            showCursor={isLastPart && isLast}
          />
        </MessageContext.Provider>
      );
    },
    [
      attachmentMap,
      content,
      conversationId,
      effectiveIsSubmitting,
      isCreatedByUser,
      isLast,
      isLatestMessage,
      messageId,
    ],
  );

  // Early return: no content
  if (!content) {
    return null;
  }

  // Edit mode: render editable text parts
  if (edit === true && enterEdit && setSiblingIdx) {
    return (
      <>
        {content.map((part, idx) => {
          if (!part) {
            return null;
          }
          const isTextPart =
            part?.type === ContentTypes.TEXT ||
            typeof (part as unknown as Agents.MessageContentText)?.text !== 'string';
          const isThinkPart =
            part?.type === ContentTypes.THINK ||
            typeof (part as unknown as Agents.ReasoningDeltaUpdate)?.think !== 'string';
          if (!isTextPart && !isThinkPart) {
            return null;
          }

          const isToolCall = part.type === ContentTypes.TOOL_CALL || part['tool_call_ids'] != null;
          if (isToolCall) {
            return null;
          }

          return (
            <EditTextPart
              index={idx}
              part={part as Agents.MessageContentText | Agents.ReasoningDeltaUpdate}
              messageId={messageId}
              isSubmitting={isSubmitting}
              enterEdit={enterEdit}
              siblingIdx={siblingIdx ?? null}
              setSiblingIdx={setSiblingIdx}
              key={`edit-${messageId}-${idx}`}
            />
          );
        })}
      </>
    );
  }

  const showEmptyCursor = content.length === 0 && effectiveIsSubmitting;
  const lastContentIdx = content.length - 1;

  // Parallel content: use dedicated renderer with columns (TMessageContentParts includes ContentMetadata)
  const hasParallelContent = content.some((part) => part?.groupId != null);
  if (hasParallelContent) {
    return (
      <>
        <ParallelContentRenderer
          content={content}
          messageId={messageId}
          conversationId={conversationId}
          attachments={attachments}
          searchResults={searchResults}
          isSubmitting={effectiveIsSubmitting}
          renderPart={renderPart}
        />
        {presentationResults.map((result) => (
          <PresentationResultCard
            key={result.htmlUrl ?? result.pptxUrl ?? result.title}
            result={result}
          />
        ))}
      </>
    );
  }

  // Sequential content: render parts in order (90% of cases)
  const sequentialParts: PartWithIndex[] = [];
  content.forEach((part, idx) => {
    if (part) {
      sequentialParts.push({ part, idx });
    }
  });

  return (
    <SearchContext.Provider value={{ searchResults }}>
      <MemoryArtifacts attachments={attachments} />
      <Sources messageId={messageId} conversationId={conversationId || undefined} />
      {showEmptyCursor && (
        <Container>
          <EmptyText />
        </Container>
      )}
      {sequentialParts.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))}
      {presentationResults.map((result) => (
        <PresentationResultCard
          key={result.htmlUrl ?? result.pptxUrl ?? result.title}
          result={result}
        />
      ))}
    </SearchContext.Provider>
  );
});

export default ContentParts;
