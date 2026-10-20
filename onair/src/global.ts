export type CATALOG_TYPE =
  | "ENTERTAINMENT"
  | "SPORTS"
  | "MOVIES"
  | "NEWS"
  | "INTERNATIONAL"
  | "RADIO"
  | "RELIGIOUS"
  | "DOCUMENTARY"
  | "MUSIC"
  | "KIDS"
  | "SHOPPING"
  | "LIFESTYLE"
  | "CLASSIC_TV"
  | "CRIME"
  | "ADULT"
  | "OUTDOORS_AUTO";
export const catalogTypes: CATALOG_TYPE[] = [
  "ENTERTAINMENT",
  "SPORTS",
  "MOVIES",
  "NEWS",
  "INTERNATIONAL",
  "RADIO",
  "RELIGIOUS",
  "DOCUMENTARY",
  "MUSIC",
  "KIDS",
  "SHOPPING",
  "LIFESTYLE",
  "CLASSIC_TV",
  "CRIME",
  "OUTDOORS_AUTO",
];

export function toReadableString(catalogType: CATALOG_TYPE) {
  return capitalize(
    catalogType
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1))
      .join(" "),
  );
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
