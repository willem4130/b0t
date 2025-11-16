'use client';

import { useState, useEffect } from 'react';
import { Trash2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Comment {
  id: number;
  listingId: number;
  userId: string;
  comment: string;
  createdAt: string;
}

interface CommentsListProps {
  listingId: number;
  onCommentChange?: () => void;
}

export function CommentsList({ listingId, onCommentChange }: CommentsListProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/rentals/${listingId}/comment`);
      const data = await response.json();

      if (response.ok && data.success) {
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      toast.error('Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      toast.error('Comment cannot be empty');
      return;
    }

    if (newComment.length > 5000) {
      toast.error('Comment cannot exceed 5000 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/rentals/${listingId}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: newComment.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add comment');
      }

      toast.success('Comment added successfully');
      setNewComment('');
      await fetchComments();
      onCommentChange?.();
    } catch (error) {
      console.error('Failed to add comment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    setDeletingId(commentId);
    try {
      const response = await fetch(`/api/rentals/${listingId}/comment?commentId=${commentId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete comment');
      }

      toast.success('Comment deleted successfully');
      setComments(prevComments => prevComments.filter(c => c.id !== commentId));
      onCommentChange?.();
    } catch (error) {
      console.error('Failed to delete comment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete comment');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-secondary">Loading comments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comments Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Comments {comments.length > 0 && `(${comments.length})`}
        </h3>
      </div>

      {/* Add Comment Form */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add your notes or thoughts about this property..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          maxLength={5000}
          rows={3}
          className="text-xs resize-none"
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-secondary">
            {newComment.length}/5000 characters
          </span>
          <Button
            onClick={handleAddComment}
            disabled={isSubmitting || !newComment.trim()}
            size="sm"
            className="gap-2"
          >
            <MessageSquarePlus className="h-3 w-3" />
            {isSubmitting ? 'Adding...' : 'Add Comment'}
          </Button>
        </div>
      </div>

      {/* Comments List */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-secondary text-xs">
            No comments yet. Be the first to add one!
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="p-3 rounded-md bg-surface-secondary border border-border space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-foreground flex-1 whitespace-pre-wrap break-words">
                  {comment.comment}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteComment(comment.id)}
                  disabled={deletingId === comment.id}
                  className="h-6 w-6 p-0 flex-shrink-0"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              <div className="text-[10px] text-secondary">
                {formatDate(comment.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
