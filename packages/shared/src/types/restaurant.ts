export interface AutocompleteResult {
  placeId: string;
  description: string;
  structuredFormatting: {
    mainText: string;
    secondaryText: string;
  };
}

export interface GooglePlace {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  priceLevel?: number; // 0-4
  photoReference?: string;
  types: string[];
  location: {
    lat: number;
    lng: number;
  };
}

export interface PlaceDetails extends GooglePlace {
  phoneNumber?: string;
  website?: string;
  openingHours?: {
    openNow: boolean;
    weekdayText: string[];
  };
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number;
  }>;
}
