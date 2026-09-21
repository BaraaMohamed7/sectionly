import { isValid } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const INSTITUTIONAL_TIME_ZONE = "Africa/Cairo";
const DATE_TIME_INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

export function parseCairoDateTime(value: string) {
  const date = fromZonedTime(value, INSTITUTIONAL_TIME_ZONE);

  if (
    !isValid(date) ||
    formatInTimeZone(date, INSTITUTIONAL_TIME_ZONE, DATE_TIME_INPUT_FORMAT) !==
      value
  ) {
    throw new RangeError("Invalid Africa/Cairo date and time");
  }

  return date;
}

export function formatCairoDateTimeInput(date: Date) {
  return formatInTimeZone(
    date,
    INSTITUTIONAL_TIME_ZONE,
    DATE_TIME_INPUT_FORMAT,
  );
}
