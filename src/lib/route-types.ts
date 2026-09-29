/** One way to walk from A to B, as [lat, lng] points. The distance and time are null for a straight line. */
export interface RouteOption {
  polyline: [number, number][];
  distanceMeters: number | null;
  durationSeconds: number | null;
}

/**
 * What POST /api/route answers. `fallback` is true when the router did not
 * answer: `routes` is then one straight line from A to B, which the screen
 * labels as such. Types only, so client code never imports the server route.
 */
export interface RouteResponse {
  routes: RouteOption[];
  fallback: boolean;
}
