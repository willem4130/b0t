'use client';

import { useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  ColumnDef,
  flexRender,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Star, ArrowUpDown, ChevronLeft, ChevronRight, Bed, Bath, ExternalLink } from 'lucide-react';
import { LoadingState } from '@/components/ui/empty-state';

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
  commentsCount?: number;
}

interface RentalListingsResponse {
  listings: RentalListing[];
  stats?: {
    totalListings: number;
    totalFavorites: number;
    avgRating: number;
  };
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const formatPrice = (price: string): string => {
  // Try to extract numeric value if present
  const match = price.match(/[\d,]+/);
  if (match) {
    const num = parseInt(match[0].replace(/,/g, ''));
    return `$${formatNumber(num)}`;
  }
  return price;
};

interface RentalListingsTableProps {
  onRowClick?: (listing: RentalListing) => void;
}

export function RentalListingsTable({ onRowClick }: RentalListingsTableProps) {
  const [data, setData] = useState<RentalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'scrapedAt', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/rentals?limit=100');
      const result: RentalListingsResponse = await response.json();
      if (result.listings) {
        setData(result.listings);
      }
    } catch (error) {
      console.error('Failed to fetch rental listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (listingId: number, isFavorited: boolean) => {
    try {
      const method = isFavorited ? 'DELETE' : 'POST';
      const response = await fetch(`/api/rentals/${listingId}/favorite`, {
        method,
      });

      if (response.ok) {
        // Update local state
        setData(prevData =>
          prevData.map(listing =>
            listing.id === listingId
              ? { ...listing, isFavorited: isFavorited ? 0 : 1 }
              : listing
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const columns: ColumnDef<RentalListing>[] = [
    {
      id: 'image',
      header: '',
      cell: ({ row }) => {
        const images = row.original.images || [];
        const imageUrl = images[0] || '/placeholder-house.jpg';
        return (
          <div className="w-16 h-16 rounded-md overflow-hidden bg-surface-secondary flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={row.original.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder-house.jpg';
              }}
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'title',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Title
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <div className="max-w-[300px]">
            <p className="text-xs font-medium text-foreground line-clamp-2">{row.original.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] text-secondary line-clamp-1">{row.original.location}</p>
              {row.original.propertyType && (
                <span className="text-[10px] text-secondary px-1.5 py-0.5 bg-surface-secondary rounded">
                  {row.original.propertyType}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'priceNumeric',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Price
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <div className="text-xs font-semibold text-foreground">
            {formatPrice(row.original.price)}
          </div>
        );
      },
    },
    {
      accessorKey: 'bedrooms',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            <Bed className="h-3 w-3" />
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <div className="text-xs text-secondary text-center">
            {row.original.bedrooms || 'N/A'}
          </div>
        );
      },
    },
    {
      accessorKey: 'bathrooms',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            <Bath className="h-3 w-3" />
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <div className="text-xs text-secondary text-center">
            {row.original.bathrooms || 'N/A'}
          </div>
        );
      },
    },
    {
      id: 'favorite',
      header: () => <div className="text-center"><Heart className="h-3 w-3 inline" /></div>,
      cell: ({ row }) => {
        const isFavorited = row.original.isFavorited === 1;
        return (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(row.original.id, isFavorited);
              }}
            >
              <Heart
                className={`h-4 w-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-secondary'}`}
              />
            </Button>
          </div>
        );
      },
    },
    {
      accessorKey: 'userRating',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-bold"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            <Star className="h-3 w-3" />
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const rating = row.original.userRating;
        if (!rating) {
          return <div className="text-xs text-secondary text-center">-</div>;
        }
        return (
          <div className="flex items-center justify-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-3 w-3 ${
                  star <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-secondary'
                }`}
              />
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        return (
          <div className="flex justify-end">
            <a
              href={row.original.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (loading) {
    return <LoadingState message="Loading rental listings..." />;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-secondary text-sm mb-2">No rental listings found</div>
        <p className="text-xs text-secondary">Run the Aruba scraper workflow to populate listings</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by title, location, or property type..."
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm h-8 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={fetchListings}
          className="h-8 px-3 text-xs"
        >
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-9">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={() => onRowClick?.(row.original)}
                  className="cursor-pointer hover:bg-surface-secondary"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="text-sm text-secondary">No results found</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-secondary">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            table.getFilteredRowModel().rows.length
          )}{' '}
          of {table.getFilteredRowModel().rows.length} results
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 px-3 text-xs"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <div className="text-xs text-secondary">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 px-3 text-xs"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
