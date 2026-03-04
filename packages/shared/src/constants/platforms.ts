import { Platform } from "../types/platform";

export const PLATFORM_LABELS: Record<Platform, string> = {
  [Platform.RESY]: "Resy",
  [Platform.OPENTABLE]: "OpenTable",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  [Platform.RESY]: "#e53e3e",
  [Platform.OPENTABLE]: "#e8a818",
};

export const RESY_BASE_URL = "https://api.resy.com";
export const OPENTABLE_BASE_URL = "https://www.opentable.com/widget/reservation/counts";
