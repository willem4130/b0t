'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Home, Heart, Star, Search, RefreshCw } from 'lucide-react';
import { RentalListingsTable } from '@/components/rentals/RentalListingsTable';
import { RentalDetailsDialog } from '@/components/rentals/RentalDetailsDialog';

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

interface Stats {
  totalListings: number;
  totalFavorites: number;
  avgRating: number;
}

export default function RentalsPage() {
  const [selectedListing, setSelectedListing] = useState<RentalListing | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalListings: 0,
    totalFavorites: 0,
    avgRating: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    bedrooms: 'all',
    minPrice: '',
    maxPrice: '',
    favoritesOnly: false,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/rentals?limit=1');
      const data = await response.json();
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleRowClick = (listing: RentalListing) => {
    setSelectedListing(listing);
    setDialogOpen(true);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    // The table will refresh itself
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    // Refresh stats when dialog closes (in case favorites/ratings changed)
    fetchStats();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Aruba Rental Listings</h1>
            <p className="text-sm text-secondary mt-1">
              Browse and manage rental properties in Aruba
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
              <Home className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalListings}</div>
              <p className="text-xs text-secondary mt-1">
                Available properties
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Favorites</CardTitle>
              <Heart className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFavorites}</div>
              <p className="text-xs text-secondary mt-1">
                Properties you liked
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
              <Star className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—'}
              </div>
              <p className="text-xs text-secondary mt-1">
                {stats.avgRating > 0 ? 'Your average rating' : 'No ratings yet'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search" className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-4 w-4 text-secondary" />
                  <Input
                    id="search"
                    placeholder="Title, location..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Bedrooms */}
              <div className="space-y-2">
                <Label htmlFor="bedrooms" className="text-xs">Bedrooms</Label>
                <Select
                  value={filters.bedrooms}
                  onValueChange={(value) => setFilters({ ...filters, bedrooms: value })}
                >
                  <SelectTrigger id="bedrooms" className="h-8 text-xs">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="1">1+</SelectItem>
                    <SelectItem value="2">2+</SelectItem>
                    <SelectItem value="3">3+</SelectItem>
                    <SelectItem value="4">4+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Min Price */}
              <div className="space-y-2">
                <Label htmlFor="minPrice" className="text-xs">Min Price</Label>
                <Input
                  id="minPrice"
                  type="number"
                  placeholder="e.g. 1000"
                  value={filters.minPrice}
                  onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              {/* Max Price */}
              <div className="space-y-2">
                <Label htmlFor="maxPrice" className="text-xs">Max Price</Label>
                <Input
                  id="maxPrice"
                  type="number"
                  placeholder="e.g. 5000"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Favorites Only Toggle */}
            <div className="mt-4">
              <Button
                onClick={() => setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })}
                variant={filters.favoritesOnly ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
              >
                <Heart className={`h-4 w-4 ${filters.favoritesOnly ? 'fill-current' : ''}`} />
                {filters.favoritesOnly ? 'Showing Favorites Only' : 'Show Favorites Only'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Listings Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <RentalListingsTable onRowClick={handleRowClick} />
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <RentalDetailsDialog
          listing={selectedListing}
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          onFavoriteToggle={fetchStats}
        />
      </div>
    </DashboardLayout>
  );
}
