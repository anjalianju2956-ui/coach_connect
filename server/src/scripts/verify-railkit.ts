const requests: string[] = [];

globalThis.fetch = async (input) => {
  requests.push(String(input));
  await new Promise((resolve) => setTimeout(resolve, 5));
  return new Response(
    JSON.stringify({
      data: {
        train_name: "Mock Train",
        route: [
          { station_code: "AAA", station_name: "Alpha", lat: 10, lng: 20, distance: 0 },
          { station_code: "BBB", station_name: "Beta", lat: 11, lng: 21, distance: 100 },
        ],
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  const [{ env }, { railkit, railkitUsage }, { getTrainLive, getTrainRoute }, { ensureRouteCoordinates }] =
    await Promise.all([
      import("../config/env"),
      import("../services/railkitService"),
      import("../services/trainRouteService"),
      import("../services/stationService"),
    ]);

  if (!env.railkit.enabled) {
    const { route } = await getTrainRoute("12951");
    check("demo route 12951 remains available when RailKit is disabled", route.source === "demo");

    const live = await getTrainLive("12951");
    check(
      "live train fallback is clearly labelled demo data with station and route details",
      live.payload?.source === "DEMO" &&
        live.payload.currentLocation?.code === "MMCT" &&
        live.payload.nextStation?.code === "BVI" &&
        Array.isArray(live.payload.route),
    );

    let disabled = false;
    try {
      await railkit.trainInfo("12951");
    } catch (error) {
      disabled = (error as { code?: string }).code === "CONFIGURATION_REQUIRED";
    }
    check("direct RailKit calls are rejected when disabled", disabled);
    check("disabled mode makes zero RailKit requests", requests.length === 0);
    return;
  }

  const [first, concurrent] = await Promise.all([
    railkit.trainInfo("12951"),
    railkit.trainInfo("12951"),
  ]);
  check("concurrent identical requests share one RailKit call", requests.length === 1);
  check(
    "concurrent callers receive the same uncached result",
    !first.cached && !concurrent.cached && first.value === concurrent.value,
  );

  const cached = await railkit.trainInfo("12951");
  check("a later train lookup reuses the cache", cached.cached && requests.length === 1);

  const route = await getTrainRoute("12951");
  check("route metadata reports the cached train response", route.cached && route.route.source === "railkit");

  const coordinateResult = await ensureRouteCoordinates(route.route);
  check(
    "routes with coordinates make no station enrichment requests",
    coordinateResult.warnings.length === 0 && requests.length === 1,
  );

  const [station, concurrentStation] = await Promise.all([
    railkit.stationByCode("AAA"),
    railkit.stationByCode("AAA"),
  ]);
  check("concurrent station lookups share one RailKit call", requests.length === 2);
  check(
    "concurrent station callers receive the same result",
    !station.cached && !concurrentStation.cached && station.value === concurrentStation.value,
  );

  const cachedStation = await railkit.stationByCode("AAA");
  check("a later station lookup reuses the cache", cachedStation.cached && requests.length === 2);

  let exhausted = false;
  try {
    await railkit.stationByCode("CCC");
  } catch (error) {
    exhausted = (error as { code?: string; status?: number }).code === "RAILKIT_QUOTA_EXHAUSTED" &&
      (error as { status?: number }).status === 429;
  }
  check("exhausted monthly budget returns a clear 429 error", exhausted);
  check("quota exhaustion makes no extra RailKit request", requests.length === 2);
  check("usage counter counts only the attempted requests", railkitUsage().used === 2);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
