'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface RankingWidgetProps {
  listingId: number;
  initialRating?: number | null;
  initialNotes?: string | null;
  onRatingChange?: (rating: number, notes: string) => void;
}

export function RankingWidget({
  listingId,
  initialRating = null,
  initialNotes = null,
  onRatingChange,
}: RankingWidgetProps) {
  const [rating, setRating] = useState<number>(initialRating || 0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [notes, setNotes] = useState<string>(initialNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Check if there are changes from initial values
    const ratingChanged = rating !== (initialRating || 0);
    const notesChanged = notes !== (initialNotes || '');
    setHasChanges(ratingChanged || notesChanged);
  }, [rating, notes, initialRating, initialNotes]);

  const handleStarClick = (starRating: number) => {
    setRating(starRating);
  };

  const handleSave = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    if (notes.length > 2000) {
      toast.error('Notes cannot exceed 2000 characters');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/rentals/${listingId}/ranking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          notes: notes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save rating');
      }

      toast.success('Rating saved successfully');
      setHasChanges(false);
      onRatingChange?.(rating, notes);
    } catch (error) {
      console.error('Failed to save rating:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save rating');
    } finally {
      setIsSaving(false);
    }
  };

  const displayRating = hoveredRating || rating;

  return (
    <div className="space-y-4">
      {/* Star Rating */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Your Rating</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => handleStarClick(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary rounded-sm p-0.5"
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  star <= displayRating
                    ? 'fill-yellow-500 text-yellow-500'
                    : 'text-secondary hover:text-yellow-300'
                }`}
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="ml-2 text-sm text-secondary">
              {rating} star{rating !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-2">
        <label htmlFor="ranking-notes" className="text-sm font-medium text-foreground">
          Notes (optional)
        </label>
        <Textarea
          id="ranking-notes"
          placeholder="Add your thoughts about this property..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          className="text-xs resize-none"
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-secondary">
            {notes.length}/2000 characters
          </span>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <Button
          onClick={handleSave}
          disabled={isSaving || rating === 0}
          className="w-full"
          size="sm"
        >
          {isSaving ? 'Saving...' : 'Save Rating'}
        </Button>
      )}
    </div>
  );
}
