import { useState } from 'react';
import { getLangfuseWeb } from '../../lib/langfuse';

interface FeedbackButtonsProps {
  messageId: string;
  traceId?: string;
}

export function FeedbackButtons({ traceId }: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');

  const submitFeedback = async (value: 1 | 0, commentText?: string) => {
    if (!traceId || isSubmitting) return;

    const langfuse = getLangfuseWeb();
    if (!langfuse) return;

    setIsSubmitting(true);

    try {
      await langfuse.score({
        traceId,
        name: 'user-feedback',
        value,
        comment: commentText || undefined,
      });

      setFeedback(value === 1 ? 'positive' : 'negative');
      setShowCommentBox(false);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      setFeedback(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePositiveFeedback = () => {
    submitFeedback(1);
  };

  const handleNegativeFeedback = () => {
    if (!showCommentBox && feedback === null) {
      setShowCommentBox(true);
    } else if (showCommentBox) {
      submitFeedback(0, comment);
    }
  };

  if (!traceId) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        onClick={handlePositiveFeedback}
        disabled={feedback !== null || isSubmitting}
        className={`p-1.5 rounded transition-colors ${
          feedback === 'positive'
            ? 'text-green-600 bg-green-50'
            : 'text-gray-400 hover:text-green-600 hover:bg-gray-50'
        } ${feedback !== null ? 'cursor-default' : 'disabled:cursor-not-allowed'}`}
        title="Helpful response"
        aria-label="Thumbs up"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
        </svg>
      </button>

      <button
        onClick={handleNegativeFeedback}
        disabled={feedback !== null || isSubmitting}
        className={`p-1.5 rounded transition-colors ${
          feedback === 'negative'
            ? 'text-red-600 bg-red-50'
            : 'text-gray-400 hover:text-red-600 hover:bg-gray-50'
        } ${feedback !== null ? 'cursor-default' : 'disabled:cursor-not-allowed'}`}
        title="Not helpful"
        aria-label="Thumbs down"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
        </svg>
      </button>

      {feedback !== null && (
        <span className="text-xs text-gray-500">
          {feedback === 'positive' ? 'Dziękujemy!' : 'Dziękujemy za opinię'}
        </span>
      )}

      {showCommentBox && feedback === null && (
        <div className="flex-1 flex gap-2 items-center">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Co można poprawić? (opcjonalnie)"
            className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleNegativeFeedback();
              }
            }}
          />
          <button
            onClick={handleNegativeFeedback}
            disabled={isSubmitting}
            className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Wyślij
          </button>
        </div>
      )}
    </div>
  );
}
