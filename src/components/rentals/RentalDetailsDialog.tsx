'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Heart, ExternalLink, ChevronLeft, ChevronRight, MapPin, Home, Bed, Bath, Droplet, TreePine } from 'lucide-react';
import { RankingWidget } from './RankingWidget';
import { CommentsList } from './CommentsList';
import { toast } from 'sonner';

interface RentalListing {
  id: number;
  siteName: string;
  siteUrl: string;
  listingUrl: string;
  title: string;
  description: string;
  price: string;
  priceNumeric: number;
  bedrooms: number;
  bathrooms: number;
  hasPool: 0 | 1;
  hasGarden: 0 | 1;
  propertyType: string;
  location: string;
  images: string[];
  amenities: string[];
  scrapedAt: Date;
  isFavorited?: 0 | 1;
  userRating?: number | null;
  userRatingNotes?: string | null;
}

interface RentalDetailsDialogProps {
  listing: RentalListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFavoriteToggle?: () => void;
}

export function RentalDetailsDialog({
  listing,
  open,
  onOpenChange,
  onFavoriteToggle,
}: RentalDetailsDialogProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);

  useEffect(() => {
    if (listing) {
      setIsFavorited(listing.isFavorited === 1);
      setCurrentImageIndex(0); // Reset image carousel when listing changes
    }
  }, [listing]);

  if (!listing) return null;

  const images = listing.images && listing.images.length > 0
    ? listing.images
    : ['/placeholder-house.jpg'];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const toggleFavorite = async () => {
    setIsTogglingFavorite(true);
    try {
      const method = isFavorited ? 'DELETE' : 'POST';
      const response = await fetch(`/api/rentals/${listing.id}/favorite`, {
        method,
      });

      if (response.ok) {
        setIsFavorited(!isFavorited);
        toast.success(isFavorited ? 'Removed from favorites' : 'Added to favorites');
        onFavoriteToggle?.();
      } else {
        throw new Error('Failed to toggle favorite');
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      toast.error('Failed to update favorite');
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg pr-8">{listing.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Image Carousel */}
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-surface-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[currentImageIndex]}
              alt={`${listing.title} - Image ${currentImageIndex + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder-house.jpg';
              }}
            />

            {images.length > 1 && (
              <>
                {/* Navigation Buttons */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {/* Image Counter */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
                  {currentImageIndex + 1} / {images.length}
                </div>
              </>
            )}

            {/* Favorite Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFavorite}
              disabled={isTogglingFavorite}
              className="absolute top-2 right-2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70"
            >
              <Heart
                className={`h-5 w-5 ${
                  isFavorited ? 'fill-red-500 text-red-500' : 'text-white'
                }`}
              />
            </Button>
          </div>

          {/* Image Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                    index === currentImageIndex
                      ? 'border-primary'
                      : 'border-transparent hover:border-border'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={`Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-house.jpg';
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          {/* Price and Quick Info */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xl font-bold text-foreground">{listing.price}</div>
              <div className="flex items-center gap-4 mt-2 text-sm text-secondary">
                {listing.bedrooms > 0 && (
                  <div className="flex items-center gap-1">
                    <Bed className="h-4 w-4" />
                    <span>{listing.bedrooms} bed{listing.bedrooms !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {listing.bathrooms > 0 && (
                  <div className="flex items-center gap-1">
                    <Bath className="h-4 w-4" />
                    <span>{listing.bathrooms} bath{listing.bathrooms !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {listing.hasPool === 1 && (
                  <div className="flex items-center gap-1">
                    <Droplet className="h-4 w-4" />
                    <span>Pool</span>
                  </div>
                )}
                {listing.hasGarden === 1 && (
                  <div className="flex items-center gap-1">
                    <TreePine className="h-4 w-4" />
                    <span>Garden</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={() => window.open(listing.listingUrl, '_blank')}
              className="gap-2"
              size="sm"
            >
              View on {listing.siteName}
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>

          {/* Location and Property Type */}
          <div className="flex items-center gap-4 text-sm">
            {listing.location && (
              <div className="flex items-center gap-1 text-secondary">
                <MapPin className="h-4 w-4" />
                <span>{listing.location}</span>
              </div>
            )}
            {listing.propertyType && (
              <div className="flex items-center gap-1 text-secondary">
                <Home className="h-4 w-4" />
                <span>{listing.propertyType}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
              <p className="text-sm text-secondary whitespace-pre-wrap">{listing.description}</p>
            </div>
          )}

          {/* Amenities */}
          {listing.amenities && listing.amenities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Amenities</h3>
              <div className="flex flex-wrap gap-2">
                {listing.amenities.map((amenity, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-surface-secondary text-secondary text-xs rounded-md border border-border"
                  >
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rating Widget */}
          <div className="border-t border-border pt-4">
            <RankingWidget
              listingId={listing.id}
              initialRating={listing.userRating}
              initialNotes={listing.userRatingNotes}
            />
          </div>

          {/* Comments */}
          <div className="border-t border-border pt-4">
            <CommentsList listingId={listing.id} />
          </div>

          {/* Source Info */}
          <div className="text-xs text-secondary text-center pb-2">
            Scraped from {listing.siteName} on {new Date(listing.scrapedAt).toLocaleDateString()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
